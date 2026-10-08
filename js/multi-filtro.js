/* ============================================
   SEBRAE - TERMOS URC - Filtro multisseleção com busca digitável
   Transforma um <select multiple> (fonte de verdade: option.selected) num
   campo onde se digita para buscar e se marcam várias opções. Mantém os
   <optgroup>. Toda mudança dispara "change" no <select> — quem já escutava
   o select continua funcionando. Nenhuma seleção = "Todos".
   ============================================ */

const _multiFiltros = {};   // id do select -> { atualizar() }

/** Texto para busca: sem acento e minúsculo ("Formalização" ~ "formalizacao") */
function normalizarBuscaFiltro(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function escMultiFiltro(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Valores marcados de um filtro ([] = Todos) */
function valoresMultiFiltro(id) {
    const select = document.getElementById(id);
    return select ? [...select.selectedOptions].map(o => o.value).filter(v => v !== '') : [];
}

/** Repinta o campo após mudar as opções/seleção por código (popular, limpar) */
function atualizarMultiFiltro(id) {
    _multiFiltros[id]?.atualizar();
}

/** Desmarca tudo, sem disparar "change" (quem chama decide o que refiltrar) */
function limparMultiFiltro(id) {
    const select = document.getElementById(id);
    if (!select) return;
    [...select.options].forEach(o => { o.selected = false; });
    atualizarMultiFiltro(id);
}

/**
 * Cria o componente para um <select>. Opções: placeholder (sem seleção) e
 * maxChips (acima disso, "+N").
 */
function criarMultiFiltro(select, { placeholder = 'Todos', maxChips = 2 } = {}) {
    if (!select || _multiFiltros[select.id]) return;

    select.multiple = true;
    select.hidden = true;
    // "Todos" deixa de ser opção: é o estado sem seleção
    [...select.options].filter(o => o.value === '').forEach(o => o.remove());

    const rotulo = select.closest('.filter-group')?.querySelector('label')?.textContent.trim() || 'Filtro';
    const idLista = `${select.id}-lista`;

    const raiz = document.createElement('div');
    raiz.className = 'multi-filtro';
    raiz.innerHTML = `
        <div class="mf-campo">
            <div class="mf-chips"></div>
            <input type="text" class="mf-input" autocomplete="off" spellcheck="false"
                   role="combobox" aria-expanded="false" aria-controls="${idLista}"
                   aria-label="${escMultiFiltro(rotulo)}: digite para buscar">
            <button type="button" class="mf-limpar" title="Limpar seleção" aria-label="Limpar seleção" hidden>&times;</button>
            <i class="fas fa-chevron-down mf-seta" aria-hidden="true"></i>
        </div>
        <div class="mf-lista" id="${idLista}" role="listbox" aria-multiselectable="true" hidden></div>`;
    select.after(raiz);

    const campo = raiz.querySelector('.mf-campo');
    const chips = raiz.querySelector('.mf-chips');
    const input = raiz.querySelector('.mf-input');
    const btnLimpar = raiz.querySelector('.mf-limpar');
    const lista = raiz.querySelector('.mf-lista');
    let ativo = -1;   // índice da opção destacada pelo teclado
    let ordem = [];   // valores na ordem em que foram marcados (etiquetas e Backspace)

    const opcoes = () => [...select.options];
    /** Marcadas na ordem de seleção; marcadas por código (sem passar aqui) vão ao fim */
    function marcadasEmOrdem() {
        const marcadas = opcoes().filter(o => o.selected);
        ordem = ordem.filter(v => marcadas.some(o => o.value === v));
        marcadas.forEach(o => { if (!ordem.includes(o.value)) ordem.push(o.value); });
        return ordem.map(v => marcadas.find(o => o.value === v));
    }
    const visiveis = () => [...lista.querySelectorAll('.mf-opcao')];

    function notificar() {
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function alternar(valor) {
        const op = opcoes().find(o => o.value === valor);
        if (!op) return;
        op.selected = !op.selected;
        ordem = ordem.filter(v => v !== valor);
        if (op.selected) ordem.push(valor);
        pintarCampo();
        pintarLista();
        notificar();
    }

    function pintarCampo() {
        const marcadas = marcadasEmOrdem();
        const mostradas = marcadas.slice(0, marcadas.length > maxChips ? maxChips - 1 : maxChips);
        const resto = marcadas.length - mostradas.length;
        chips.innerHTML = mostradas.map(o => `
            <span class="mf-chip" title="${escMultiFiltro(o.textContent)}">
                <span class="mf-chip-texto">${escMultiFiltro(o.textContent)}</span>
                <button type="button" class="mf-chip-x" data-valor="${escMultiFiltro(o.value)}"
                        aria-label="Remover ${escMultiFiltro(o.textContent)}">&times;</button>
            </span>`).join('') +
            (resto > 0 ? `<span class="mf-chip mf-chip-mais" title="${escMultiFiltro(marcadas.slice(mostradas.length).map(o => o.textContent).join(', '))}">+${resto}</span>` : '');
        input.placeholder = marcadas.length ? '' : (lista.hidden ? placeholder : 'Digite para buscar...');
        btnLimpar.hidden = marcadas.length === 0;
        raiz.classList.toggle('mf-com-selecao', marcadas.length > 0);
    }

    function pintarLista() {
        const termo = normalizarBuscaFiltro(input.value);
        const casa = o => !termo || normalizarBuscaFiltro(o.textContent).includes(termo);
        const itemHTML = o => `
            <div class="mf-opcao${o.selected ? ' mf-marcada' : ''}" role="option"
                 aria-selected="${o.selected}" data-valor="${escMultiFiltro(o.value)}" title="${escMultiFiltro(o.title || o.textContent)}">
                <span class="mf-check"><i class="fas fa-check"></i></span>
                <span class="mf-opcao-texto">${escMultiFiltro(o.textContent)}</span>
            </div>`;

        let html = '';
        [...select.children].forEach(no => {
            if (no.tagName === 'OPTGROUP') {
                const itens = [...no.children].filter(casa);
                if (itens.length) html += `<div class="mf-grupo">${escMultiFiltro(no.label)}</div>` + itens.map(itemHTML).join('');
            } else if (no.tagName === 'OPTION' && casa(no)) {
                html += itemHTML(no);
            }
        });
        lista.innerHTML = html || '<div class="mf-vazio">Nenhuma opção encontrada</div>';

        const itens = visiveis();
        if (ativo >= itens.length) ativo = itens.length - 1;
        if (ativo >= 0) itens[ativo].classList.add('mf-ativa');
    }

    function abrir() {
        if (!lista.hidden) return;
        lista.hidden = false;
        raiz.classList.add('mf-aberto');
        input.setAttribute('aria-expanded', 'true');
        ativo = -1;
        pintarLista();
        pintarCampo();
    }

    function fechar() {
        if (lista.hidden) return;
        lista.hidden = true;
        raiz.classList.remove('mf-aberto');
        input.setAttribute('aria-expanded', 'false');
        input.value = '';
        ativo = -1;
        pintarCampo();
    }

    function moverAtivo(passo) {
        const itens = visiveis();
        if (!itens.length) return;
        itens[ativo]?.classList.remove('mf-ativa');
        ativo = (ativo + passo + itens.length) % itens.length;
        itens[ativo].classList.add('mf-ativa');
        itens[ativo].scrollIntoView({ block: 'nearest' });
    }

    // Clique no campo (fora dos botões) foca o texto e abre
    campo.addEventListener('mousedown', e => {
        if (e.target.closest('.mf-chip-x, .mf-limpar')) return;
        const estavaAberta = !lista.hidden;
        if (e.target !== input) e.preventDefault();
        // Seta com a lista aberta fecha; qualquer outro clique foca e abre
        if (estavaAberta && e.target.closest('.mf-seta')) { fechar(); return; }
        input.focus();
        abrir();
    });
    input.addEventListener('focus', abrir);
    input.addEventListener('input', () => { abrir(); ativo = input.value ? 0 : -1; pintarLista(); });

    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); abrir(); moverAtivo(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); abrir(); moverAtivo(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const alvo = visiveis()[ativo >= 0 ? ativo : 0];
            if (alvo) alternar(alvo.dataset.valor);
        } else if (e.key === 'Escape') { fechar(); }
        else if (e.key === 'Tab') { fechar(); }
        else if (e.key === 'Backspace' && !input.value) {
            const ultima = marcadasEmOrdem().pop();
            if (ultima) alternar(ultima.value);
        }
    });

    // mousedown (não click): marcar não tira o foco do campo nem fecha a lista
    lista.addEventListener('mousedown', e => {
        e.preventDefault();
        const op = e.target.closest('.mf-opcao');
        if (op) alternar(op.dataset.valor);
    });

    chips.addEventListener('click', e => {
        const x = e.target.closest('.mf-chip-x');
        if (x) alternar(x.dataset.valor);
    });

    btnLimpar.addEventListener('click', () => {
        if (!opcoes().some(o => o.selected)) return;
        opcoes().forEach(o => { o.selected = false; });
        pintarCampo();
        if (!lista.hidden) pintarLista();
        notificar();
    });

    document.addEventListener('mousedown', e => {
        if (!raiz.contains(e.target)) fechar();
    });

    _multiFiltros[select.id] = {
        atualizar() {
            pintarCampo();
            if (!lista.hidden) pintarLista();
        }
    };
    pintarCampo();
}
