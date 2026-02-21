/* ============================================
   Vercel Serverless Function - Proxy SEBRAE
   Rota: /api/sebrae/query?q=<SOQL>
   Evita CORS ao chamar a API Salesforce/FOCO.
   Variáveis de ambiente necessárias no Vercel:
     SEBRAE_API_BASE
     SEBRAE_CLIENT_ID
     SEBRAE_CLIENT_SECRET
   ============================================ */

const SEBRAE_API_BASE    = process.env.SEBRAE_API_BASE    || 'https://hlg-gateway.sebrae.com.br/foco-stg';
const SEBRAE_CLIENT_ID   = process.env.SEBRAE_CLIENT_ID;
const SEBRAE_CLIENT_SECRET = process.env.SEBRAE_CLIENT_SECRET;

// Cache de token em memória (válido enquanto a instância estiver ativa)
let _token = null;
let _tokenExpiry = null;

async function obterToken() {
    if (_token && _tokenExpiry && Date.now() < _tokenExpiry) {
        return _token;
    }

    const url =
        `${SEBRAE_API_BASE}/services/oauth2/token` +
        `?grant_type=client_credentials` +
        `&client_id=${encodeURIComponent(SEBRAE_CLIENT_ID)}` +
        `&client_secret=${encodeURIComponent(SEBRAE_CLIENT_SECRET)}`;

    const resp = await fetch(url, { method: 'POST' });

    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Falha ao obter token SEBRAE (${resp.status}): ${txt}`);
    }

    const data = await resp.json();
    _token = data.access_token;
    _tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    return _token;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (!SEBRAE_CLIENT_ID || !SEBRAE_CLIENT_SECRET) {
        return res.status(500).json({
            error: 'Variáveis de ambiente SEBRAE_CLIENT_ID e SEBRAE_CLIENT_SECRET não configuradas no Vercel.'
        });
    }

    const q = req.query.q;
    if (!q) {
        return res.status(400).json({ error: 'Parâmetro "q" é obrigatório.' });
    }

    try {
        const token = await obterToken();
        const queryUrl = `${SEBRAE_API_BASE}/services/data/v64.0/query?q=${encodeURIComponent(q)}`;

        const sfResp = await fetch(queryUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const body = await sfResp.json();
        return res.status(sfResp.status).json(body);

    } catch (err) {
        console.error('[Vercel/SEBRAE] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }
};
