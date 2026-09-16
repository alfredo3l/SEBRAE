/* ============================================
   SEBRAE - Aceite LGPD - JavaScript Principal
   Integração com Supabase
   ============================================ */

// ===== Funções Utilitárias =====

/**
 * Formata data para dd/MM/aaaa
 */
function formatarData(dataStr) {
    const d = new Date(dataStr);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

/**
 * Formata data e hora para dd/MM/aaaa HH:mm
 * Aceita ISO, texto no formato dd/MM/aaaa ou dd/MM/aaaa HH:mm
 */
function formatarDataHora(dataStr) {
    // Sempre no horário de MS (js/datas.js): o computador do consultor pode
    // estar em outro fuso e mostrava o horário deslocado.
    return formatarDataHoraSebrae(dataStr, String(dataStr ?? '-'));
}

// Cache de verificação de PDF para evitar chamadas repetidas ao Storage
const _cachePDF = {};

/**
 * Verifica se o PDF do termo existe no bucket do Supabase (com cache)
 */
async function verificarTermoPDF(cpf) {
    const cpfNumeros = cpf.replace(/\D/g, '');
    if (cpfNumeros in _cachePDF) return _cachePDF[cpfNumeros];

    const nomeArquivo = `TermosAceite_${cpfNumeros}.pdf`;
    const { data, error } = await supabaseClient
        .storage
        .from('TermosAceite')
        .list('', { search: nomeArquivo });

    const resultado = !error && data && data.some(f => f.name === nomeArquivo);
    _cachePDF[cpfNumeros] = resultado;
    return resultado;
}

/**
 * Abre o PDF do termo aceite no Storage do Supabase
 */
async function abrirTermoPDF(cpf) {
    const cpfNumeros = cpf.replace(/\D/g, '');
    const nomeArquivo = `TermosAceite_${cpfNumeros}.pdf`;

    const { data, error } = await supabaseClient
        .storage
        .from('TermosAceite')
        .createSignedUrl(nomeArquivo, 3600);

    if (error || !data?.signedUrl) {
        alert('Documento não encontrado ou erro ao gerar link.');
        console.error('Erro ao gerar URL do PDF:', error?.message);
        return;
    }

    window.open(data.signedUrl, '_blank');
}

// ===== Estado da paginação da tabela principal =====
// Cada item de dadosParceiros/dadosFiltrados é uma LINHA DE DOCUMENTO: { parceiro, doc }
let dadosParceiros = [];
let dadosFiltrados = [];
let paginaParceiros = 1;
let registrosPorPagina = 10;

// ===== Funções de Acesso ao Banco (Supabase) =====

/**
 * Deriva a linha "Termo LGPD" de um parceiro a partir das flags legadas.
 * O fluxo n8n do LGPD ainda grava em parceiros (por CPF), então essa é a
 * fonte viva do status do LGPD — mesmo existindo registro em documentos.
 */
function linhaLGPDDoParceiro(p) {
    let status;
    if (p.termo_aceito) status = 'aceito';
    else if (p.recusado) status = 'recusado';
    else if (p.data_envio) status = 'enviado';
    else status = 'nao_aceito';

    return {
        parceiro: p,
        doc: {
            tipo_documento: 'termo-lgpd',
            nome_documento: 'Termo LGPD',
            status,
            salvo_foco: !!p.termo_aceito_foco,
            arquivo_path: null,          // PDF do LGPD é resolvido pelo CPF (legado)
            data_envio: p.data_envio,
            data_aceite: p.data_aceite,
            _lgpdDerivado: true
        }
    };
}

/**
 * O cliente já teve alguma movimentação do Termo LGPD? As flags de `parceiros`
 * são o histórico do fluxo antigo; sem nenhuma delas, ele nunca teve o termo.
 */
function temHistoricoLGPD(p) {
    return !!(p.termo_aceito || p.recusado || p.data_envio || p.data_aceite || p.data_recusa);
}

/**
 * Linha de um cliente que ainda não tem documento nenhum. Ele precisa aparecer
 * na lista para ser acessado, mas sem termo atribuído — o documento só existe
 * depois que o consultor gera um.
 */
function linhaSemDocumento(p) {
    return {
        parceiro: p,
        doc: {
            tipo_documento: null,
            nome_documento: '—',
            status: 'sem_documento',
            salvo_foco: false,
            arquivo_path: null,
            data_envio: null,
            data_aceite: null,
            _semDocumento: true
        }
    };
}

/**
 * Achata parceiros + documentos em linhas de documento (Tela 1 da POC):
 * 1 linha por registro de `documentos` + a linha derivada do Termo LGPD
 * quando o cliente tem histórico dele nas flags de `parceiros`.
 * Cliente sem nenhum documento entra com uma linha "sem documento".
 */
function montarLinhasDocumentos(parceiros) {
    const linhas = [];
    (parceiros || []).forEach(p => {
        const docs = p.documentos || [];
        const temRegistroLGPD = docs.some(d => d.tipo_documento === 'termo-lgpd');
        let linhasDoParceiro = 0;

        // Termo LGPD sem registro em `documentos`: resta o histórico das flags
        // de `parceiros` (fluxo antigo). Com registro, ele é a fonte — traz o
        // PDF, o status e a integração no FOCO, que as flags não têm.
        if (!temRegistroLGPD && temHistoricoLGPD(p)) {
            linhas.push(linhaLGPDDoParceiro(p));
            linhasDoParceiro++;
        }

        docs.slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(d => { linhas.push({ parceiro: p, doc: d }); linhasDoParceiro++; });

        if (linhasDoParceiro === 0) linhas.push(linhaSemDocumento(p));
    });
    return linhas;
}

// ===== Atualização em tempo real =====
// O aceite/recusa chega pelo WhatsApp e é gravado pelo n8n: sem isto, a tela
// só mostraria a mudança depois de um F5.

let _canalRealtime = null;
let _recarregaAgendada = null;

/**
 * Reage a mudanças no banco com um pequeno atraso, agrupando eventos em
 * sequência (o aceite grava em documentos e parceiros quase ao mesmo tempo).
 */
function agendarAtualizacao(recarregar) {
    clearTimeout(_recarregaAgendada);
    _recarregaAgendada = setTimeout(recarregar, 400);
}

/**
 * Escuta alterações em `documentos` e `parceiros` e chama `recarregar()`.
 * Retorna o canal (ou null se o Realtime não estiver disponível).
 *
 * O token da sessão precisa chegar ao websocket ANTES da assinatura: as
 * políticas de leitura exigem usuário autenticado e, sem o token aplicado,
 * o servidor descarta os eventos sem avisar (o canal fica "SUBSCRIBED" mudo).
 */
async function ligarAtualizacaoAoVivo(nomeCanal, recarregar) {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return null; // sem sessão não há o que escutar

        await supabaseClient.realtime.setAuth(token);

        // A sessão é renovada de tempos em tempos; o websocket precisa saber.
        supabaseClient.auth.onAuthStateChange((evento, sessao) => {
            if (evento === 'TOKEN_REFRESHED' && sessao?.access_token) {
                supabaseClient.realtime.setAuth(sessao.access_token);
            }
        });

        if (_canalRealtime) supabaseClient.removeChannel(_canalRealtime);

        _canalRealtime = supabaseClient
            .channel(nomeCanal)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos' },
                () => agendarAtualizacao(recarregar))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'parceiros' },
                () => agendarAtualizacao(recarregar))
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log('Atualização ao vivo ativa.');
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('Atualização ao vivo indisponível:', status);
                }
            });

        return _canalRealtime;
    } catch (e) {
        console.warn('Realtime indisponível:', e?.message || e);
        return null;
    }
}

/**
 * Rede de segurança: ao voltar para a aba, revalida os dados mesmo que o
 * websocket tenha caído enquanto a janela estava em segundo plano.
 */
function atualizarAoVoltarParaAba(recarregar) {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') agendarAtualizacao(recarregar);
    });
}

/**
 * Preenche o dropdown "Tipo de Documento" a partir do catálogo TERMOS_URC
 * (js/documentos.js, carregado após este arquivo).
 */
function popularFiltroTipoDocumento() {
    const select = document.getElementById('filtro-tipo');
    if (!select || select.options.length > 1 || typeof TERMOS_URC === 'undefined') return;
    Object.keys(TERMOS_URC).forEach(slug => {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = TERMOS_URC[slug].titulo;
        select.appendChild(opt);
    });
}

/**
 * Busca todos os parceiros com seus documentos e monta as linhas da lista
 */
async function carregarParceiros() {
    const tbody = document.getElementById('tbody-parceiros');
    if (!tbody) return;

    popularFiltroTipoDocumento();

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#999;">Carregando...</td></tr>';
    document.getElementById('pagination-status')?.innerText && (document.getElementById('pagination-status').textContent = '');
    document.getElementById('pagination-parceiros') && (document.getElementById('pagination-parceiros').innerHTML = '');

    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .order('created_at', { ascending: false });

    if (error) {
        // Sessão expirada leva ao login; só erro real vira mensagem na tela
        if (tratarErroDeSessao(error)) return;
        console.error('Erro ao carregar parceiros:', error.message);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#dc3545;">Erro ao carregar dados.</td></tr>';
        return;
    }

    dadosParceiros = montarLinhasDocumentos(data);
    dadosFiltrados = dadosParceiros;
    paginaParceiros = 1;
    renderizarTabelaParceiros();
}

/**
 * Recarrega a lista sem piscar "Carregando...", preservando os filtros e a
 * página em que o usuário está. Usada pela atualização ao vivo.
 */
async function recarregarListaAoVivo() {
    if (!document.getElementById('tbody-parceiros')) return;

    const paginaAtual = paginaParceiros;

    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .order('created_at', { ascending: false });

    if (error) {
        if (tratarErroDeSessao(error)) return;
        console.warn('Atualização ao vivo falhou:', error.message);
        return;
    }

    dadosParceiros = montarLinhasDocumentos(data);
    aplicarFiltrosParceiros(); // mantém os filtros escolhidos pelo usuário

    // Volta para a página em que o usuário estava, se ela ainda existir
    const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / registrosPorPagina));
    paginaParceiros = Math.min(paginaAtual, totalPaginas);
    renderizarTabelaParceiros();
}

/**
 * Renderiza a página atual da tabela com paginação.
 * Linhas são inseridas imediatamente (síncronas); botões de PDF
 * são adicionados em paralelo após a renderização inicial.
 */
function renderizarTabelaParceiros() {
    const tbody = document.getElementById('tbody-parceiros');
    if (!tbody) return;

    const total = dadosFiltrados.length;
    const inicio = (paginaParceiros - 1) * registrosPorPagina;
    const fim = Math.min(inicio + registrosPorPagina, total);
    const paginados = dadosFiltrados.slice(inicio, fim);

    tbody.innerHTML = '';

    if (paginados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#999;">Nenhum resultado encontrado.</td></tr>';
    } else {
        // Renderiza todas as linhas de forma síncrona de uma só vez
        paginados.forEach((linha, idx) => tbody.appendChild(criarLinhaDocumento(linha, idx)));

        // Verifica PDFs em paralelo e injeta botão na célula de status
        paginados.forEach((linha, idx) => {
            const { parceiro: p, doc } = linha;
            const injetarBotao = (onclick) => {
                const tr = tbody.querySelector(`tr[data-row="${idx}"]`);
                const statusCell = tr?.querySelector('.cell-status');
                if (!statusCell) return;
                const btn = document.createElement('button');
                btn.className = 'btn-termo-pdf';
                btn.title = 'Ver Termo PDF';
                btn.innerHTML = '<i class="fas fa-file-pdf"></i>';
                btn.onclick = (e) => { e.stopPropagation(); onclick(); };
                statusCell.appendChild(btn);
            };

            if (doc._lgpdDerivado && doc.status === 'aceito') {
                // LGPD legado: PDF resolvido pelo CPF no bucket
                verificarTermoPDF(p.cpf).then(temPDF => {
                    if (temPDF) injetarBotao(() => abrirTermoPDF(p.cpf));
                });
            } else if (doc.arquivo_path && doc.status === 'aceito') {
                // Demais termos: caminho gravado em documentos
                injetarBotao(() => abrirPDFPorPath(doc.arquivo_path));
            }
        });
    }

    // Status de registros
    const statusEl = document.getElementById('pagination-status');
    if (statusEl) {
        statusEl.textContent = total === 0
            ? 'Nenhum registro encontrado'
            : `Mostrando os registros ${inicio + 1} a ${fim} num total de ${total}`;
    }

    renderizarPaginacaoParceiros(total);
}

/**
 * Renderiza os botões de navegação de página
 */
function renderizarPaginacaoParceiros(total) {
    const container = document.getElementById('pagination-parceiros');
    if (!container) return;

    const totalPaginas = Math.ceil(total / registrosPorPagina);
    container.innerHTML = '';

    if (totalPaginas <= 1) return;

    const btnPrev = document.createElement('button');
    btnPrev.className = 'page-btn page-btn-label';
    btnPrev.textContent = 'Anterior';
    btnPrev.disabled = paginaParceiros === 1;
    btnPrev.onclick = () => { paginaParceiros--; renderizarTabelaParceiros(); };
    container.appendChild(btnPrev);

    const maxBotoes = 7;
    let ini = Math.max(1, paginaParceiros - Math.floor(maxBotoes / 2));
    let fim = Math.min(totalPaginas, ini + maxBotoes - 1);
    if (fim - ini < maxBotoes - 1) ini = Math.max(1, fim - maxBotoes + 1);

    for (let i = ini; i <= fim; i++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (i === paginaParceiros ? ' active' : '');
        btn.textContent = i;
        btn.onclick = ((pg) => () => { paginaParceiros = pg; renderizarTabelaParceiros(); })(i);
        container.appendChild(btn);
    }

    const btnNext = document.createElement('button');
    btnNext.className = 'page-btn page-btn-label';
    btnNext.textContent = 'Seguinte';
    btnNext.disabled = paginaParceiros === totalPaginas;
    btnNext.onclick = () => { paginaParceiros++; renderizarTabelaParceiros(); };
    container.appendChild(btnNext);
}

/**
 * Altera a quantidade de registros por página
 */
function alterarRegistrosPorPagina(valor) {
    registrosPorPagina = parseInt(valor);
    paginaParceiros = 1;
    renderizarTabelaParceiros();
}

// Mapeamento status → badge (Tela 1 da POC)
const BADGES_STATUS_DOC = {
    gerado:     { classe: 'badge-pendente', icone: 'file-lines',    rotulo: 'Gerado' },
    enviado:    { classe: 'badge-assinado', icone: 'paper-plane',   rotulo: 'Enviado' },
    aceito:     { classe: 'badge-sim',      icone: 'check-circle',  rotulo: 'Aceito' },
    recusado:   { classe: 'badge-recusado', icone: 'ban',           rotulo: 'Recusado' },
    // Cliente ainda sem documento enviado (linha derivada do Termo LGPD)
    nao_aceito: { classe: 'badge-pendente', icone: 'clock',         rotulo: 'Pendente' },
    // Cliente recém-cadastrado: nenhum termo foi gerado para ele ainda
    sem_documento: { classe: 'badge-pendente', icone: 'minus',      rotulo: 'Sem documento' }
};

/**
 * Abre um PDF do bucket TermosAceite pelo caminho gravado em documentos
 */
async function abrirPDFPorPath(path) {
    const { data, error } = await supabaseClient
        .storage
        .from('TermosAceite')
        .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
        alert('Documento não encontrado ou erro ao gerar link.');
        return;
    }
    window.open(data.signedUrl, '_blank');
}

/**
 * Cria uma linha da tabela para um documento de um parceiro (Tela 1 da POC).
 * linha = { parceiro, doc }; idx = posição na página (para injeção do PDF).
 */
function criarLinhaDocumento(linha, idx) {
    const { parceiro: p, doc } = linha;
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.dataset.id = p.id;
    tr.dataset.row = idx;
    // Tela 1 → Tela 6 da POC: linha/olho abrem o Acompanhamento do Atendimento
    tr.onclick = function () { window.location = 'acompanhamento?id=' + p.id; };

    const badge = BADGES_STATUS_DOC[doc.status] || BADGES_STATUS_DOC.nao_aceito;
    const statusBadge = `<span class="${badge.classe}"><i class="fas fa-${badge.icone}"></i> ${badge.rotulo}</span>`;

    const focoBadge = doc.salvo_foco
        ? '<span class="badge-foco">FOCO ✓</span>'
        : '<span class="badge-dash">—</span>';

    const dataEnvio = formatarDataHora(doc.data_envio);
    const dataAceite = formatarDataHora(doc.data_aceite);

    const acoes = `
        <button class="btn-action btn-action-view" title="Acompanhamento do atendimento" onclick="event.stopPropagation(); window.location='acompanhamento?id=${p.id}'">
            <i class="fas fa-eye"></i>
        </button>`;

    const accountId = p.id_salesforce || '-';

    tr.innerHTML = `
        <td>${p.cpf}</td>
        <td>${p.nome_razao_social}</td>
        <td>${p.telefone}</td>
        <td title="${p.id_salesforce || ''}">${accountId}</td>
        <td class="cell-documento" title="${doc.nome_documento || ''}">${doc.nome_documento || '-'}</td>
        <td class="cell-status">${statusBadge}</td>
        <td>${dataEnvio}</td>
        <td>${dataAceite}</td>
        <td>${focoBadge}</td>
        <td>${acoes}</td>
    `;

    return tr;
}

// ===== Funções da Lista de Parceiros =====

/**
 * Filtra as linhas de documento da lista (100% client-side sobre os dados
 * já carregados por carregarParceiros()).
 */
function filtrarParceiros() {
    aplicarFiltrosParceiros();
    paginaParceiros = 1;
    renderizarTabelaParceiros();
    atualizarBotaoLimparFiltros();
}

/**
 * Limpa os três filtros da lista e volta a mostrar todos os documentos.
 */
function limparFiltrosParceiros() {
    ['filtro-pesquisa', 'filtro-status', 'filtro-tipo'].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.value = '';
    });
    filtrarParceiros();
    document.getElementById('filtro-pesquisa')?.focus();
}

/** Algum filtro preenchido? */
function temFiltroAtivo() {
    return ['filtro-pesquisa', 'filtro-status', 'filtro-tipo']
        .some(id => (document.getElementById(id)?.value || '').trim() !== '');
}

/** O botão "Limpar" só fica disponível quando há filtro para limpar */
function atualizarBotaoLimparFiltros() {
    const btn = document.getElementById('btn-limpar-filtros');
    if (btn) btn.disabled = !temFiltroAtivo();
}

/**
 * Acompanha os campos de filtro para o botão "Limpar" refletir o estado da
 * tela mesmo antes de o consultor clicar em "Filtrar".
 */
function ligarBotaoLimparFiltros() {
    ['filtro-pesquisa', 'filtro-status', 'filtro-tipo'].forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.addEventListener('input', atualizarBotaoLimparFiltros);
        campo.addEventListener('change', atualizarBotaoLimparFiltros);
    });
    atualizarBotaoLimparFiltros();
}

/**
 * Recalcula `dadosFiltrados` a partir dos filtros da tela, sem mexer na
 * paginação nem renderizar — quem chama decide o que fazer depois.
 */
function aplicarFiltrosParceiros() {
    const pesquisa = document.getElementById('filtro-pesquisa')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('filtro-status')?.value || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';

    dadosFiltrados = dadosParceiros.filter(({ parceiro: p, doc }) => {
        if (status && doc.status !== status) return false;
        if (tipo && doc.tipo_documento !== tipo) return false;
        if (pesquisa) {
            const alvo = [
                p.cpf, p.nome_razao_social, p.telefone,
                p.id_salesforce, doc.nome_documento
            ].map(v => (v || '').toLowerCase());
            if (!alvo.some(v => v.includes(pesquisa))) return false;
        }
        return true;
    });
}

// ===== Controle de Permissões por Role =====

/**
 * Aplica as permissões visuais na página de detalhe de acordo com o role do usuário.
 * Os botões nascem ocultos no HTML e são exibidos aqui apenas para admin e operador,
 * evitando qualquer flash visual para o visualizador.
 */
function aplicarPermissoesDetalhe() {
    if (!usuarioPodeEditar()) return; // visualizador: botões permanecem ocultos

    const btnEditar = document.querySelector('.btn-editar-parceiro');
    if (btnEditar) btnEditar.style.display = '';
}

/**
 * Mesma regra na lista de clientes: o botão "Novo Cliente" (cadastro temporário
 * dos testes) só aparece para quem pode editar.
 */
function aplicarPermissoesLista() {
    if (!usuarioPodeEditar()) return;

    const btnNovo = document.querySelector('.btn-novo-cliente');
    if (btnNovo) btnNovo.style.display = '';
}

// ===== Cache leve de navegação (sessionStorage, stale-while-revalidate) =====
// Evita esperar a rede ao voltar para uma tela já visitada: pinta na hora com
// o valor em cache e revalida no banco em seguida.

const _TTL_CACHE_MS = 5 * 60 * 1000;

function cacheNavGet(chave) {
    try {
        const raw = sessionStorage.getItem(chave);
        if (!raw) return null;
        const { ts, valor } = JSON.parse(raw);
        if (Date.now() - ts > _TTL_CACHE_MS) return null;
        return valor;
    } catch {
        return null;
    }
}

function cacheNavSet(chave, valor) {
    try {
        sessionStorage.setItem(chave, JSON.stringify({ ts: Date.now(), valor }));
    } catch { /* cota cheia / modo privado: segue sem cache */ }
}

/** Invalida o cache de um parceiro (após editar/excluir) */
function invalidarCacheParceiro(id) {
    try { sessionStorage.removeItem('sbr_parceiro_' + id); } catch {}
}

// ===== Funções da Página de Detalhe =====

/**
 * Navega para o parceiro anterior ou próximo
 */
async function navegarParceiro(direcao) {
    const urlParams = new URLSearchParams(window.location.search);
    const idAtual = urlParams.get('id');
    if (!idAtual) return;

    // Busca todos os IDs ordenados
    const { data } = await supabaseClient
        .from('parceiros')
        .select('id')
        .order('created_at', { ascending: false });

    if (!data || data.length === 0) return;

    const ids = data.map(p => p.id);
    const indexAtual = ids.indexOf(idAtual);

    let novoIndex;
    if (direcao === 'anterior') {
        novoIndex = indexAtual > 0 ? indexAtual - 1 : ids.length - 1;
    } else {
        novoIndex = indexAtual < ids.length - 1 ? indexAtual + 1 : 0;
    }

    window.location.href = 'detalhe?id=' + ids[novoIndex];
}

// URL do webhook n8n que envia o termo LGPD via WhatsApp
/**
 * Registra a data de envio do Termo LGPD no cadastro do parceiro.
 * A lista deriva o status do LGPD das flags de `parceiros`, e o fluxo n8n
 * de aceite também trabalha nessa tabela — por isso o envio do LGPD
 * continua carimbando `data_envio` aqui, além da tabela `documentos`.
 */
async function registrarEnvioLGPDNoParceiro(parceiro) {
    const agora = new Date().toISOString();
    const { error } = await supabaseClient
        .from('parceiros')
        .update({ data_envio: agora })
        .eq('id', parceiro.id);

    if (error) {
        console.error('Erro ao registrar data de envio do LGPD:', error.message);
        return;
    }
    parceiro.data_envio = agora;
    invalidarCacheParceiro(parceiro.id);
}

/**
 * Carrega os dados do parceiro na página de detalhe
 */
async function carregarDetalhe() {
    // Estado inicial da barra de seleção de termos (0 selecionados, botão travado)
    atualizarBarraSelecao();

    // Tenta pegar o ID de várias formas (compatibilidade com diferentes servidores)
    let id = new URLSearchParams(window.location.search).get('id');
    
    // Fallback: tenta pegar do hash (caso o servidor redirecione)
    if (!id && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
        id = hashParams.get('id');
    }

    console.log('URL completa:', window.location.href);
    console.log('ID do parceiro:', id);

    if (!id) {
        document.getElementById('parceiro-nome').textContent = 'Parceiro não encontrado';
        return;
    }

    // 1) Cache: pinta imediatamente o que já foi visto nesta sessão
    const chaveCache = 'sbr_parceiro_' + id;
    const emCache = cacheNavGet(chaveCache);
    if (emCache) {
        parceiroAtual = emCache;
        pintarDetalheParceiro(emCache);
        aplicarPermissoesDetalhe();
        preencherConsultorDetalhe();
        carregarDadosFocoDetalhe(emCache);
    }

    // 2) Banco: revalida os dados
    const { data: parceiro, error } = await supabaseClient
        .from('parceiros')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !parceiro) {
        if (tratarErroDeSessao(error)) return;
        console.error('Erro ao carregar parceiro:', error?.message);
        if (!emCache) document.getElementById('parceiro-nome').textContent = 'Erro ao carregar parceiro';
        return;
    }

    // Armazena o parceiro atual para uso na edição
    parceiroAtual = parceiro;
    cacheNavSet(chaveCache, parceiro);
    pintarDetalheParceiro(parceiro);

    // Atualiza as informações
    const nomeEl = document.getElementById('parceiro-nome');
    if (nomeEl) nomeEl.textContent = parceiro.nome_razao_social;

    const infoNome = document.getElementById('info-nome');
    if (infoNome) infoNome.textContent = parceiro.nome_razao_social;

    const infoTermo = document.getElementById('info-termo');
    if (infoTermo) {
        if (parceiro.termo_aceito) {
            const temPDF = await verificarTermoPDF(parceiro.cpf);
            let termoHTML = '<span class="badge-sim"><i class="fas fa-check-circle"></i> Sim</span>';
            if (parceiro.termo_aceito_foco) {
                termoHTML += ' <span class="badge-foco">FOCO</span>';
            }
            if (temPDF) {
                termoHTML += ' <button class="btn-termo-pdf" title="Ver Termo PDF" onclick="abrirTermoPDF(\'' + parceiro.cpf + '\')"><i class="fas fa-file-pdf"></i></button>';
            }
            infoTermo.innerHTML = termoHTML;
        } else if (parceiro.recusado) {
            infoTermo.innerHTML = '<span class="badge-recusado"><i class="fas fa-ban"></i> Recusado</span>';
        } else {
            infoTermo.innerHTML = '<span class="badge-nao"><i class="fas fa-times-circle"></i> Não</span>';
        }
    }

    const infoCpf = document.getElementById('info-cpf');
    if (infoCpf) infoCpf.textContent = parceiro.cpf;

    const infoAccount = document.getElementById('info-account');
    if (infoAccount) infoAccount.textContent = parceiro.id_salesforce || '-';

    const infoTelefone = document.getElementById('info-telefone');
    if (infoTelefone) infoTelefone.textContent = parceiro.telefone;

    const infoSituacao = document.getElementById('info-situacao');
    if (infoSituacao) {
        const situacao = parceiro.termo_aceito ? 'Ativo' : 'Inativo';
        infoSituacao.textContent = situacao;
        infoSituacao.className = parceiro.termo_aceito
            ? 'badge-situacao-ativo'
            : 'badge-situacao-inativo';
    }

    // Atualiza validações
    const validacoesContainer = document.getElementById('validacoes-container');
    if (validacoesContainer) {
        validacoesContainer.innerHTML = '';

        const cpfValido = parceiro.cpf && parceiro.cpf.length === 14;
        const temTelefone = telefoneValido(parceiro.telefone);
        const nomeValido = parceiro.nome_razao_social && parceiro.nome_razao_social.length > 2;

        const termoLabel = parceiro.termo_aceito
            ? 'Termo LGPD Aceito'
            : (parceiro.recusado ? 'Termo LGPD Recusado' : 'Termo LGPD Não Aceito');
        const validacoes = [
            { label: 'CPF Válido', valido: cpfValido },
            { label: 'Cadastrado no FOCO', valido: true },
            { label: 'Nome Válido', valido: nomeValido },
            { label: 'Telefone Válido', valido: temTelefone },
            { label: termoLabel, valido: parceiro.termo_aceito }
        ];

        validacoes.forEach(v => {
            const badge = document.createElement('span');
            badge.className = `validacao-badge ${v.valido ? 'validacao-badge-success' : 'validacao-badge-danger'}`;
            badge.innerHTML = `<i class="fas fa-${v.valido ? 'check' : 'times'}"></i> ${v.label}`;
            validacoesContainer.appendChild(badge);
        });
    }

    // Atualiza mensagem informativa
    const infoMessage = document.querySelector('.info-message span');
    if (infoMessage) {
        const temTelefone = telefoneValido(parceiro.telefone);
        if (parceiro.recusado) {
            infoMessage.textContent = 'Este parceiro recusou o termo LGPD.';
            document.querySelector('.info-message').style.display = 'flex';
            document.querySelector('.info-message').style.backgroundColor = '';
            document.querySelector('.info-message').style.borderColor = '';
            document.querySelector('.info-message').style.color = '';
            document.querySelector('.info-message i') && (document.querySelector('.info-message i').style.color = '');
        } else if (temTelefone && !parceiro.termo_aceito) {
            infoMessage.textContent = 'Este parceiro pode receber o termo LGPD via WhatsApp.';
            document.querySelector('.info-message').style.display = 'flex';
        } else if (parceiro.termo_aceito) {
            infoMessage.textContent = 'Este parceiro já aceitou o termo LGPD.';
            document.querySelector('.info-message').style.display = 'flex';
            document.querySelector('.info-message').style.backgroundColor = '#d4edda';
            document.querySelector('.info-message').style.borderColor = '#c3e6cb';
            document.querySelector('.info-message').style.color = '#155724';
            document.querySelector('.info-message i').style.color = '#155724';
        } else {
            document.querySelector('.info-message').style.display = 'none';
        }
    }

    // Aplica restrições visuais baseadas no role do usuário
    aplicarPermissoesDetalhe();

    // Link para o acompanhamento deste cliente (Tela 6)
    const btnAcomp = document.getElementById('btn-acompanhamento');
    if (btnAcomp) btnAcomp.href = `acompanhamento?id=${encodeURIComponent(parceiro.id)}`;

    // Consultor = usuário logado (perfil carregado ou cache da navbar)
    preencherConsultorDetalhe();

    // Interação (Case) e e-mail vindos do FOCO — assíncrono, sem travar a tela
    carregarDadosFocoDetalhe(parceiro);
}

/**
 * Pinta os campos do cabeçalho/atendimento da tela de detalhe.
 * Usada tanto pelo cache (instantâneo) quanto pelos dados do banco.
 */
function pintarDetalheParceiro(parceiro) {
    const set = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor; };
    set('parceiro-nome', parceiro.nome_razao_social);
    set('info-nome', parceiro.nome_razao_social);
    set('info-cpf', parceiro.cpf);
    set('info-account', parceiro.id_salesforce || '-');
    set('info-telefone', parceiro.telefone);

    const btnAcomp = document.getElementById('btn-acompanhamento');
    if (btnAcomp) btnAcomp.href = `acompanhamento?id=${encodeURIComponent(parceiro.id)}`;
}

/**
 * Nome do consultor logado, com fallbacks em cadeia:
 * perfil carregado → cache da navbar → perfil no banco → e-mail do usuário.
 * Usado no card "Atendimento em andamento" e ao gravar documentos.
 */
async function nomeConsultorAtual() {
    const perfil = (typeof obterPerfilAtual === 'function') ? obterPerfilAtual() : null;
    if (perfil?.nome_completo) return perfil.nome_completo;

    const cache = sessionStorage.getItem('sbr_navbar_nome');
    if (cache) return cache;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;

        const { data } = await supabaseClient
            .from('perfis_usuarios')
            .select('nome_completo')
            .eq('id', user.id)
            .maybeSingle();

        return data?.nome_completo || user.email || null;
    } catch (e) {
        console.warn('nomeConsultorAtual:', e?.message || e);
        return null;
    }
}

/**
 * Preenche o campo Consultor com o nome do usuário logado.
 */
async function preencherConsultorDetalhe() {
    const el = document.getElementById('info-consultor');
    if (!el) return;
    const nome = await nomeConsultorAtual();
    if (nome) el.textContent = nome;
}

/**
 * Busca no FOCO (via proxy) os dados do Contact e a última interação (Case)
 * do parceiro e preenche a tela de detalhe. Em falha, mantém "—".
 */
async function carregarDadosFocoDetalhe(parceiro) {
    const interacaoEl = document.getElementById('info-interacao');
    if (!interacaoEl) return;

    const chaveCache = 'sbr_foco_' + (parceiro.cpf || '').replace(/\D/g, '');

    // Cache da sessão: mostra a interação na hora e revalida em seguida
    const emCache = cacheNavGet(chaveCache);
    if (emCache) {
        if (parceiroAtual && parceiroAtual.id === parceiro.id) {
            parceiroAtual._foco = emCache.contato || null;
            parceiroAtual._focoInteracao = emCache.interacao || null;
        }
        if (emCache.interacao?.CaseNumber) interacaoEl.textContent = emCache.interacao.CaseNumber;
        if (emCache.contatos) pintarCNPJFoco('info-cnpj', emCache.contatos, parceiro);
    }

    try {
        // Contacts e Case em paralelo (o Case também resolve por CPF via subquery).
        // Todos os Contacts do CPF: um mesmo CPF pode ter mais de uma conta/CNPJ.
        const [contatos, interacao] = await Promise.all([
            buscarContatosFocoPorCPF(parceiro.cpf),
            buscarUltimaInteracaoFoco(parceiro.id_contato_salesforce, parceiro.cpf)
        ]);
        const contato = escolherContatoFoco(contatos, parceiro.id_salesforce);

        if (parceiroAtual && parceiroAtual.id === parceiro.id) {
            parceiroAtual._foco = contato || null;
            if (interacao) parceiroAtual._focoInteracao = interacao;
        }
        if (interacao?.CaseNumber) interacaoEl.textContent = interacao.CaseNumber;
        pintarCNPJFoco('info-cnpj', contatos, parceiro);

        if (contato || interacao) cacheNavSet(chaveCache, { contato, interacao, contatos });
    } catch (e) {
        console.warn('FOCO indisponível para o detalhe:', e?.message || e);
    }
}

/**
 * Escreve o CNPJ do cliente (vindo do FOCO) no cabeçalho do Detalhe ou do
 * Acompanhamento. Havendo mais de uma conta, mostra a do cliente e sinaliza
 * as demais — a escolha de qual entra no termo é feita na tela do documento.
 */
function pintarCNPJFoco(elementoId, contatos, parceiro) {
    const el = document.getElementById(elementoId);
    if (!el) return;

    const lista = (typeof cnpjsDosContatos === 'function') ? cnpjsDosContatos(contatos) : [];
    if (!lista.length) {
        el.textContent = '—';
        el.removeAttribute('title');
        return;
    }

    const principal = (parceiro?.id_salesforce
        && lista.find(c => c.accountId === parceiro.id_salesforce)) || lista[0];
    el.textContent = principal.cnpj + (lista.length > 1 ? ` (+${lista.length - 1})` : '');
    if (lista.length > 1) {
        el.title = lista.map(c => (c.conta ? `${c.conta} — ${c.cnpj}` : c.cnpj)).join('\n');
    } else {
        el.removeAttribute('title');
    }
}

/**
 * Navega para a página de documentos com um ou vários termos selecionados.
 */
function abrirDocumentos(tipos) {
    if (!parceiroAtual?.id || !tipos.length) return;
    window.location.href = `documento?id=${encodeURIComponent(parceiroAtual.id)}`
        + `&tipos=${encodeURIComponent(tipos.join(','))}`;
}

/**
 * Navega para a página do documento de um único termo.
 * Mantida para os links diretos (ex.: retomada pelo Acompanhamento).
 */
function abrirDocumento(tipo) {
    abrirDocumentos([tipo]);
}

// ===== Seleção múltipla de termos (Tela 2 - detalhe) =====

// Slugs na ordem em que o consultor marcou (não na ordem da grade)
let _docsSelecionados = [];

/**
 * Marca/desmarca um card da grade de termos.
 * Cards com o mesmo data-tipo são o MESMO termo (a grade repete o
 * "Parcelamento de Débitos do MEI"): acendem juntos e o slug entra uma vez só.
 */
function alternarSelecaoDocumento(card) {
    const tipo = card.dataset.tipo;
    if (!tipo) return;

    const i = _docsSelecionados.indexOf(tipo);
    const marcado = i === -1;
    if (marcado) _docsSelecionados.push(tipo);
    else _docsSelecionados.splice(i, 1);

    document.querySelectorAll(`#documentos-grid .doc-card[data-tipo="${tipo}"]`)
        .forEach(c => c.classList.toggle('doc-card-sel', marcado));

    atualizarBarraSelecao();
}

/** Marca ou limpa todos os termos da grade */
function selecionarTodosDocumentos(marcar) {
    _docsSelecionados = [];
    document.querySelectorAll('#documentos-grid .doc-card').forEach(card => {
        card.classList.toggle('doc-card-sel', marcar);
        const tipo = card.dataset.tipo;
        if (marcar && tipo && !_docsSelecionados.includes(tipo)) _docsSelecionados.push(tipo);
    });
    atualizarBarraSelecao();
}

/** Atualiza contagem, chips e o botão "Prosseguir" da barra de seleção */
function atualizarBarraSelecao() {
    const total = _docsSelecionados.length;

    const contador = document.getElementById('sel-count');
    if (contador) contador.textContent = total;

    const chips = document.getElementById('sel-chips');
    if (chips) {
        chips.innerHTML = _docsSelecionados.map(tipo => {
            const card = document.querySelector(`#documentos-grid .doc-card[data-tipo="${tipo}"]`);
            const nome = card?.dataset.nome || tipo;
            return `<span class="doc-chip">${nome}</span>`;
        }).join('');
    }

    const btn = document.getElementById('btn-prosseguir-documentos');
    if (btn) {
        btn.disabled = total === 0;
        btn.innerHTML = total > 1
            ? `Prosseguir com ${total} documentos <i class="fas fa-arrow-right"></i>`
            : 'Prosseguir para edição <i class="fas fa-arrow-right"></i>';
    }
}

/** Abre a página de documentos com os termos marcados */
function prosseguirComDocumentos() {
    if (!_docsSelecionados.length) return;
    abrirDocumentos(_docsSelecionados);
}

// ===== Funções do Modal de Edição =====

// Armazena os dados do parceiro carregado para uso na edição
let parceiroAtual = null;

/**
 * Abre o modal de edição preenchido com os dados do parceiro atual
 */
function abrirModalEdicao() {
    if (!usuarioPodeEditar()) {
        alert('Você não tem permissão para editar parceiros.');
        return;
    }
    const modal = document.getElementById('modal-edicao');
    if (!modal || !parceiroAtual) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Preenche os campos com os dados atuais
    document.getElementById('edit-id').value = parceiroAtual.id;
    document.getElementById('edit-nome').value = parceiroAtual.nome_razao_social;
    document.getElementById('edit-cpf').value = parceiroAtual.cpf;
    document.getElementById('edit-telefone').value = formatarTelefoneParaCadastro(parceiroAtual.telefone);
    // E-mail: usa o do cadastro; se ainda não houver, mostra o do FOCO
    const emailEl = document.getElementById('edit-email');
    if (emailEl) emailEl.value = parceiroAtual.email || parceiroAtual._foco?.Email || '';

    // Limpa mensagens
    document.getElementById('edicao-sucesso').style.display = 'none';
    document.getElementById('edicao-erro').style.display = 'none';

    setTimeout(() => document.getElementById('edit-nome')?.focus(), 200);
}

/**
 * Abre o modal de confirmação para excluir o parceiro
 */
function deletarParceiro() {
    if (!usuarioPodeEditar()) {
        alert('Você não tem permissão para excluir clientes.');
        return;
    }
    if (!parceiroAtual) return;

    const modal = document.getElementById('modal-excluir');
    if (!modal) return;

    // Preenche os dados do parceiro no modal
    document.getElementById('excluir-nome').textContent = parceiroAtual.nome_razao_social;
    document.getElementById('excluir-cpf').textContent = parceiroAtual.cpf;
    document.getElementById('excluir-telefone').textContent = parceiroAtual.telefone;

    // Limpa mensagens anteriores
    document.getElementById('excluir-sucesso').style.display = 'none';
    document.getElementById('excluir-erro').style.display = 'none';
    document.getElementById('excluir-confirmacao').style.display = 'block';

    // Restaura botão
    const btn = document.getElementById('btn-confirmar-excluir');
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'flex';
    btn.querySelector('.spinner').style.display = 'none';

    // Quantos documentos serão apagados junto (FK on delete cascade em documentos)
    preencherAvisoExclusao();

    // Fecha o modal de edição e abre o de exclusão
    fecharModalEdicao();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Fecha o modal de exclusão
 */
function fecharModalExcluir() {
    const modal = document.getElementById('modal-excluir');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Confirma e exclui o parceiro do banco de dados
 */
async function confirmarExclusao() {
    const btn = document.getElementById('btn-confirmar-excluir');
    const sucessoDiv = document.getElementById('excluir-sucesso');
    const erroDiv = document.getElementById('excluir-erro');
    const erroMsg = document.getElementById('excluir-erro-msg');

    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Loading
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { error } = await supabaseClient
            .from('parceiros')
            .delete()
            .eq('id', parceiroAtual.id);

        if (error) {
            erroMsg.textContent = 'Erro ao excluir cliente: ' + error.message;
            erroDiv.style.display = 'flex';
            return;
        }

        invalidarCacheParceiro(parceiroAtual.id);
        document.getElementById('excluir-sucesso-msg').textContent = `Cliente "${parceiroAtual.nome_razao_social}" excluído com sucesso!`;
        sucessoDiv.style.display = 'flex';

        setTimeout(() => {
            window.location.href = '/';
        }, 1500);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

/**
 * Fecha o modal de edição
 */
function fecharModalEdicao() {
    const modal = document.getElementById('modal-edicao');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Diz, no modal de exclusão, quantos documentos serão apagados junto com o
 * cliente — a FK de `documentos` é ON DELETE CASCADE, então termos já aceitos
 * (com suas evidências) desaparecem também.
 */
async function preencherAvisoExclusao() {
    const el = document.getElementById('excluir-aviso-docs');
    if (!el || !parceiroAtual?.id) return;

    el.textContent = 'Verificando documentos vinculados…';

    const { count, error } = await supabaseClient
        .from('documentos')
        .select('id', { count: 'exact', head: true })
        .eq('parceiro_id', parceiroAtual.id);

    if (error) {
        el.textContent = 'Os documentos vinculados a este cliente também serão apagados.';
        return;
    }

    if (!count) {
        el.textContent = 'Este cliente ainda não possui documentos gerados.';
        return;
    }

    el.innerHTML = `Junto com o cliente será(ão) apagado(s) <b>${count} documento(s)</b>, `
        + 'incluindo termos já aceitos e suas evidências.';
}

/**
 * Salva as alterações do parceiro no Supabase
 */
async function salvarEdicao(event) {
    event.preventDefault();

    const id = document.getElementById('edit-id').value;
    const telefone = formatarTelefoneParaCadastro(document.getElementById('edit-telefone').value.trim());
    const email = (document.getElementById('edit-email')?.value || '').trim();
    const btnSalvar = document.getElementById('btn-salvar-edicao');
    const sucessoDiv = document.getElementById('edicao-sucesso');
    const erroDiv = document.getElementById('edicao-erro');
    const erroMsg = document.getElementById('edicao-erro-msg');

    // Esconde mensagens anteriores
    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Validação do telefone: 10 (fixo) ou 11 (celular) dígitos
    if (!telefoneValido(telefone)) {
        erroMsg.textContent = 'Telefone inválido. Digite o DDD e o número completo (fixo ou celular).';
        erroDiv.style.display = 'flex';
        return;
    }

    // Validação do e-mail (opcional, mas se preenchido deve ser válido)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        erroMsg.textContent = 'E-mail inválido. Verifique o endereço digitado.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Loading
    btnSalvar.disabled = true;
    btnSalvar.querySelector('.btn-text').style.display = 'none';
    btnSalvar.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { data, error } = await supabaseClient
            .from('parceiros')
            .update({ telefone: telefone, email: email || null })
            .eq('id', id)
            .select();

        if (error) {
            erroMsg.textContent = 'Erro ao atualizar: ' + error.message;
            erroDiv.style.display = 'flex';
            return;
        }

        invalidarCacheParceiro(id);
        // A mensagem diz o que de fato aconteceu: o cadastro sempre é salvo, mas
        // a sincronização no FOCO pode falhar — e o consultor precisa saber disso.
        let sucessoMsg = 'Cliente atualizado no cadastro e no FOCO.';

        // Atualizar telefone no Salesforce/FOCO (Contact) via API
        let contactId = parceiroAtual.id_contato_salesforce || null;
        console.log('[SalvarEdicao] id_contato_salesforce:', contactId);

        if (!contactId) {
            console.log('[SalvarEdicao] Buscando Contact Id no Salesforce por AccountId/CPF...');
            contactId = await buscarContactIdSalesforce(
                parceiroAtual.cpf || null,
                parceiroAtual.id_salesforce || null
            );
            console.log('[SalvarEdicao] Contact Id encontrado:', contactId);
            if (contactId) {
                await supabaseClient
                    .from('parceiros')
                    .update({ id_contato_salesforce: contactId })
                    .eq('id', id);
            }
        }

        if (contactId) {
            try {
                const campos = { Phone: telefone };
                if (email) campos.Email = email;
                await atualizarContatoSebrae(contactId, campos);
                console.log('[SalvarEdicao] Contato sincronizado no SEBRAE com sucesso.');
            } catch (err) {
                console.error('[SalvarEdicao] Erro ao sincronizar contato no SEBRAE:', err);
                sucessoMsg = 'Cliente atualizado no cadastro. Atenção: não foi possível atualizar no FOCO ('
                    + (err.message || 'erro desconhecido') + ').';
            }
        } else {
            console.warn('[SalvarEdicao] Contact Id não encontrado — sincronização com SEBRAE ignorada.');
            sucessoMsg = 'Cliente atualizado no cadastro. Atenção: este cliente não foi localizado no FOCO, '
                + 'então os dados não foram atualizados lá.';
        }

        document.getElementById('edicao-sucesso-msg').textContent = sucessoMsg;
        sucessoDiv.style.display = 'flex';

        // Recarrega os dados na página (o modal existe no detalhe e no acompanhamento)
        setTimeout(async () => {
            fecharModalEdicao();
            if (document.getElementById('parceiro-nome')) {
                await carregarDetalhe();
            } else if (typeof recarregarAcompanhamentoAoVivo === 'function') {
                await recarregarAcompanhamentoAoVivo();
                pintarCabecalhoAcompanhamento?.();
            }
        }, 1200);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.querySelector('.btn-text').style.display = 'flex';
        btnSalvar.querySelector('.spinner').style.display = 'none';
    }
}

// ===== Funções do Modal de Cadastro =====

/**
 * Abre o modal de cadastro de novo parceiro
 */
function abrirModalCadastro() {
    const modal = document.getElementById('modal-cadastro');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('form-cadastro')?.reset();
        document.getElementById('cadastro-sucesso').style.display = 'none';
        document.getElementById('cadastro-erro').style.display = 'none';
        setTimeout(() => document.getElementById('cad-nome')?.focus(), 200);
    }
}

/**
 * Fecha o modal de cadastro
 */
function fecharModalCadastro() {
    const modal = document.getElementById('modal-cadastro');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Converte o campo LGPD (Salesforce) para boolean
 */
function lgpdParaBoolean(val) {
    if (val === true || val === 'true' || val === 'Sim' || val === 'S' || val === 1) return true;
    return false;
}

/**
 * Formato padrão do telefone no sistema — o MESMO em parceiros, nos formulários
 * dos termos, no payload do n8n e no Phone do FOCO:
 *   celular (11 dígitos): (67)99245-1961
 *   fixo    (10 dígitos): (67)3389-5349   ← fixo pode ter WhatsApp Business
 * Só os dígitos importam; qualquer outra quantidade volta como veio.
 */
function formatarTelefoneParaCadastro(tel) {
    if (!tel) return '';
    const nums = String(tel).replace(/\D/g, '');
    if (nums.length === 11) return `(${nums.substring(0, 2)})${nums.substring(2, 7)}-${nums.substring(7)}`;
    if (nums.length === 10) return `(${nums.substring(0, 2)})${nums.substring(2, 6)}-${nums.substring(6)}`;
    return tel;
}

/** Só os dígitos do telefone (para comparar números escritos de formas diferentes) */
function digitosTelefone(tel) {
    return String(tel || '').replace(/\D/g, '');
}

/** Telefone utilizável: 10 (fixo) ou 11 (celular) dígitos */
function telefoneValido(tel) {
    const n = digitosTelefone(tel).length;
    return n === 10 || n === 11;
}

/**
 * Máscara de CPF: 000.000.000-00
 */
function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
}

/**
 * Máscara de Telefone: (00)0000-0000 enquanto há até 10 dígitos (fixo),
 * (00)00000-0000 ao chegar no 11º (celular). Antes o hífen era fixo após o
 * 5º dígito e um fixo saía como (67)33214-567.
 */
function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/, '($1)$2');
    v = v.length <= 12   // "(67)" + até 8 dígitos = fixo; o 9º dígito muda para o corte do celular
        ? v.replace(/^(\(\d{2}\)\d{4})(\d)/, '$1-$2')
        : v.replace(/^(\(\d{2}\)\d{5})(\d)/, '$1-$2');
    input.value = v;
}

/**
 * Cadastra um novo parceiro no Supabase
 */
async function cadastrarParceiro(event) {
    event.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim().toUpperCase();
    const cpf = document.getElementById('cad-cpf').value.trim();
    const telefone = formatarTelefoneParaCadastro(document.getElementById('cad-telefone').value.trim());
    const email = document.getElementById('cad-email')?.value.trim() || '';
    const btnSalvar = document.getElementById('btn-salvar');
    const sucessoDiv = document.getElementById('cadastro-sucesso');
    const erroDiv = document.getElementById('cadastro-erro');
    const erroMsg = document.getElementById('cadastro-erro-msg');

    // Esconde mensagens anteriores
    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Validação do CPF
    if (cpf.length < 14) {
        erroMsg.textContent = 'CPF inválido. Digite o CPF completo.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Validação do telefone: 10 (fixo) ou 11 (celular) dígitos
    if (!telefoneValido(telefone)) {
        erroMsg.textContent = 'Telefone inválido. Digite o DDD e o número completo (fixo ou celular).';
        erroDiv.style.display = 'flex';
        return;
    }

    // Loading
    btnSalvar.disabled = true;
    btnSalvar.querySelector('.btn-text').style.display = 'none';
    btnSalvar.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { data, error } = await supabaseClient
            .from('parceiros')
            .insert([{
                cpf: cpf,
                nome_razao_social: nome,
                telefone: telefone,
                email: email || null,
                termo_aceito: false,
                termo_aceito_foco: false,
                enviado_piiq: false
            }])
            .select();

        if (error) {
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
                erroMsg.textContent = 'CPF já cadastrado no sistema.';
            } else {
                erroMsg.textContent = 'Erro ao cadastrar: ' + error.message;
            }
            erroDiv.style.display = 'flex';
            return;
        }

        // Sucesso
        document.getElementById('cadastro-sucesso-msg').textContent = `Cliente "${nome}" cadastrado com sucesso!`;
        sucessoDiv.style.display = 'flex';
        document.getElementById('form-cadastro').reset();

        // Recarrega a tabela
        setTimeout(async () => {
            fecharModalCadastro();
            await carregarParceiros();
        }, 1200);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.querySelector('.btn-text').style.display = 'flex';
        btnSalvar.querySelector('.spinner').style.display = 'none';
    }
}

// Removido o fechamento automático ao clicar no overlay escuro.
// A partir daqui, os modais só são fechados pelos botões explícitos (X, Cancelar, etc.).

// Fechar modal com ESC
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharModalCadastro();
        fecharModalEdicao();
        fecharModalExcluir();
        fecharModalBusca();
    }
});

// ===== Modal Buscar Parceiro =====

let resultadosBusca = [];
let paginaBusca = 1;
let _buscaRegistrosPorCPF = {};
let _buscaFiltroDebounce = null;
let _buscaEmAndamento = false;
let _buscaTimeoutUiId = null;

function abrirModalBusca() {
    document.getElementById('modal-busca').style.display = 'flex';
    document.getElementById('busca-termo').value = '';
    document.getElementById('busca-resultados-container').style.display = 'none';
    document.getElementById('busca-vazio').style.display = 'none';
    document.getElementById('busca-loading').style.display = 'none';
    resultadosBusca = [];
    paginaBusca = 1;

    // Filtro em tempo real com debounce de 200ms
    const inputFiltro = document.getElementById('busca-filtro-rapido');
    inputFiltro.value = '';

    const novoInput = inputFiltro.cloneNode(true);
    inputFiltro.parentNode.replaceChild(novoInput, inputFiltro);

    novoInput.addEventListener('input', () => {
        clearTimeout(_buscaFiltroDebounce);
        _buscaFiltroDebounce = setTimeout(() => {
            paginaBusca = 1;
            renderizarResultadosBusca();
        }, 200);
    });

    setTimeout(() => document.getElementById('busca-termo').focus(), 100);
}

function fecharModalBusca() {
    const modal = document.getElementById('modal-busca');
    if (modal) modal.style.display = 'none';
}

function buscarParceiroEnter(event) {
    if (event.key === 'Enter') executarBuscaParceiro();
}

async function executarBuscaParceiro() {
    const termo = document.getElementById('busca-termo').value.trim();
    if (!termo) return;

    // Evita múltiplas buscas concorrentes
    if (_buscaEmAndamento) return;
    _buscaEmAndamento = true;

    const inputTermo = document.getElementById('busca-termo');
    const btnBuscar = document.querySelector('.btn-buscar-modal');
    const loadingEl = document.getElementById('busca-loading');
    const loadingTextoEl = loadingEl ? loadingEl.querySelector('span') : null;

    // Mensagem de loading diferente para CPF x Nome/Telefone
    const ehCPF = typeof pareceCPF === 'function' && pareceCPF(termo);
    const ehTelefone = typeof pareceTelefone === 'function' && pareceTelefone(termo);
    const textoOriginalLoading = loadingTextoEl ? loadingTextoEl.textContent : null;

    if (loadingTextoEl) {
        if (ehCPF) {
            loadingTextoEl.textContent = 'Buscando CPF...';
        } else if (ehTelefone) {
            loadingTextoEl.textContent = 'Buscando telefone (pode levar alguns segundos)...';
        } else {
            loadingTextoEl.textContent = 'Buscando por nome (pode levar alguns segundos)...';
        }
    }

    if (inputTermo) inputTermo.disabled = true;
    if (btnBuscar) {
        btnBuscar.disabled = true;
        btnBuscar.classList.add('is-loading');
    }

    document.getElementById('busca-loading').style.display = 'flex';
    document.getElementById('busca-resultados-container').style.display = 'none';
    document.getElementById('busca-vazio').style.display = 'none';

    // Fallback de segurança: mesmo que a Promise do fetch nunca resolva/rejeite,
    // garantimos que a UI não fique com o loading travado indefinidamente.
    if (_buscaTimeoutUiId) {
        clearTimeout(_buscaTimeoutUiId);
    }
    _buscaTimeoutUiId = setTimeout(() => {
        const vazioEl = document.getElementById('busca-vazio');
        if (vazioEl) {
            vazioEl.style.display = 'flex';
            vazioEl.innerHTML =
                `<i class="fas fa-exclamation-triangle" style="color:#dc3545;"></i>
                 <span style="color:#dc3545;">A busca demorou mais que o esperado e foi interrompida para não travar a tela. Nenhuma consulta está em andamento neste momento.</span>`;
        }
        document.getElementById('busca-loading').style.display = 'none';
        if (inputTermo) inputTermo.disabled = false;
        if (btnBuscar) {
            btnBuscar.disabled = false;
            btnBuscar.classList.remove('is-loading');
        }
        if (loadingTextoEl && textoOriginalLoading !== null) {
            loadingTextoEl.textContent = textoOriginalLoading;
        }
        _buscaEmAndamento = false;
    }, 35000);

    try {
        const resultado = await buscarContatosSebrae(termo);
        const registros = resultado.records || [];

        resultadosBusca = registros.map(mapearContatoParaTabela);
        _buscaRegistrosPorCPF = {};
        resultadosBusca.forEach(p => {
            if (p.cpf && p.cpf !== '—') {
                _buscaRegistrosPorCPF[p.cpf] = p;
            }
        });
        paginaBusca = 1;

        if (document.getElementById('busca-filtro-rapido')) {
            document.getElementById('busca-filtro-rapido').value = '';
        }

        if (resultadosBusca.length === 0) {
            document.getElementById('busca-vazio').style.display = 'flex';
        } else {
            document.getElementById('busca-resultados-container').style.display = 'block';
            renderizarResultadosBusca();
        }
    } catch (err) {
        console.error('Erro ao buscar na API SEBRAE:', err);
        const vazioEl = document.getElementById('busca-vazio');
        if (vazioEl) {
            vazioEl.style.display = 'flex';
            const mensagem = err && err.message
                ? err.message
                : 'Erro ao conectar com a API SEBRAE. Verifique o console para detalhes.';
            vazioEl.innerHTML =
                `<i class="fas fa-exclamation-triangle" style="color:#dc3545;"></i>
                 <span style="color:#dc3545;">${mensagem}</span>`;
        }
    } finally {
        if (_buscaTimeoutUiId) {
            clearTimeout(_buscaTimeoutUiId);
            _buscaTimeoutUiId = null;
        }

        document.getElementById('busca-loading').style.display = 'none';

        if (inputTermo) inputTermo.disabled = false;
        if (btnBuscar) {
            btnBuscar.disabled = false;
            btnBuscar.classList.remove('is-loading');
        }
        if (loadingTextoEl && textoOriginalLoading !== null) {
            loadingTextoEl.textContent = textoOriginalLoading;
        }

        _buscaEmAndamento = false;
    }
}

function renderizarResultadosBusca() {
    const filtroRapido = (document.getElementById('busca-filtro-rapido').value || '').toLowerCase();
    const porPagina = parseInt(document.getElementById('busca-por-pagina').value) || 10;

    let filtrados = resultadosBusca;
    if (filtroRapido) {
        filtrados = resultadosBusca.filter(p =>
            (p.nome || '').toLowerCase().includes(filtroRapido) ||
            (p.cpf || '').toLowerCase().includes(filtroRapido) ||
            (p.telefone || '').toLowerCase().includes(filtroRapido) ||
            (p.email || '').toLowerCase().includes(filtroRapido)
        );
    }

    document.getElementById('busca-total').textContent = filtrados.length;

    const inicio = (paginaBusca - 1) * porPagina;
    const paginados = filtrados.slice(inicio, inicio + porPagina);

    const tbody = document.getElementById('busca-tbody');
    tbody.innerHTML = '';

    if (paginados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Nenhum resultado encontrado.</td></tr>';
        document.getElementById('busca-pagination').innerHTML = '';
        return;
    }

    for (const p of paginados) {
        const tr = document.createElement('tr');

        const lgpdVal = p.lgpd;
        let lgpdBadge;
        if (lgpdVal === null || lgpdVal === undefined) {
            lgpdBadge = '<span class="badge-dash">—</span>';
        } else if (lgpdVal === true || lgpdVal === 'true' || lgpdVal === 'Sim' || lgpdVal === 'S') {
            lgpdBadge = '<span class="badge-sim"><i class="fas fa-check"></i> Sim</span>';
        } else if (lgpdVal === false || lgpdVal === 'false' || lgpdVal === 'Não' || lgpdVal === 'N') {
            lgpdBadge = '<span class="badge-nao"><i class="fas fa-times"></i> Não</span>';
        } else {
            lgpdBadge = `<span>${lgpdVal}</span>`;
        }

        const telefone = p.telefone || '<span class="badge-dash">—</span>';
        const email = p.email || '<span class="badge-dash">—</span>';

        tr.innerHTML = `
            <td>${p.nome}</td>
            <td>${p.cpf}</td>
            <td>${telefone}</td>
            <td>${email}</td>
            <td>${lgpdBadge}</td>
            <td></td>
        `;

        const btnConfirmar = document.createElement('button');
        btnConfirmar.className = 'btn-visualizar-busca';
        btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Cliente';

        if (!usuarioPodeEditar()) {
            btnConfirmar.disabled = true;
            btnConfirmar.title = 'Você não tem permissão para confirmar clientes';
            btnConfirmar.style.opacity = '0.4';
            btnConfirmar.style.cursor = 'not-allowed';
        } else {
            btnConfirmar.addEventListener('click', function () {
                visualizarParceiroBusca(p.cpf, this);
            });
        }

        tr.querySelector('td:last-child').appendChild(btnConfirmar);

        tbody.appendChild(tr);
    }

    const totalPaginas = Math.ceil(filtrados.length / porPagina);
    const paginacaoEl = document.getElementById('busca-pagination');
    paginacaoEl.innerHTML = '';

    if (totalPaginas > 1) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'page-btn';
        btnPrev.innerHTML = '&laquo;';
        btnPrev.disabled = paginaBusca === 1;
        btnPrev.onclick = () => { paginaBusca--; renderizarResultadosBusca(); };
        paginacaoEl.appendChild(btnPrev);

        const maxBotoes = 7;
        let ini2 = Math.max(1, paginaBusca - Math.floor(maxBotoes / 2));
        let fim = Math.min(totalPaginas, ini2 + maxBotoes - 1);
        if (fim - ini2 < maxBotoes - 1) ini2 = Math.max(1, fim - maxBotoes + 1);

        for (let i = ini2; i <= fim; i++) {
            const btn = document.createElement('button');
            btn.className = 'page-btn' + (i === paginaBusca ? ' active' : '');
            btn.textContent = i;
            btn.onclick = ((pg) => () => { paginaBusca = pg; renderizarResultadosBusca(); })(i);
            paginacaoEl.appendChild(btn);
        }

        const btnNext = document.createElement('button');
        btnNext.className = 'page-btn';
        btnNext.innerHTML = '&raquo;';
        btnNext.disabled = paginaBusca === totalPaginas;
        btnNext.onclick = () => { paginaBusca++; renderizarResultadosBusca(); };
        paginacaoEl.appendChild(btnNext);
    }
}

/**
 * Ao clicar em "Confirmar Parceiro", garante que o parceiro existe no Supabase
 * (inserindo se necessário com os dados do Salesforce) e abre o detalhe.
 */
async function visualizarParceiroBusca(cpf, btnEl) {
    if (!usuarioPodeEditar()) {
        alert('Você não tem permissão para confirmar clientes.');
        return;
    }
    if (!cpf || cpf === '—') return;

    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
    }

    try {
        let id = await buscarIdSupabasePorCPF(cpf);

        if (!id) {
            const registro = _buscaRegistrosPorCPF[cpf];

            if (!registro) {
                alert('Dados do parceiro não encontrados. Tente realizar a busca novamente.');
                return;
            }

            const telefone = formatarTelefoneParaCadastro(registro.telefone) || '';

            const { data, error } = await supabaseClient
                .from('parceiros')
                .insert([{
                    cpf: registro.cpf,
                    nome_razao_social: (registro.nome || '').toUpperCase(),
                    telefone: telefone,
                    termo_aceito: lgpdParaBoolean(registro.lgpd),
                    termo_aceito_foco: lgpdParaBoolean(registro.lgpd),
                    enviado_piiq: false,
                    id_salesforce: registro.account_id || null,
                    id_contato_salesforce: registro.id_contato_salesforce || null
                }])
                .select('id')
                .single();

            if (error) {
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    id = await buscarIdSupabasePorCPF(cpf);
                } else {
                    alert('Erro ao cadastrar parceiro: ' + error.message);
                    return;
                }
            } else {
                id = data?.id;
            }
        }

        if (id) {
            window.location.href = `detalhe?id=${id}`;
        }
    } catch (err) {
        console.error('Erro ao confirmar parceiro:', err);
        alert('Erro inesperado. Tente novamente.');
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-check"></i> Confirmar Cliente';
        }
    }
}

// Cache do role (mesma chave do auth.js) para exibir botões na página de detalhe sem esperar a rede
const _CACHE_ROLE_DETALHE = 'sbr_navbar_role';

/**
 * Aplica permissões na página de detalhe usando o role em cache (síncrono).
 * Assim os botões Editar e Enviar Termo aparecem logo no primeiro paint, sem esperar verificarAutenticacao.
 */
function aplicarPermissoesDetalheComCache() {
    const role = sessionStorage.getItem(_CACHE_ROLE_DETALHE);
    if (role !== 'admin' && role !== 'operador') return;

    // Cada botão só existe na sua página; o seletor já resolve
    const btnEditar = document.querySelector('.btn-editar-parceiro');
    if (btnEditar) btnEditar.style.display = '';

    const btnNovo = document.querySelector('.btn-novo-cliente');
    if (btnNovo) btnNovo.style.display = '';
}

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Página de detalhe: exibir botões Editar e Enviar Termo imediatamente se o usuário tem permissão (cache).
        // Evita o “flash” de só Voltar + Buscar e melhora a experiência.
        aplicarPermissoesDetalheComCache();

        // Autenticação e carregamento dos dados correm EM PARALELO: a sessão do
        // Supabase já está no storage do navegador, então as queries saem
        // autenticadas sem esperar o perfil ser buscado (economiza ~300ms).
        const promessaAuth = verificarAutenticacao();

        const promessaDados = (async () => {
            try {
                // Página de lista: carregar parceiros do banco
                if (document.getElementById('tbody-parceiros')) {
                    ligarBotaoLimparFiltros();
                    await carregarParceiros();
                    // Aceite/recusa chega pelo WhatsApp: atualiza a tela sozinha
                    await ligarAtualizacaoAoVivo('lista-clientes', recarregarListaAoVivo);
                    atualizarAoVoltarParaAba(recarregarListaAoVivo);
                }
                // Página de detalhe: carregar dados do parceiro
                if (document.getElementById('parceiro-nome')) {
                    await carregarDetalhe();
                }
            } catch (e) {
                console.warn('Carregamento inicial:', e?.message || e);
            }
        })();

        const session = await promessaAuth;
        if (!session) return; // verificarAutenticacao() já redirecionou

        await promessaDados;

        // Perfil só ficou disponível após o auth: reaplica o que depende dele
        aplicarPermissoesDetalhe();
        aplicarPermissoesLista();
        preencherConsultorDetalhe();

        // Filtros automáticos da tabela principal
        const filtroPesquisa = document.getElementById('filtro-pesquisa');
        const filtroStatus   = document.getElementById('filtro-status');
        const filtroTipo     = document.getElementById('filtro-tipo');

        if (filtroPesquisa) {
            let _debounceFiltroPesquisa = null;

            // Digitar: aguarda 350ms após parar de digitar
            filtroPesquisa.addEventListener('input', () => {
                clearTimeout(_debounceFiltroPesquisa);
                _debounceFiltroPesquisa = setTimeout(() => filtrarParceiros(), 350);
            });

            // Enter: filtra imediatamente
            filtroPesquisa.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(_debounceFiltroPesquisa);
                    filtrarParceiros();
                }
            });
        }

        // Selects: filtra ao mudar a opção
        filtroStatus?.addEventListener('change', () => filtrarParceiros());
        filtroTipo?.addEventListener('change', () => filtrarParceiros());
    } catch (err) {
        console.error('Erro na inicialização:', err);
    }
});
