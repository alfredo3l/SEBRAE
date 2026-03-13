/* ============================================
   SEBRAE - Integração via Serverless Function (Vercel)
   Rota: /api/sebrae/query
   URL relativa funciona em qualquer ambiente:
   local (dev.js), Vercel, celular, etc.
   ============================================ */

const SEBRAE_PROXY = '';

/**
 * Formata CPF para o padrão 000.000.000-00
 */
function formatarCPFSebrae(valor) {
    const nums = valor.replace(/\D/g, '');
    if (nums.length === 11) {
        return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return valor;
}

/**
 * Detecta se o termo digitado parece um CPF.
 */
function pareceCPF(termo) {
    const nums = termo.replace(/\D/g, '');
    return nums.length >= 8 && nums.length <= 11 && /^\d+$/.test(nums);
}

/**
 * Detecta se o termo digitado parece um telefone.
 */
function pareceTelefone(termo) {
    const nums = termo.replace(/\D/g, '');
    return /^[\d\s\(\)\-\+]+$/.test(termo) && nums.length >= 6;
}

/**
 * Busca contatos na API SEBRAE/Salesforce via proxy local.
 * - Se parece CPF  → busca exata por CPF__c
 * - Se parece tel  → busca por Phone / MobilePhone
 * - Caso contrário → busca por Name (LIKE)
 *
 * Para evitar que a tela pareça "travada" quando a API demora a responder
 * (principalmente em buscas por nome ou telefone), foi adicionado:
 * - Timeout com AbortController (15s)
 * - Limite menor de registros para buscas não indexadas (nome/telefone)
 */
async function buscarContatosSebrae(termo) {
    let whereClause;
    let limit = 200;

    if (pareceCPF(termo)) {
        const cpfFormatado = formatarCPFSebrae(termo);
        whereClause = `CPF__c = '${cpfFormatado}'`;
        limit = 200;
    } else if (pareceTelefone(termo)) {
        const tel = termo.replace(/\D/g, '');
        whereClause = `Phone LIKE '%${tel}%' OR MobilePhone LIKE '%${tel}%'`;
        limit = 50;
    } else {
        const escaped = termo.replace(/'/g, "\\'");
        whereClause = `Name LIKE '%${escaped}%'`;
        limit = 50;
    }

    const query = `SELECT FIELDS(ALL) FROM Contact WHERE ${whereClause} LIMIT ${limit}`;
    const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    // Timeout mais longo para evitar sensação de "travamento" em buscas por nome/telefone
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const resp = await fetch(url, { signal: controller.signal });

        if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            throw new Error(body.error || `Erro na consulta (${resp.status})`);
        }

        return await resp.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('A busca demorou mais que o normal e foi interrompida para não travar a tela. Nenhuma consulta está em andamento neste momento. Tente refinar a busca (ex: CPF completo ou telefone com DDD).');
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Retorna o valor do campo LGPD do registro Salesforce
 * (tenta vários nomes de campo possíveis).
 */
function obterCampoLGPD(record) {
    if (!record) return null;
    const candidatos = Object.keys(record).filter(k =>
        k.toUpperCase().includes('LGPD') ||
        k.toUpperCase().includes('TERMO') ||
        k.toUpperCase().includes('ACEITE')
    );
    for (const campo of candidatos) {
        if (record[campo] !== null && record[campo] !== undefined) {
            return record[campo];
        }
    }
    return null;
}

/**
 * Mapeia um registro Salesforce Contact para o formato da tabela do modal.
 */
function mapearContatoParaTabela(record) {
    return {
        id_contato_salesforce: record.Id,
        account_id: record.AccountId || null,
        nome: record.Name || '—',
        cpf: record.CPF__c || '—',
        telefone: record.Phone || record.MobilePhone || null,
        email: record.Email || null,
        lgpd: obterCampoLGPD(record),
    };
}

/**
 * Atualiza o telefone do Contact no Salesforce/FOCO via proxy.
 * contactId: Id do Contact (18 caracteres)
 * telefone: valor do campo Phone (ex: "(67)99999-9999")
 * Retorna { ok: true } em sucesso (204). Em erro lança ou retorna { ok: false, error, status }.
 */
async function atualizarTelefoneContactSebrae(contactId, telefone) {
    const url = `${SEBRAE_PROXY}/api/sebrae/contact/${encodeURIComponent(contactId)}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Phone: telefone })
    });
    if (resp.ok) {
        return { ok: true };
    }
    const body = await resp.json().catch(() => ({}));
    const err = new Error(body.error || body.body?.message || `Erro ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
}

/**
 * Busca o Contact Id no Salesforce.
 * Tenta na ordem:
 *   1. Por AccountId (id_salesforce) — mais confiável pois já está armazenado
 *   2. Por CPF__c — fallback
 * Retorna o Id do Contact (string) ou null se não encontrado.
 */
async function buscarContactIdSalesforce(cpf, accountId) {
    async function executarQuery(soql) {
        const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(soql)}`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const data = await resp.json();
            const records = data.records || [];
            return records[0]?.Id || null;
        } catch {
            return null;
        }
    }

    // Tentativa 1: busca pelo AccountId (mais rápido e confiável)
    if (accountId && accountId !== '-') {
        const idEscaped = accountId.replace(/'/g, "\\'");
        const id = await executarQuery(`SELECT Id FROM Contact WHERE AccountId = '${idEscaped}' LIMIT 1`);
        if (id) return id;
    }

    // Tentativa 2: busca pelo CPF__c
    if (cpf && cpf !== '—') {
        const cpfFormatado = formatarCPFSebrae(cpf.replace(/\D/g, ''));
        if (cpfFormatado.length >= 14) {
            const cpfEscaped = cpfFormatado.replace(/'/g, "\\'");
            const id = await executarQuery(`SELECT Id FROM Contact WHERE CPF__c = '${cpfEscaped}' LIMIT 1`);
            if (id) return id;
        }
    }

    return null;
}

/**
 * Busca o ID do parceiro no Supabase pelo CPF para redirecionar ao detalhe.
 * Retorna o ID ou null se não encontrado.
 */
async function buscarIdSupabasePorCPF(cpf) {
    if (!cpf || cpf === '—') return null;
    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('id')
        .eq('cpf', cpf)
        .maybeSingle();

    if (error || !data) return null;
    return data.id;
}
