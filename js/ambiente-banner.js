/* ============================================
   FAIXA DE AMBIENTE DO FOCO (homologação × produção) — TEMPORÁRIA
   Mostra no topo de todas as telas em qual FOCO o sistema está ligado,
   lendo o header X-Foco-Ambiente do proxy (/api/sebrae/query).

   ⚠️ REMOVER após a validação do SEBRAE:
      1. apagar este arquivo;
      2. apagar a linha marcada "FAIXA DE AMBIENTE" nas 6 páginas
         (grep -n "ambiente-banner" *.html).
   Nada mais depende dele (estilo embutido, sem CSS em style.css).
   ============================================ */

(function () {
    const CHAVE_CACHE = 'sbr_foco_ambiente';
    const TTL_MS = 5 * 60 * 1000;

    const FAIXAS = {
        homologacao: {
            fundo: '#f59e0b', texto: '#1f2937', icone: 'fa-flask',
            mensagem: '<strong>AMBIENTE DE HOMOLOGAÇÃO</strong> — sistema em testes, ligado ao FOCO de homologação do SEBRAE'
        },
        producao: {
            fundo: '#b91c1c', texto: '#ffffff', icone: 'fa-exclamation-triangle',
            mensagem: '<strong>AMBIENTE DE PRODUÇÃO</strong> — ligado ao FOCO oficial do SEBRAE: as alterações afetam dados reais'
        }
    };

    // Fixa no topo da janela (funciona em qualquer layout de body, inclusive o flex do login)
    // e reserva a altura dela no padding do body. Camada 1500: acima da navbar (1000),
    // abaixo dos modais (2000) e do menu do usuário (3000).
    const paddingOriginal = document.body.style.paddingTop;

    function reservarEspaco() {
        const faixa = document.getElementById('faixa-ambiente-foco');
        document.body.style.paddingTop = faixa ? faixa.offsetHeight + 'px' : paddingOriginal;
    }

    function pintar(ambiente) {
        const cfg = FAIXAS[ambiente];
        let faixa = document.getElementById('faixa-ambiente-foco');
        if (!cfg) { if (faixa) faixa.remove(); reservarEspaco(); return; }
        if (!faixa) {
            faixa = document.createElement('div');
            faixa.id = 'faixa-ambiente-foco';
            faixa.setAttribute('role', 'status');
            document.body.prepend(faixa);
        }
        faixa.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:1500;box-sizing:border-box;' +
            `background:${cfg.fundo};color:${cfg.texto};text-align:center;` +
            'padding:6px 16px;font-size:0.85rem;line-height:1.35;letter-spacing:0.2px;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.2);';
        faixa.innerHTML = `<i class="fas ${cfg.icone}" style="margin-right:6px;"></i>${cfg.mensagem}`;
        reservarEspaco();
    }

    window.addEventListener('resize', reservarEspaco);

    function lerCache() {
        try {
            const c = JSON.parse(sessionStorage.getItem(CHAVE_CACHE) || 'null');
            return c && Date.now() - c.em < TTL_MS ? c.ambiente : null;
        } catch { return null; }
    }

    function gravarCache(ambiente) {
        try { sessionStorage.setItem(CHAVE_CACHE, JSON.stringify({ ambiente, em: Date.now() })); } catch { /* sem storage */ }
    }

    // Pinta na hora com o cache (evita a página "pular") e revalida no proxy.
    // Sem "q" o proxy responde 400 sem consultar o Salesforce — só queremos o header.
    const emCache = lerCache();
    if (emCache) pintar(emCache);

    fetch('/api/sebrae/query', { cache: 'no-store' })
        .then(r => {
            const ambiente = r.headers.get('X-Foco-Ambiente');
            gravarCache(ambiente);
            if (ambiente !== emCache) pintar(ambiente);
        })
        .catch(() => { /* sem proxy: mantém o que estiver na tela */ });
})();
