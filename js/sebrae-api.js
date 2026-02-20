/* ============================================
   SEBRAE - Integração via Proxy Local (porta 3001)
   O proxy evita bloqueio de CORS ao chamar a API Salesforce.
   ============================================ */

const SEBRAE_PROXY = 'http://localhost:3001';

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
 */
async function buscarContatosSebrae(termo) {
    let whereClause;

    if (pareceCPF(termo)) {
        const cpfFormatado = formatarCPFSebrae(termo);
        whereClause = `CPF__c = '${cpfFormatado}'`;
    } else if (pareceTelefone(termo)) {
        const tel = termo.replace(/\D/g, '');
        whereClause = `Phone LIKE '%${tel}%' OR MobilePhone LIKE '%${tel}%'`;
    } else {
        const escaped = termo.replace(/'/g, "\\'");
        whereClause = `Name LIKE '%${escaped}%'`;
    }

    const query = `SELECT FIELDS(ALL) FROM Contact WHERE ${whereClause} LIMIT 200`;
    const url = `${SEBRAE_PROXY}/api/sebrae/query?q=${encodeURIComponent(query)}`;

    const resp = await fetch(url);

    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Erro na consulta (${resp.status})`);
    }

    return await resp.json();
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
