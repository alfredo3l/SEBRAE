const { spawn } = require('child_process');
const proxyServer = require('./proxy');

const STATIC_PORT = 3000;
const PROXY_PORT  = 3001;

// Inicia o proxy SEBRAE (server-side, sem CORS)
proxyServer.listen(PROXY_PORT, () => {
    console.log(`  ✓ Proxy SEBRAE rodando em http://localhost:${PROXY_PORT}`);
});

// Inicia o servidor de arquivos estáticos
const server = spawn('npx', ['serve', '-l', String(STATIC_PORT)], {
    stdio: 'inherit',
    shell: true,
});

// Abre o navegador após 1,5s
setTimeout(() => {
    spawn('start', [`http://localhost:${STATIC_PORT}`], { shell: true });
}, 1500);

process.on('SIGINT', () => {
    proxyServer.close();
    server.kill();
    process.exit();
});
