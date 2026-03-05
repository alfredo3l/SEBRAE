/* ============================================
   Servidor de desenvolvimento unificado
   Porta 3000: arquivos estáticos + /api/sebrae/query
   ============================================ */

require('dotenv').config();

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');

const PORT = 3000;

const SEBRAE_API_BASE    = process.env.SEBRAE_API_BASE    || 'https://hlg-gateway.sebrae.com.br/foco-stg';
const SEBRAE_CLIENT_ID   = process.env.SEBRAE_CLIENT_ID;
const SEBRAE_CLIENT_SECRET = process.env.SEBRAE_CLIENT_SECRET;

if (!SEBRAE_CLIENT_ID || !SEBRAE_CLIENT_SECRET) {
    console.error('ERRO: Defina SEBRAE_CLIENT_ID e SEBRAE_CLIENT_SECRET no arquivo .env');
    process.exit(1);
}

// Cache de token em memória
let _token = null;
let _tokenExpiry = null;

async function obterToken() {
    if (_token && _tokenExpiry && Date.now() < _tokenExpiry) return _token;

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

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    // Remove query string do caminho
    filePath = filePath.split('?')[0];

    // Tenta servir o arquivo exato ou index.html para clean URLs
    const candidates = [filePath, filePath + '.html', path.join(filePath, 'index.html')];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            const ext  = path.extname(candidate).toLowerCase();
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            fs.createReadStream(candidate).pipe(res);
            return;
        }
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 - Arquivo não encontrado');
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://localhost:${PORT}`);

    // Rota da API SEBRAE
    if (urlObj.pathname === '/api/sebrae/query') {
        const q = urlObj.searchParams.get('q');
        if (!q) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro "q" é obrigatório.' }));
            return;
        }

        try {
            const token    = await obterToken();
            const queryUrl = `${SEBRAE_API_BASE}/services/data/v64.0/query?q=${encodeURIComponent(q)}`;
            const sfResp   = await fetch(queryUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const body = await sfResp.json();
            res.writeHead(sfResp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        } catch (err) {
            console.error('  [API] Erro:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Arquivos estáticos
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n  ✓ Servidor rodando em http://localhost:${PORT}`);
    console.log(`  ✓ API SEBRAE disponível em http://localhost:${PORT}/api/sebrae/query\n`);

    // Abre o navegador após 1s
    setTimeout(() => {
        spawn('start', [`http://localhost:${PORT}`], { shell: true });
    }, 1000);
});

process.on('SIGINT', () => {
    server.close();
    process.exit();
});
