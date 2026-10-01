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
 * Detecta se o termo digitado parece um CPF. Antes, qualquer número de 8 a 11
 * dígitos era tratado como CPF — inclusive "(67)99288-6950" —, e a busca por
 * telefone nunca acontecia. Agora: parênteses/"+" = telefone; formato
 * 000.000.000-00 = CPF; 11 dígitos corridos = CPF só se os dígitos
 * verificadores baterem (celular com DDD também tem 11 dígitos).
 */
function pareceCPF(termo) {
    const t = String(termo).trim();
    if (/[()+]/.test(t)) return false;
    const nums = t.replace(/\D/g, '');
    if (nums.length !== 11) return false;
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t)) return true;
    return /^\d{11}$/.test(t) && cpfDigitosValidos(nums);
}

/** Confere os dois dígitos verificadores de um CPF de 11 dígitos */
function cpfDigitosValidos(nums) {
    if (/^(\d)\1{10}$/.test(nums)) return false;
    const dv = (base) => {
        const soma = [...base].reduce((s, n, i) => s + Number(n) * (base.length + 1 - i), 0);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(nums.slice(0, 9)) === Number(nums[9]) && dv(nums.slice(0, 10)) === Number(nums[10]);
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
 * (principalmente em buscas por telefone), cada consulta tem tempo-limite
 * (AbortController, 60 s) e as buscas não indexadas trazem só os campos básicos.
 */
async function buscarContatosSebrae(termo) {
    if (pareceCPF(termo)) {
        const cpfFormatado = formatarCPFSebrae(termo);
        return consultarContatosFoco(`SELECT FIELDS(ALL) FROM Contact WHERE CPF__c = '${cpfFormatado}' LIMIT 200`);
    }

    if (pareceTelefone(termo)) {
        // Telefone não tem índice no FOCO: a busca leva ~30 s (medido em 01/10/2026)
        const padroes = padroesTelefoneFoco(termo);
        const where = padroes.map(p => `Phone LIKE '${p}' OR MobilePhone LIKE '${p}'`).join(' OR ');
        return consultarContatosFoco(`SELECT ${CAMPOS_BUSCA_CONTATO} FROM Contact WHERE ${where} LIMIT 50`);
    }

    // Nome: primeiro "começa com", que usa o índice do FOCO (~0,5 s); só se não
    // achar nada tenta "contém" (sem índice, ~17 s — por isso só campos básicos).
    // FIELDS(ALL) com "contém" passava de 40 s e estourava o tempo da tela.
    const nome = escaparLikeSOQL(termo.trim());
    const porInicio = await consultarContatosFoco(`SELECT FIELDS(ALL) FROM Contact WHERE Name LIKE '${nome}%' LIMIT 50`);
    if ((porInicio.records || []).length) return porInicio;
    return consultarContatosFoco(`SELECT ${CAMPOS_BUSCA_CONTATO} FROM Contact WHERE Name LIKE '%${nome}%' LIMIT 50`);
}

/** Campos que a lista de resultados da busca usa (ver mapearContatoParaTabela) */
const CAMPOS_BUSCA_CONTATO = 'Id, AccountId, Name, CPF__c, Phone, MobilePhone, Email, TermoAceiteLGPD__c';

/** Escapa aspas, barra e os curingas % e _ para um LIKE do SOQL */
function escaparLikeSOQL(texto) {
    return String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[%_]/g, '\\$&');
}

/**
 * Padrões LIKE para achar um telefone no FOCO, que grava com máscara:
 * "(67)99288-6950" (celular) ou "(67)3389-5349" (fixo). Buscar só os dígitos
 * nunca encontrava ninguém. O padrão "%NNNNN-NNNN%" casa com ou sem DDD;
 * o de dígitos corridos cobre cadastros gravados sem máscara.
 */
function padroesTelefoneFoco(termo) {
    let d = String(termo).replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); // DDI
    const padroes = [`%${d}%`];
    if (d.length >= 8) {
        // 9 ou 11 dígitos: celular (5 antes do hífen); 8 ou 10: fixo (4 antes)
        const antes = (d.length === 9 || d.length === 11) ? d.slice(-9, -4) : d.slice(-8, -4);
        padroes.push(`%${antes}-${d.slice(-4)}%`);
    } else if (d.length > 4) {
        padroes.push(`%${d.slice(0, -4)}-${d.slice(-4)}%`);
    }
    return padroes;
}

/** Executa um SOQL de Contact no proxy com tempo-limite (a tela não pode travar) */
async function consultarContatosFoco(query) {
    const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    // 60 s: a busca por telefone leva ~30 s no FOCO (campo sem índice)
    const timeoutId = setTimeout(() => controller.abort(), 60000);

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
 * Atualiza campos de contato (Phone e/ou Email) do Contact no Salesforce/FOCO
 * via proxy. contactId: Id do Contact (18 caracteres).
 * campos: { Phone?: string, Email?: string }
 * Retorna { ok: true } em sucesso (204); em erro lança com .status/.body.
 */
async function atualizarContatoSebrae(contactId, campos) {
    const url = `${SEBRAE_PROXY}/api/sebrae/contact/${encodeURIComponent(contactId)}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos)
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
 * Atalho legado: atualiza apenas o telefone do Contact.
 */
async function atualizarTelefoneContactSebrae(contactId, telefone) {
    return atualizarContatoSebrae(contactId, { Phone: telefone });
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
 * Busca TODOS os Contacts do CPF no FOCO (um mesmo CPF pode responder por
 * mais de uma conta/CNPJ). Retorna um array de registros — vazio em erro.
 * Campos: Id, Name, CPF__c, Phone, MobilePhone, Email, AccountId,
 * Account.Name e Account.CNPJ__c (o CNPJ vive na conta, não no contato).
 */
async function buscarContatosFocoPorCPF(cpf) {
    if (!cpf) return [];
    const cpfFormatado = formatarCPFSebrae(cpf.replace(/\D/g, ''));
    if (cpfFormatado.length < 14) return [];

    const cpfEscaped = cpfFormatado.replace(/'/g, "\\'");
    const soql = `SELECT Id, Name, CPF__c, Phone, MobilePhone, Email, AccountId, Account.Name, Account.CNPJ__c FROM Contact WHERE CPF__c = '${cpfEscaped}' ORDER BY LastModifiedDate DESC LIMIT 50`;
    const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(soql)}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.records || [];
    } catch {
        return [];
    }
}

/**
 * Escolhe um Contact entre os do CPF, de forma determinística: a conta do
 * próprio cliente (quando informada), senão a primeira que tenha CNPJ, senão
 * a primeira da lista. Sem isso, o "LIMIT 1" devolvia um registro arbitrário.
 */
function escolherContatoFoco(registros, accountPreferido) {
    if (!registros || !registros.length) return null;
    if (accountPreferido) {
        const doCliente = registros.find(r => r.AccountId === accountPreferido);
        if (doCliente) return doCliente;
    }
    return registros.find(r => (r.Account?.CNPJ__c || '').trim()) || registros[0];
}

/**
 * Busca os dados pessoais do Contact no FOCO pelo CPF (fluxo de exemplo:
 * nó "Obtendo dados Pessoais"). Retorna um registro ou null.
 */
async function buscarContatoFocoPorCPF(cpf, accountPreferido) {
    const registros = await buscarContatosFocoPorCPF(cpf);
    return escolherContatoFoco(registros, accountPreferido);
}

/**
 * Extrai a lista de CNPJs vinculados ao CPF a partir dos Contacts do FOCO,
 * sem repetir o mesmo CNPJ. Formato: [{ cnpj, accountId, conta }].
 */
function cnpjsDosContatos(registros) {
    const lista = [];
    const vistos = new Set();

    (registros || []).forEach(r => {
        const cnpj = (r.Account?.CNPJ__c || '').trim();
        if (!cnpj) return;
        const chave = cnpj.replace(/\D/g, '');
        if (vistos.has(chave)) return;
        vistos.add(chave);
        lista.push({ cnpj, accountId: r.AccountId || null, conta: r.Account?.Name || '' });
    });

    return lista;
}

/**
 * Busca a última interação (Case) do cliente no FOCO (fluxo de exemplo:
 * nó "Obtendo Numero da Integração"). Tenta por ContactId; sem ele, usa
 * subquery por CPF. Retorna o registro do Case (CaseNumber etc.) ou null.
 */
async function buscarUltimaInteracaoFoco(contactId, cpf) {
    let whereClause = null;

    if (contactId && contactId !== '-') {
        whereClause = `ContactId = '${contactId.replace(/'/g, "\\'")}'`;
    } else if (cpf) {
        const cpfFormatado = formatarCPFSebrae(cpf.replace(/\D/g, ''));
        if (cpfFormatado.length >= 14) {
            whereClause = `ContactId IN (SELECT Id FROM Contact WHERE CPF__c = '${cpfFormatado.replace(/'/g, "\\'")}')`;
        }
    }
    if (!whereClause) return null;

    const soql = `SELECT Id, CaseNumber, Status, CreatedDate FROM Case WHERE ${whereClause} ORDER BY CreatedDate DESC LIMIT 1`;
    const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(soql)}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        return (data.records && data.records[0]) || null;
    } catch {
        return null;
    }
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
