#!/usr/bin/env node
/* ============================================
   Troca do ambiente do FOCO (Salesforce SEBRAE): homologação ⇄ produção
   Usado pelas skills /foco-homologacao e /foco-producao.

   Comandos:
     node scripts/foco-ambiente.js status
     node scripts/foco-ambiente.js testar <homologacao|producao>
     node scripts/foco-ambiente.js centralizar
     node scripts/foco-ambiente.js aplicar <homologacao|producao>

   O que muda numa troca (Supabase e n8n continuam os mesmos):
     1. .env local          — SEBRAE_API_BASE / SEBRAE_CLIENT_ID / SEBRAE_CLIENT_SECRET
     2. n8n                 — nó Seta_Credenciais_FOCO do fluxo [Termo URC - Assinado]
                              (Gateway, Client Id, Client Secret); os 6 nós HTTP do FOCO
                              leem o gateway desse nó
     3. Vercel              — as mesmas 3 variáveis, alteradas no painel (passo manual,
                              o script só confere pelo header X-Foco-Ambiente)

   Credenciais: lidas de .env.homologacao / .env.producao (gitignored).
   Opcional nesses arquivos: N8N_FOCO_CLIENT_ID / N8N_FOCO_CLIENT_SECRET, quando o
   n8n usa um par diferente do app no mesmo ambiente.
   Acesso ao n8n: N8N_API_URL / N8N_API_KEY do ambiente ou, na falta, do servidor
   "n8n-mcp" configurado em ~/.claude.json.

   ⚠️ Este script NUNCA imprime client_id, client_secret, token ou chave do n8n.
   ============================================ */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');

const AMBIENTES = {
    homologacao: { base: 'https://hlg-gateway.sebrae.com.br/foco-stg', arquivo: '.env.homologacao' },
    producao:    { base: 'https://gateway.sebrae.com.br/foco',         arquivo: '.env.producao' },
};

const WORKFLOW_ID   = '7ITLaIB5rSc7EoTd';           // [Termo URC - Assinado]
const NO_CREDENCIAIS = 'Seta_Credenciais_FOCO';
const NOS_HTTP_FOCO = [
    'Obter_Token',
    'HTTP Request CPF',
    'Atualiza Status Termo Aceite FOCO',
    'Upload Anexo FOCO',
    'Busca ContentDocumentId',
    'Vincula Anexo Interacao',
];
const EXPR_GATEWAY = `{{ $('${NO_CREDENCIAIS}').first().json.Gateway }}`;
const URL_APP = 'https://sebrae-seven.vercel.app';

// ---------- utilidades ----------

function ambienteDaBase(base) {
    if (/\/\/hlg-gateway\.sebrae\.com\.br\//.test(base || '')) return 'homologacao';
    if (/\/\/gateway\.sebrae\.com\.br\//.test(base || ''))     return 'producao';
    return 'desconhecido';
}

function lerEnv(arquivo) {
    const p = path.join(RAIZ, arquivo);
    if (!fs.existsSync(p)) return null;
    const vars = {};
    for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return vars;
}

function credenciaisDoAmbiente(amb) {
    const cfg = AMBIENTES[amb];
    if (!cfg) throw new Error(`Ambiente inválido: "${amb}". Use homologacao ou producao.`);
    const v = lerEnv(cfg.arquivo);
    if (!v) throw new Error(`Arquivo ${cfg.arquivo} não encontrado na raiz do projeto.`);
    const faltando = ['SEBRAE_API_BASE', 'SEBRAE_CLIENT_ID', 'SEBRAE_CLIENT_SECRET'].filter(k => !v[k]);
    if (faltando.length) throw new Error(`${cfg.arquivo}: preencha ${faltando.join(', ')}.`);
    const base = v.SEBRAE_API_BASE.replace(/\/+$/, '');
    if (base !== cfg.base) {
        throw new Error(`${cfg.arquivo}: SEBRAE_API_BASE deveria ser ${cfg.base} (está ${base}). ` +
                        'Trava de segurança contra misturar ambientes.');
    }
    return {
        base,
        clientId: v.SEBRAE_CLIENT_ID,
        clientSecret: v.SEBRAE_CLIENT_SECRET,
        n8nClientId: v.N8N_FOCO_CLIENT_ID || v.SEBRAE_CLIENT_ID,
        n8nClientSecret: v.N8N_FOCO_CLIENT_SECRET || v.SEBRAE_CLIENT_SECRET,
    };
}

function configN8n() {
    if (process.env.N8N_API_URL && process.env.N8N_API_KEY) {
        return { url: process.env.N8N_API_URL, key: process.env.N8N_API_KEY };
    }
    const p = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(p)) {
        let achado = null;
        (function buscar(o) {
            if (achado || !o || typeof o !== 'object') return;
            const s = o.mcpServers && o.mcpServers['n8n-mcp'];
            if (s && s.env && s.env.N8N_API_URL && s.env.N8N_API_KEY) achado = s.env;
            for (const k in o) buscar(o[k]);
        })(JSON.parse(fs.readFileSync(p, 'utf8')));
        if (achado) return { url: achado.N8N_API_URL, key: achado.N8N_API_KEY };
    }
    throw new Error('Acesso ao n8n não encontrado (defina N8N_API_URL/N8N_API_KEY).');
}

async function n8n(metodo, rota, corpo) {
    const { url, key } = configN8n();
    const resp = await fetch(url.replace(/\/+$/, '') + '/api/v1' + rota, {
        method: metodo,
        headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const txt = await resp.text();
    if (!resp.ok) throw new Error(`n8n ${metodo} ${rota} → HTTP ${resp.status}: ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : {};
}

function no(wf, nome) {
    const n = wf.nodes.find(x => x.name === nome);
    if (!n) throw new Error(`Nó "${nome}" não encontrado no fluxo.`);
    return n;
}

function atribuicoes(wf) {
    return no(wf, NO_CREDENCIAIS).parameters.assignments.assignments;
}

function valorAtrib(wf, nome) {
    const a = atribuicoes(wf).find(x => x.name === nome);
    return a ? a.value : undefined;
}

function definirAtrib(wf, nome, valor) {
    const lista = atribuicoes(wf);
    const a = lista.find(x => x.name === nome);
    if (a) { a.value = valor; a.type = 'string'; }
    else lista.push({ id: crypto.randomUUID(), name: nome, value: valor, type: 'string' });
}

// Situação da URL de um nó HTTP: 'centralizado' | ambiente do host fixo | 'desconhecido'
function situacaoUrl(url) {
    if ((url || '').includes(EXPR_GATEWAY)) return 'centralizado';
    return ambienteDaBase(url);
}

// Troca "https://<gateway>/<foco|foco-stg>" pela expressão do nó de credenciais
function centralizarUrl(url) {
    if (situacaoUrl(url) === 'centralizado') return url;
    const semIgual = url.startsWith('=') ? url.slice(1) : url;
    const m = semIgual.match(/^https:\/\/(?:hlg-)?gateway\.sebrae\.com\.br\/foco(?:-stg)?(\/.*)$/);
    if (!m) throw new Error(`URL fora do padrão esperado: ${url}`);
    return '=' + EXPR_GATEWAY + m[1];
}

async function obterToken(base, clientId, clientSecret) {
    const url = `${base}/services/oauth2/token?grant_type=client_credentials` +
                `&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
    let resp;
    try { resp = await fetch(url, { method: 'POST' }); }
    catch { throw new Error(`sem conexão com ${base}`); }   // não propaga a URL (contém o segredo)
    const txt = await resp.text();
    if (!resp.ok) {
        // A mensagem do OAuth não contém o segredo, mas cortamos por garantia
        throw new Error(`token recusado (HTTP ${resp.status}): ${txt.slice(0, 200)}`);
    }
    return JSON.parse(txt);
}

// Publica o rascunho (se a instância não publicou sozinha no PUT) e confere
async function garantirPublicado() {
    let wf = await n8n('GET', `/workflows/${WORKFLOW_ID}`);
    if (wf.versionId !== wf.activeVersionId) {
        await n8n('POST', `/workflows/${WORKFLOW_ID}/activate`);
        wf = await n8n('GET', `/workflows/${WORKFLOW_ID}`);
    }
    if (!wf.active || wf.versionId !== wf.activeVersionId) {
        throw new Error(`Fluxo não ficou publicado (active=${wf.active}, versionId=${wf.versionId}, activeVersionId=${wf.activeVersionId}).`);
    }
    return wf;
}

async function salvarWorkflow(wf) {
    // settings só com as chaves aceitas pela API pública (armadilha documentada no CLAUDE.md)
    const s = wf.settings || {};
    const settings = {};
    for (const k of ['executionOrder', 'callerPolicy', 'errorWorkflow']) if (s[k] !== undefined) settings[k] = s[k];
    await n8n('PUT', `/workflows/${WORKFLOW_ID}`, {
        name: wf.name, nodes: wf.nodes, connections: wf.connections, settings,
    });
    return garantirPublicado();
}

async function lerWorkflowPublicado() {
    const wf = await n8n('GET', `/workflows/${WORKFLOW_ID}`);
    if (wf.versionId !== wf.activeVersionId) {
        throw new Error('O fluxo tem rascunho não publicado (versionId ≠ activeVersionId). ' +
                        'Publique ou descarte o rascunho no n8n antes de continuar, para não publicar edições alheias.');
    }
    return wf;
}

// ---------- comandos ----------

async function cmdStatus() {
    console.log('== Ambiente do FOCO ==\n');

    const local = lerEnv('.env');
    console.log(`App local (.env):        ${local ? ambienteDaBase(local.SEBRAE_API_BASE).toUpperCase() + '  ' + (local.SEBRAE_API_BASE || '(SEBRAE_API_BASE vazio → default homologação)') : 'sem .env'}`);

    try {
        const r = await fetch(`${URL_APP}/api/sebrae/query`);
        const h = r.headers.get('x-foco-ambiente');
        console.log(`App publicado (Vercel):  ${h ? h.toUpperCase() : 'sem header X-Foco-Ambiente (deploy anterior a esta ferramenta)'}`);
    } catch (e) {
        console.log(`App publicado (Vercel):  não consultado (${e.message})`);
    }

    try {
        const wf = await n8n('GET', `/workflows/${WORKFLOW_ID}`);
        const gw = valorAtrib(wf, 'Gateway');
        const urls = NOS_HTTP_FOCO.map(n => situacaoUrl(no(wf, n).parameters.url));
        const todosCentral = urls.every(u => u === 'centralizado');
        const ambN8n = todosCentral ? ambienteDaBase((gw || '') + '/') : [...new Set(urls)].join(', ');
        console.log(`n8n [Termo URC - Assinado]: ${String(ambN8n).toUpperCase()}` +
                    (todosCentral ? `  (Gateway = ${gw})` : `  (URLs fixas nos nós — rode "centralizar")`));
        console.log(`   publicado: ${wf.active && wf.versionId === wf.activeVersionId ? 'sim' : 'NÃO (rascunho pendente)'}`);
        for (const amb of Object.keys(AMBIENTES)) {
            let c; try { c = credenciaisDoAmbiente(amb); } catch { continue; }
            const igual = valorAtrib(wf, 'Client Id') === c.n8nClientId && valorAtrib(wf, 'Client Secret') === c.n8nClientSecret;
            console.log(`   credenciais iguais às de ${AMBIENTES[amb].arquivo}: ${igual ? 'sim' : 'não'}`);
        }
    } catch (e) {
        console.log(`n8n: não consultado (${e.message})`);
    }

    console.log('\nArquivos de credenciais:');
    for (const [amb, cfg] of Object.entries(AMBIENTES)) {
        try { credenciaisDoAmbiente(amb); console.log(`   ${cfg.arquivo}: completo`); }
        catch (e) { console.log(`   ${e.message}`); }
    }
}

async function cmdTestar(amb) {
    const c = credenciaisDoAmbiente(amb);
    const alvos = [['app', c.clientId, c.clientSecret]];
    if (c.n8nClientId !== c.clientId || c.n8nClientSecret !== c.clientSecret) alvos.push(['n8n', c.n8nClientId, c.n8nClientSecret]);
    for (const [quem, id, sec] of alvos) {
        const tk = await obterToken(c.base, id, sec);
        const idHost = (tk.id || '').match(/^https:\/\/([^/]+)/);
        const q = await fetch(`${c.base}/services/data/v64.0/query?q=${encodeURIComponent('SELECT Id FROM Contact LIMIT 1')}`,
                              { headers: { Authorization: `Bearer ${tk.access_token}` } });
        console.log(`[${amb}/${quem}] token OK (identidade em ${idHost ? idHost[1] : '?'}) · consulta de leitura HTTP ${q.status}`);
        if (!q.ok) throw new Error(`consulta de leitura falhou em ${amb}/${quem}`);
    }
    return c;
}

async function cmdCentralizar() {
    const wf = await lerWorkflowPublicado();
    const situacoes = NOS_HTTP_FOCO.map(n => situacaoUrl(no(wf, n).parameters.url));
    const fixos = [...new Set(situacoes.filter(s => s !== 'centralizado'))];
    if (fixos.length === 0 && valorAtrib(wf, 'Gateway')) {
        console.log('Já centralizado — nada a fazer.');
        return;
    }
    if (fixos.length > 1 || fixos.includes('desconhecido')) {
        throw new Error(`Nós apontam para ambientes diferentes (${fixos.join(', ')}) — corrigir manualmente antes.`);
    }
    const amb = fixos[0] || ambienteDaBase((valorAtrib(wf, 'Gateway') || '') + '/');
    definirAtrib(wf, 'Gateway', AMBIENTES[amb].base);
    for (const n of NOS_HTTP_FOCO) {
        const node = no(wf, n);
        node.parameters.url = centralizarUrl(node.parameters.url);
    }
    await salvarWorkflow(wf);
    console.log(`Centralizado: Gateway = ${AMBIENTES[amb].base}; ${NOS_HTTP_FOCO.length} nós passam a ler o gateway de ${NO_CREDENCIAIS}.`);
}

function gravarEnvLocal(c) {
    const p = path.join(RAIZ, '.env');
    const linhas = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/) : [];
    const novos = { SEBRAE_API_BASE: c.base, SEBRAE_CLIENT_ID: c.clientId, SEBRAE_CLIENT_SECRET: c.clientSecret };
    const vistos = new Set();
    const saida = linhas.map(l => {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=/);
        if (m && novos[m[1]] !== undefined) { vistos.add(m[1]); return `${m[1]}=${novos[m[1]]}`; }
        return l;
    });
    for (const k of Object.keys(novos)) if (!vistos.has(k)) saida.push(`${k}=${novos[k]}`);
    fs.writeFileSync(p, saida.join('\n').replace(/\n*$/, '\n'));
}

async function cmdAplicar(amb) {
    console.log(`== Aplicando FOCO ${amb.toUpperCase()} ==\n`);

    // 1. Credenciais válidas antes de mexer em qualquer coisa
    const c = await cmdTestar(amb);

    // 2. n8n
    const wf = await lerWorkflowPublicado();
    for (const n of NOS_HTTP_FOCO) {
        const node = no(wf, n);
        node.parameters.url = centralizarUrl(node.parameters.url);
    }
    definirAtrib(wf, 'Gateway', c.base);
    definirAtrib(wf, 'Client Id', c.n8nClientId);
    definirAtrib(wf, 'Client Secret', c.n8nClientSecret);
    const salvo = await salvarWorkflow(wf);
    const ok = valorAtrib(salvo, 'Gateway') === c.base &&
               valorAtrib(salvo, 'Client Id') === c.n8nClientId &&
               valorAtrib(salvo, 'Client Secret') === c.n8nClientSecret &&
               NOS_HTTP_FOCO.every(n => situacaoUrl(no(salvo, n).parameters.url) === 'centralizado');
    if (!ok) throw new Error('n8n: conferência pós-gravação falhou — revisar o fluxo.');
    console.log(`n8n: ${NO_CREDENCIAIS} → ${c.base} (publicado, conferido)`);

    // 3. .env local
    gravarEnvLocal(c);
    console.log(`.env local → ${c.base} (reinicie o "npm run dev" se estiver rodando)`);

    // 4. Vercel — manual
    console.log(`\nVercel (passo manual): Settings → Environment Variables → Production, troque
   SEBRAE_API_BASE, SEBRAE_CLIENT_ID e SEBRAE_CLIENT_SECRET pelos valores de ${AMBIENTES[amb].arquivo}
   e faça Redeploy do último deploy de produção. Depois rode "status" para conferir.`);
}

// ---------- main ----------

module.exports = { ambienteDaBase, situacaoUrl, centralizarUrl, definirAtrib, valorAtrib, NOS_HTTP_FOCO, EXPR_GATEWAY };
if (require.main === module) (async () => {
    const [cmd, arg] = process.argv.slice(2);
    try {
        if (cmd === 'status') await cmdStatus();
        else if (cmd === 'testar') await cmdTestar(arg);
        else if (cmd === 'centralizar') await cmdCentralizar();
        else if (cmd === 'aplicar') await cmdAplicar(arg);
        else {
            console.log('Uso: node scripts/foco-ambiente.js <status | testar <amb> | centralizar | aplicar <amb>>');
            console.log('     <amb> = homologacao | producao');
            process.exitCode = 1;
        }
    } catch (e) {
        console.error(`ERRO: ${e.message}`);
        process.exitCode = 1;
    }
})();
