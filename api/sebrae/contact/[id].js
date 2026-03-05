/* ============================================
   Vercel Serverless Function - PATCH Contact SEBRAE
   Rota: PATCH /api/sebrae/contact/[id]
   Body: { "Phone": "(00)00000-0000" }
   Atualiza o campo Phone do Contact no Salesforce/FOCO.
   ============================================ */

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
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'PATCH') {
        return res.status(405).json({ error: 'Método não permitido. Use PATCH.' });
    }

    const contactId = req.query.id;
    if (!contactId) {
        return res.status(400).json({ error: 'ID do Contact é obrigatório.' });
    }

    if (!SEBRAE_CLIENT_ID || !SEBRAE_CLIENT_SECRET) {
        return res.status(500).json({
            etapa: 'config',
            error: 'Variaveis SEBRAE_CLIENT_ID ou SEBRAE_CLIENT_SECRET nao configuradas.'
        });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
        return res.status(400).json({ error: 'Body JSON inválido.' });
    }

    const phone = body.Phone;
    if (phone === undefined || phone === null) {
        return res.status(400).json({ error: 'Campo "Phone" é obrigatório no body.' });
    }

    let token;
    try {
        token = await obterToken();
    } catch (err) {
        console.error('[SEBRAE Contact] Falha ao obter token:', err.message);
        return res.status(500).json({
            etapa: 'token',
            error: err.message
        });
    }

    try {
        const url = `${SEBRAE_API_BASE}/services/data/v64.0/sobjects/Contact/${contactId}`;
        const sfResp = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ Phone: String(phone) })
        });

        if (!sfResp.ok) {
            const txt = await sfResp.text();
            let errBody;
            try {
                errBody = JSON.parse(txt);
            } catch {
                errBody = { message: txt };
            }
            console.error('[SEBRAE Contact] Erro PATCH:', sfResp.status, errBody);
            return res.status(sfResp.status).json({
                etapa: 'patch',
                status: sfResp.status,
                body: errBody
            });
        }

        return res.status(204).end();
    } catch (err) {
        console.error('[SEBRAE Contact] Falha no PATCH:', err.message);
        return res.status(500).json({
            etapa: 'patch',
            error: err.message
        });
    }
};
