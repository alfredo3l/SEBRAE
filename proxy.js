/* ============================================
   Proxy SEBRAE - Evita CORS ao chamar a API Salesforce
   Exporta o handler para ser usado pelo dev.js
   ============================================ */

require('dotenv').config();

const SEBRAE_API_BASE    = process.env.SEBRAE_API_BASE    || 'https://hlg-gateway.sebrae.com.br/foco-stg';
const SEBRAE_CLIENT_ID   = process.env.SEBRAE_CLIENT_ID;
const SEBRAE_CLIENT_SECRET = process.env.SEBRAE_CLIENT_SECRET;

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
        throw new Error(`Falha ao obter token (${resp.status}): ${txt}`);
    }

    const data = await resp.json();
    _token = data.access_token;
    _tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    console.log('  Token SEBRAE obtido com sucesso.');
    return _token;
}

async function handleSebraeQuery(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (!SEBRAE_CLIENT_ID || !SEBRAE_CLIENT_SECRET) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Variáveis SEBRAE_CLIENT_ID ou SEBRAE_CLIENT_SECRET não configuradas no .env' }));
        return;
    }

    const urlObj = new URL(req.url, 'http://localhost');
    const q = urlObj.searchParams.get('q');

    if (!q) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Parâmetro "q" é obrigatório.' }));
        return;
    }

    try {
        const token = await obterToken();
        const queryUrl = `${SEBRAE_API_BASE}/services/data/v64.0/query?q=${encodeURIComponent(q)}`;

        const sfResp = await fetch(queryUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const body = await sfResp.json();
        res.writeHead(sfResp.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));

    } catch (err) {
        console.error('  [Proxy SEBRAE] Erro:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

module.exports = handleSebraeQuery;
