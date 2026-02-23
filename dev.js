/* ============================================
   Servidor de desenvolvimento unificado
   - Arquivos estáticos  → porta 3000
   - /api/sebrae/query   → proxy SEBRAE (mesma porta)
   ============================================ */

require('dotenv').config();
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');

const handleSebraeQuery = require('./proxy');

const PORT = 3000;
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css' : 'text/css; charset=utf-8',
    '.js'  : 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png' : 'image/png',
    '.jpg' : 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif' : 'image/gif',
    '.svg' : 'image/svg+xml',
    '.ico' : 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf' : 'font/ttf',
};

function serveStatic(req, res) {
    let urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

    // cleanUrls: remove trailing slash exceto na raiz
    if (urlPath !== '/' && urlPath.endsWith('/')) {
        urlPath = urlPath.slice(0, -1);
    }

    // Mapeamento da raiz para index.html
    if (urlPath === '/') urlPath = '/index.html';

    let filePath = path.join(ROOT, urlPath);

    // cleanUrls: tenta adicionar .html se não há extensão
    if (!path.extname(filePath)) {
        const withHtml = filePath + '.html';
        if (fs.existsSync(withHtml)) {
            filePath = withHtml;
        } else {
            const indexHtml = path.join(filePath, 'index.html');
            if (fs.existsSync(indexHtml)) filePath = indexHtml;
        }
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`404 – Arquivo não encontrado: ${urlPath}`);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

    if (urlPath === '/api/sebrae/query') {
        return handleSebraeQuery(req, res);
    }

    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n  ✓ Servidor rodando em http://localhost:${PORT}`);
    console.log(`  ✓ Proxy SEBRAE disponível em http://localhost:${PORT}/api/sebrae/query\n`);
    spawn('start', [`http://localhost:${PORT}`], { shell: true });
});

process.on('SIGINT', () => {
    console.log('\n  Encerrando servidor...');
    server.close(() => process.exit(0));
});
