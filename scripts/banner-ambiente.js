#!/usr/bin/env node
/* ============================================
   Liga/desliga a faixa de ambiente do FOCO (js/ambiente-banner.js) nas páginas.
   Usado pelas skills /banner-ligar e /banner-desligar.

     node scripts/banner-ambiente.js status
     node scripts/banner-ambiente.js ligar
     node scripts/banner-ambiente.js desligar

   Ligar   = insere, em cada página, a linha marcada logo antes de js/supabase-config.js.
   Desligar = remove essa linha. O arquivo js/ambiente-banner.js é mantido (religar é só rodar "ligar").
   Idempotente: rodar duas vezes não duplica nem quebra nada.
   ============================================ */

const fs   = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PAGINAS = ['index.html', 'detalhe.html', 'documento.html', 'acompanhamento.html', 'usuarios.html', 'login.html'];
const ANCORA = '    <script src="js/supabase-config.js"></script>';
const LINHA  = '    <script src="js/ambiente-banner.js"></script> <!-- FAIXA DE AMBIENTE (homologação/produção) — REMOVER após validação do SEBRAE -->';
const REGEX_LINHA = /^[ \t]*<script src="js\/ambiente-banner\.js"><\/script>.*\r?\n/m;

function ler(p) { return fs.readFileSync(path.join(RAIZ, p), 'utf8'); }
function gravar(p, t) { fs.writeFileSync(path.join(RAIZ, p), t); }
function ligada(t) { return REGEX_LINHA.test(t); }

function status() {
    const estados = PAGINAS.map(p => [p, ligada(ler(p))]);
    for (const [p, on] of estados) console.log(`  ${on ? 'LIGADA   ' : 'desligada'}  ${p}`);
    const n = estados.filter(e => e[1]).length;
    console.log(`\nFaixa ${n === PAGINAS.length ? 'LIGADA em todas as páginas' : n === 0 ? 'DESLIGADA em todas as páginas' : `MISTA (${n}/${PAGINAS.length}) — rode ligar ou desligar`}.`);
    console.log(`js/ambiente-banner.js: ${fs.existsSync(path.join(RAIZ, 'js/ambiente-banner.js')) ? 'presente' : 'AUSENTE'}`);
}

function ligar() {
    if (!fs.existsSync(path.join(RAIZ, 'js/ambiente-banner.js'))) {
        throw new Error('js/ambiente-banner.js não existe — recupere-o do git antes de ligar.');
    }
    for (const p of PAGINAS) {
        let t = ler(p);
        if (ligada(t)) { console.log(`  já ligada  ${p}`); continue; }
        const nl = t.includes('\r\n') ? '\r\n' : '\n';
        if (!t.includes(ANCORA)) throw new Error(`${p}: âncora js/supabase-config.js não encontrada.`);
        t = t.replace(ANCORA, LINHA + nl + ANCORA);
        gravar(p, t);
        console.log(`  ligada     ${p}`);
    }
}

function desligar() {
    for (const p of PAGINAS) {
        const t = ler(p);
        if (!ligada(t)) { console.log(`  já desligada  ${p}`); continue; }
        gravar(p, t.replace(REGEX_LINHA, ''));
        console.log(`  desligada     ${p}`);
    }
}

const cmd = process.argv[2];
try {
    if (cmd === 'status') status();
    else if (cmd === 'ligar') { ligar(); console.log(''); status(); }
    else if (cmd === 'desligar') { desligar(); console.log(''); status(); }
    else { console.log('Uso: node scripts/banner-ambiente.js <status | ligar | desligar>'); process.exitCode = 1; }
} catch (e) {
    console.error(`ERRO: ${e.message}`);
    process.exitCode = 1;
}
