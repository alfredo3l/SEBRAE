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
    void registrarLog('pdf_aberto', 'Abriu o PDF do termo', null, null, { path: nomeArquivo });
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
 * Achata parceiros + documentos em linhas de documento (Tela 1 da POC):
 * 1 linha por registro de `documentos` + a linha derivada do Termo LGPD
 * quando o cliente tem histórico dele nas flags de `parceiros`.
 * Cliente sem nenhum termo NÃO entra na lista (06/10/2026): consultar e
 * confirmar um cliente não pode criar registro na área de trabalho. Ele segue
 * gravado em `parceiros` (a seleção e o envio dependem disso) e é alcançado
 * pelo "Buscar Cliente".
 */
function montarLinhasDocumentos(parceiros) {
    const linhas = [];
    (parceiros || []).forEach(p => {
        const docs = p.documentos || [];
        const temRegistroLGPD = docs.some(d => d.tipo_documento === 'termo-lgpd');

        // Termo LGPD sem registro em `documentos`: resta o histórico das flags
        // de `parceiros` (fluxo antigo). Com registro, ele é a fonte — traz o
        // PDF, o status e a integração no FOCO, que as flags não têm.
        if (!temRegistroLGPD && temHistoricoLGPD(p)) {
            linhas.push(linhaLGPDDoParceiro(p));
        }

        docs.slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(d => linhas.push({ parceiro: p, doc: d }));
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
    if (!select || select.dataset.populado || typeof TERMOS_URC === 'undefined') return;
    select.dataset.populado = '1';
    Object.keys(TERMOS_URC).forEach(slug => {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = TERMOS_URC[slug].titulo;
        select.appendChild(opt);
    });
    if (typeof atualizarMultiFiltro === 'function') atualizarMultiFiltro('filtro-tipo');
}

/**
 * Busca todos os parceiros com seus documentos e monta as linhas da lista
 */
async function carregarParceiros() {
    const tbody = document.getElementById('tbody-parceiros');
    if (!tbody) return;

    popularFiltroTipoDocumento();

    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#999;">Carregando...</td></tr>';
    document.getElementById('pagination-status')?.innerText && (document.getElementById('pagination-status').textContent = '');
    document.getElementById('pagination-parceiros') && (document.getElementById('pagination-parceiros').innerHTML = '');

    const promessaFotos = carregarFotosAutores();   // em paralelo com a lista
    const promessaOcultos = carregarUsuariosOcultos();
    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .order('created_at', { ascending: false });

    if (error) {
        // Sessão expirada leva ao login; só erro real vira mensagem na tela
        if (tratarErroDeSessao(error)) return;
        console.error('Erro ao carregar parceiros:', error.message);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#dc3545;">Erro ao carregar dados.</td></tr>';
        return;
    }

    // O que a lista mostra depende do perfil (operador vê só os próprios
    // termos): sem esperar, o operador veria por um instante os de todos
    await esperarPerfilDaLista();
    await promessaFotos;
    await promessaOcultos;

    dadosParceiros = montarLinhasDocumentos(data);
    aplicarFiltrosParceiros();
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

    const promessaFotos = carregarFotosAutores();   // pega foto trocada no meio-tempo
    const promessaOcultos = carregarUsuariosOcultos();
    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .order('created_at', { ascending: false });

    if (error) {
        if (tratarErroDeSessao(error)) return;
        console.warn('Atualização ao vivo falhou:', error.message);
        return;
    }
    await esperarPerfilDaLista();
    await promessaFotos;
    await promessaOcultos;

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
        // Operador: diz o porquê da lista vazia — sem filtro (nada hoje) ou
        // pesquisando cliente que só tem termos fora da área dele
        let msg = 'Nenhum resultado encontrado.';
        if (_perfilAtual?.role === 'operador') {
            if (!temFiltroAtivo()) {
                msg = 'Nenhum termo gerado por você hoje.';
            } else if (termosForaDaAreaDoOperador(textoPesquisaLista()) > 0) {
                msg = 'Nenhum termo seu de hoje para esta pesquisa. Este cliente tem termos de outros dias ou de outros atendimentos — '
                    + '<button type="button" class="link-buscar-cliente" onclick="abrirBuscaComPesquisa()">use o Buscar Cliente</button>.';
            }
        }
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px; color:#999;">${msg}</td></tr>`;
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
    void registrarLog('pdf_aberto', 'Abriu o PDF do termo', null, null, { path });
}

// ===== Autoria dos termos (06/10/2026) =====
// documentos.criado_por/_nome/_email são gravados pelo banco (trigger) no
// INSERT e imutáveis — ver supabase_add_criado_por_documentos.sql.

/** Promessa do perfil do usuário (verificarAutenticacao), ligada no DOMContentLoaded */
let _promessaPerfilLista = null;

async function esperarPerfilDaLista() {
    if (_promessaPerfilLista) {
        try { await _promessaPerfilLista; } catch { /* sem perfil: escopo restrito */ }
    }
}

/**
 * Admin e visualizador veem os termos de todos; o operador, só os que gerou.
 * Vale só para a lista — no Acompanhamento o operador vê o histórico completo
 * do cliente (decisão do desenvolvedor). Sem perfil carregado, restringe.
 */
function veTodosOsTermos() {
    const role = _perfilAtual?.role;
    return role === 'admin' || role === 'visualizador';
}

/**
 * Área de trabalho do operador (item 4 do SEBRAE, 06/10/2026): só os termos
 * que ELE gerou e que foram gerados HOJE (data de criação, horário de MS).
 * É só exibição — nada é apagado nem alterado: os termos antigos seguem no
 * banco, para o admin/visualizador na lista e para todos no Acompanhamento.
 */
function termoVisivelNaLista(doc) {
    // Termos de usuário oculto (conta do desenvolvedor) somem para os demais
    if (usuarioOcultoParaMim(doc.criado_por)) return false;
    if (veTodosOsTermos()) return true;
    return !!doc.criado_por && doc.criado_por === _perfilAtual?.id && geradoHojeSebrae(doc);
}

/** Dia (aaaa-mm-dd) de uma data no horário de MS */
function chaveDiaSebrae(valor) {
    const p = partesDataSebrae(valor);
    return p ? `${p.year}-${p.month}-${p.day}` : null;
}

/** O termo foi gerado hoje? (created_at no horário de MS) */
function geradoHojeSebrae(doc) {
    return !!doc.created_at && chaveDiaSebrae(doc.created_at) === chaveDiaSebrae(new Date());
}

/**
 * À meia-noite de MS a área de trabalho do operador se renova sozinha, mesmo
 * com a página aberta: refiltra os dados já carregados (sem ir ao banco).
 * Computador que dormiu é coberto pelo atualizarAoVoltarParaAba().
 */
let _timerViradaDoDia = null;
function agendarViradaDoDia() {
    clearTimeout(_timerViradaDoDia);
    const agora = new Date();
    const p = partesDataSebrae(agora);
    // MS não tem horário de verão: segundos/milissegundos são os mesmos em qualquer fuso
    const msAteMeiaNoite = ((24 - Number(p.hour)) * 60 - Number(p.minute)) * 60000
        - agora.getSeconds() * 1000 - agora.getMilliseconds();
    _timerViradaDoDia = setTimeout(() => {
        if (document.getElementById('tbody-parceiros')) {
            aplicarFiltrosParceiros();
            const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / registrosPorPagina));
            paginaParceiros = Math.min(paginaParceiros, totalPaginas);
            renderizarTabelaParceiros();
        }
        agendarViradaDoDia();
    }, msAteMeiaNoite + 2000);   // 2 s de folga para já estar no novo dia
}

/**
 * Fotos dos autores (perfis_usuarios.foto_url), buscadas ao vivo junto com a
 * lista — trocar a foto no perfil reflete na próxima carga. A RLS só expõe
 * perfis ativos (inativos só para admin): sem foto visível, ficam as iniciais.
 */
let _fotosAutores = {};

// Tamanhos pedidos ao Supabase (2x o exibido, para telas de alta densidade)
const PX_FOTO_AVATAR = 64;    // círculo de 30px da tabela
const PX_FOTO_CARTAO = 224;   // foto de 112px do cartão do mouse
// Tempo máximo que a lista espera as fotos antes de ser desenhada
const ESPERA_MAX_FOTOS_MS = 1500;

/**
 * Miniatura gerada pelo Supabase (transformação de imagem) em vez do original:
 * as fotos enviadas chegam a ~2 MB e eram baixadas inteiras para um círculo de
 * 30px. 64px = ~1–7 KB, com cache no navegador (max-age 3600). O "?v=" gravado
 * no upload (perfil.js) é repassado: foto trocada = URL nova, sem cache velho.
 * URL fora do padrão do Storage volta como está.
 */
function urlFotoAutor(foto, px) {
    const m = String(foto || '').match(/^(https?:\/\/[^?#]+?)\/storage\/v1\/object\/public\/([^?#]+)(\?[^#]*)?$/);
    if (!m) return foto;
    const extra = m[3] ? '&' + m[3].slice(1) : '';
    return `${m[1]}/storage/v1/render/image/public/${m[2]}?width=${px}&height=${px}&resize=cover&quality=80${extra}`;
}

/** Baixa e decodifica a imagem; nunca rejeita (falha = segue com as iniciais) */
const _fotosPreCarregadas = [];   // mantém as referências durante a página
function preCarregarImagem(src) {
    return new Promise(resolve => {
        const img = new Image();
        _fotosPreCarregadas.push(img);
        img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(resolve);
        img.onerror = () => resolve();
        img.src = src;
    });
}

/**
 * Busca o mapa id→foto e já pré-carrega as miniaturas — em paralelo com a
 * consulta da lista —, para a tabela nascer com as fotos em vez de elas
 * "piscarem" depois. Espera no máximo ESPERA_MAX_FOTOS_MS: rede lenta não
 * trava a lista (a foto aparece quando chegar). As fotos do cartão (224px)
 * vêm em segundo plano. São poucos usuários: pré-carrega todos, o que cobre
 * qualquer página da paginação.
 */
async function carregarFotosAutores() {
    try {
        const { data, error } = await supabaseClient
            .from('perfis_usuarios')
            .select('id, foto_url')
            .not('foto_url', 'is', null);
        if (error) throw error;
        const mapa = {};
        (data || []).forEach(u => { if (u.foto_url) mapa[u.id] = u.foto_url; });
        _fotosAutores = mapa;

        const fotos = Object.values(mapa);
        fotos.forEach(f => preCarregarImagem(urlFotoAutor(f, PX_FOTO_CARTAO)));
        await Promise.race([
            Promise.all(fotos.map(f => preCarregarImagem(urlFotoAutor(f, PX_FOTO_AVATAR)))),
            new Promise(r => setTimeout(r, ESPERA_MAX_FOTOS_MS))
        ]);
    } catch (e) {
        console.warn('Fotos dos autores:', e?.message || e);   // segue com as iniciais
    }
}

// iniciaisDoNome() e corDoAutor() ficam em js/auth.js (usadas também na Gestão de Usuários)

/** Célula "Criado por": círculo com as iniciais; nome e e-mail ao passar o mouse */
function celulaAutorDocumento(doc) {
    const nome = doc.criado_por_nome || '';
    const email = doc.criado_por_email || '';
    if ((!doc.criado_por && !nome && !email) || usuarioOcultoParaMim(doc.criado_por)) {
        return '<span class="badge-dash" title="Autor não registrado (termo anterior ao controle de autoria ou gerado automaticamente)">—</span>';
    }
    // Com foto: a imagem cobre as iniciais; se não carregar, ela sai e as iniciais aparecem
    const foto = doc.criado_por && _fotosAutores[doc.criado_por];
    const src = foto ? urlFotoAutor(foto, PX_FOTO_AVATAR) : '';
    const img = src ? `<img src="${escHTMLLista(src)}" alt="" onerror="this.remove()">` : '';
    // Sem "title": o cartão do mouse (mostrarCartaoAutor) traz foto ampliada, nome e e-mail
    return `<span class="avatar-autor" style="background:${corDoAutor(email || nome)}"
        data-nome="${escHTMLLista(nome)}" data-email="${escHTMLLista(email)}" data-foto="${escHTMLLista(foto ? urlFotoAutor(foto, PX_FOTO_CARTAO) : '')}"
        aria-label="Criado por ${escHTMLLista([nome, email].filter(Boolean).join(' — '))}">${escHTMLLista(iniciaisDoNome(nome || email))}${img}</span>`;
}

/**
 * Cartão do autor ao passar o mouse no avatar: foto ampliada (quando houver e
 * carregar), nome e e-mail. O title nativo não mostra imagem, por isso é um
 * elemento próprio — preso ao body para não ser cortado pela rolagem da tabela.
 */
let _cartaoAutor = null;

function mostrarCartaoAutor(avatar) {
    if (!_cartaoAutor) {
        _cartaoAutor = document.createElement('div');
        _cartaoAutor.className = 'cartao-autor';
        _cartaoAutor.setAttribute('role', 'tooltip');
        document.body.appendChild(_cartaoAutor);
    }
    const { nome, email, foto } = avatar.dataset;
    // Só mostra a foto se a miniatura carregou (onerror a removeu → sem foto)
    const fotoOk = foto && avatar.querySelector('img');
    _cartaoAutor.innerHTML =
        // Fundo na cor do usuário: foto PNG com transparência não some no cartão branco
        (fotoOk ? `<img class="cartao-autor-foto" src="${escHTMLLista(foto)}" alt="" style="background:${avatar.style.background}">` : '') +
        (nome ? `<div class="cartao-autor-nome">${escHTMLLista(nome)}</div>` : '') +
        (email ? `<div class="cartao-autor-email">${escHTMLLista(email)}</div>` : '') +
        '<div class="cartao-autor-rotulo">Gerou este termo</div>';

    // Acima do avatar, centralizado; sem espaço em cima, vai para baixo
    _cartaoAutor.style.visibility = 'hidden';
    _cartaoAutor.classList.add('visivel');
    const a = avatar.getBoundingClientRect();
    const c = _cartaoAutor.getBoundingClientRect();
    const margem = 8;
    let top = a.top - c.height - margem;
    if (top < margem) top = a.bottom + margem;
    let left = a.left + a.width / 2 - c.width / 2;
    left = Math.max(margem, Math.min(left, window.innerWidth - c.width - margem));
    _cartaoAutor.style.top = `${top + window.scrollY}px`;
    _cartaoAutor.style.left = `${left + window.scrollX}px`;
    _cartaoAutor.style.visibility = '';
}

function esconderCartaoAutor() {
    _cartaoAutor?.classList.remove('visivel');
}

// Delegação: a tabela é redesenhada a cada filtro/página/atualização ao vivo
document.addEventListener('mouseover', e => {
    const avatar = e.target.closest?.('.avatar-autor');
    if (avatar) mostrarCartaoAutor(avatar);
});
document.addEventListener('mouseout', e => {
    const avatar = e.target.closest?.('.avatar-autor');
    if (avatar && !avatar.contains(e.relatedTarget)) esconderCartaoAutor();
});
window.addEventListener('scroll', esconderCartaoAutor, true);

/** Escapa texto para atributos/HTML da lista */
function escHTMLLista(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        <td class="cell-autor">${celulaAutorDocumento(doc)}</td>
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

/** Campos de filtro da lista ("filtro-usuario" só aparece para o administrador) */
const CAMPOS_FILTRO_LISTA = ['filtro-pesquisa', 'filtro-status', 'filtro-tipo', 'filtro-usuario'];

/**
 * Limpa os filtros da lista e volta a mostrar todos os documentos.
 */
function limparFiltrosParceiros() {
    CAMPOS_FILTRO_LISTA.forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;
        if (campo.multiple) limparMultiFiltro(id);
        else campo.value = '';
    });
    filtrarParceiros();
    document.getElementById('filtro-pesquisa')?.focus();
}

/** Algum filtro preenchido? */
function temFiltroAtivo() {
    return CAMPOS_FILTRO_LISTA.some(id => {
        const campo = document.getElementById(id);
        if (!campo) return false;
        return campo.multiple ? valoresMultiFiltro(id).length > 0 : campo.value.trim() !== '';
    });
}

/**
 * Status, Tipo de Documento e Usuário viram filtros multisseleção com busca
 * digitável (js/multi-filtro.js). Nenhuma opção marcada = Todos.
 */
function inicializarMultiFiltrosLista() {
    if (typeof criarMultiFiltro !== 'function') return;
    popularFiltroTipoDocumento();   // opções do tipo antes de montar o componente
    ['filtro-status', 'filtro-tipo', 'filtro-usuario'].forEach(id =>
        criarMultiFiltro(document.getElementById(id)));
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
    CAMPOS_FILTRO_LISTA.forEach(id => {
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
    // Multisseleção: lista vazia = Todos
    const status = valoresMultiFiltro('filtro-status');
    const tipo = valoresMultiFiltro('filtro-tipo');
    // Filtro por autor: só vale para o administrador (o campo só aparece para ele)
    const usuario = _perfilAtual?.role === 'admin' ? valoresMultiFiltro('filtro-usuario') : [];

    dadosFiltrados = dadosParceiros.filter(({ parceiro: p, doc }) => {
        if (!termoVisivelNaLista(doc)) return false;
        if (status.length && !status.includes(doc.status)) return false;
        if (tipo.length && !tipo.includes(doc.tipo_documento)) return false;
        if (usuario.length && !usuario.includes(doc.criado_por)) return false;
        if (pesquisa && !linhaCasaPesquisa(p, doc, pesquisa)) return false;
        return true;
    });
}

/** A linha (cliente + termo) contém o texto pesquisado? (pesquisa já em minúsculas) */
function linhaCasaPesquisa(p, doc, pesquisa) {
    return [
        p.cpf, p.nome_razao_social, p.telefone,
        p.id_salesforce, doc.nome_documento,
        doc.criado_por_nome, doc.criado_por_email
    ].some(v => (v || '').toLowerCase().includes(pesquisa));
}

/** Texto do campo Pesquisar, normalizado como a filtragem usa */
function textoPesquisaLista() {
    return document.getElementById('filtro-pesquisa')?.value.trim().toLowerCase() || '';
}

/**
 * Operador: quantos termos casam com a pesquisa mas estão FORA da área de
 * trabalho dele (outros dias ou outros operadores). Os dados já estão
 * carregados (a RLS libera a leitura) — só a tela os esconde. 0 para os
 * demais perfis.
 */
function termosForaDaAreaDoOperador(pesquisa) {
    if (veTodosOsTermos() || !pesquisa) return 0;
    return dadosParceiros.filter(({ parceiro: p, doc }) =>
        !termoVisivelNaLista(doc) && !usuarioOcultoParaMim(doc.criado_por)
        && linhaCasaPesquisa(p, doc, pesquisa)).length;
}

/**
 * Pesquisa confirmada (Enter ou botão Filtrar): filtra e, se o operador não
 * achou nada na área dele mas o cliente tem termos em outros dias/atendimentos,
 * abre o popup orientando a usar o Buscar Cliente. Enquanto ele só digita, o
 * aviso aparece na própria tabela (renderizarTabelaParceiros), sem interromper.
 */
function confirmarPesquisaLista() {
    filtrarParceiros();
    if (dadosFiltrados.length === 0 && termosForaDaAreaDoOperador(textoPesquisaLista()) > 0) {
        abrirModalPesquisaDia(document.getElementById('filtro-pesquisa').value.trim());
    }
}

function abrirModalPesquisaDia(termo) {
    const modal = document.getElementById('modal-pesquisa-dia');
    if (!modal) return;
    document.getElementById('modal-pesquisa-dia-termo').textContent = termo;
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('btn-pesquisa-dia-buscar')?.focus(), 50);
}

function fecharModalPesquisaDia() {
    const modal = document.getElementById('modal-pesquisa-dia');
    if (modal) modal.style.display = 'none';
}

/** Do popup para o Buscar Cliente, já com o texto digitado e a busca no FOCO disparada */
function abrirBuscaComPesquisa() {
    const termo = document.getElementById('filtro-pesquisa')?.value.trim() || '';
    fecharModalPesquisaDia();
    abrirModalBusca();
    const campo = document.getElementById('busca-termo');
    if (!campo || !termo) return;
    campo.value = termo;
    atualizarBotaoLimparBusca();
    executarBuscaParceiro();
}

/**
 * Opções do filtro "Usuário" (só administrador): operadores primeiro e, num
 * grupo à parte, administradores — admin também gera termos. Inativos entram
 * marcados, pois podem ter termos antigos (a RLS mostra inativos ao admin).
 * Valor = id do usuário, comparado com documentos.criado_por.
 */
async function popularFiltroUsuario() {
    const select = document.getElementById('filtro-usuario');
    if (!select || select.dataset.populado) return;
    select.dataset.populado = '1';

    const { data, error } = await supabaseClient
        .from('perfis_usuarios')
        .select('id, nome_completo, email, role, ativo, oculto')
        .in('role', ['operador', 'admin'])
        .order('nome_completo');
    if (error) {
        console.warn('Filtro de usuário:', error.message);
        delete select.dataset.populado;   // tenta de novo na próxima chamada
        return;
    }

    const grupo = (rotulo, role) => {
        const usuarios = (data || []).filter(u => u.role === role && !(u.oculto && !veUsuariosOcultos()));
        if (!usuarios.length) return '';
        const opcoes = usuarios.map(u => {
            const nome = u.nome_completo || u.email;
            // Homônimos (há duas "Patricia Regina de Souza"): o e-mail desempata
            const homonimo = usuarios.filter(x => (x.nome_completo || x.email) === nome).length > 1;
            const texto = nome + (homonimo ? ` (${u.email})` : '') + (u.ativo ? '' : ' — inativo');
            return `<option value="${escHTMLLista(u.id)}" title="${escHTMLLista(u.email)}">${escHTMLLista(texto)}</option>`;
        }).join('');
        return `<optgroup label="${rotulo}">${opcoes}</optgroup>`;
    };
    select.insertAdjacentHTML('beforeend', grupo('Operadores', 'operador') + grupo('Administradores', 'admin'));
    if (typeof atualizarMultiFiltro === 'function') atualizarMultiFiltro('filtro-usuario');
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
 * Botão "Novo Cliente" (cadastro temporário dos testes de envio): só para o
 * Administrador SEBRAE (admin@sebrae.com.br) — decisão do desenvolvedor de
 * 08/10/2026; em produção o cadastro é exclusivamente pelo FOCO.
 */
function podeCadastrarClienteTeste() {
    return _perfilAtual?.role === 'admin' && _perfilAtual?.ativo === true
        && ehAdminPrincipal(_perfilAtual);
}

/**
 * Permissões visuais da lista de clientes.
 */
function aplicarPermissoesLista() {
    // Operador pesquisa só na área de trabalho dele (termos dele de hoje)
    if (_perfilAtual?.role === 'operador') {
        const pesquisa = document.getElementById('filtro-pesquisa');
        // Rótulo = escopo (só os termos dele de hoje); campo = o que digitar
        const rotulo = document.getElementById('rotulo-pesquisa');
        if (rotulo) rotulo.textContent = 'Pesquisar nos seus termos de hoje';
        if (pesquisa) pesquisa.placeholder = 'Nome, CPF, telefone ou Account ID';
    }

    if (_perfilAtual?.role === 'admin' && _perfilAtual?.ativo === true) {
        const grupo = document.getElementById('grupo-filtro-usuario');
        if (grupo) {
            grupo.hidden = false;
            popularFiltroUsuario();
        }
    }

    const btnNovo = document.querySelector('.btn-novo-cliente');
    if (btnNovo) btnNovo.style.display = podeCadastrarClienteTeste() ? '' : 'none';
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
    if (!podeCadastrarClienteTeste()) return;
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
 * Cadastra um novo parceiro no Supabase
 */
async function cadastrarParceiro(event) {
    event.preventDefault();
    if (!podeCadastrarClienteTeste()) return;

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
            .select('id')
            .single();

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

        // Cliente sem termo não aparece na lista: segue direto para a seleção
        // de documentos, como o "Confirmar Cliente" da busca
        setTimeout(() => {
            window.location.href = `detalhe?id=${data.id}`;
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
        fecharModalPesquisaDia();
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

    atualizarBotaoLimparBusca();
    setTimeout(() => document.getElementById('busca-termo').focus(), 100);
}

/**
 * "Limpar" do modal Buscar Cliente: apaga o termo, os resultados e o filtro
 * rápido e devolve o foco ao campo — para começar outra busca sem fechar o modal.
 */
function limparBuscaParceiro() {
    if (_buscaEmAndamento) return;
    document.getElementById('busca-termo').value = '';
    const filtroRapido = document.getElementById('busca-filtro-rapido');
    if (filtroRapido) filtroRapido.value = '';
    document.getElementById('busca-resultados-container').style.display = 'none';
    document.getElementById('busca-vazio').style.display = 'none';
    resultadosBusca = [];
    paginaBusca = 1;
    atualizarBotaoLimparBusca();
    document.getElementById('busca-termo').focus();
}

/** Habilita o "Limpar" só quando há termo digitado ou resultado (ou aviso) na tela */
function atualizarBotaoLimparBusca() {
    const btn = document.getElementById('btn-limpar-busca');
    if (!btn) return;
    const termo = (document.getElementById('busca-termo')?.value || '').trim();
    const visivel = id => document.getElementById(id)?.style.display !== 'none';
    btn.disabled = _buscaEmAndamento
        || !(termo || visivel('busca-resultados-container') || visivel('busca-vazio'));
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

    // Número incompleto (ex.: "009.85"): avisa na hora em vez de cair na busca
    // lenta por nome no FOCO, que não acharia nada
    const incompleto = typeof avisoNumeroIncompleto === 'function' ? avisoNumeroIncompleto(termo) : null;
    if (incompleto) {
        const vazioEl = document.getElementById('busca-vazio');
        document.getElementById('busca-resultados-container').style.display = 'none';
        document.getElementById('busca-loading').style.display = 'none';
        if (vazioEl) {
            vazioEl.style.display = 'flex';
            vazioEl.innerHTML = `<i class="fas fa-keyboard" style="color:#b45309;"></i>
                 <span style="color:#92400e;">${incompleto}</span>`;
        }
        atualizarBotaoLimparBusca();
        document.getElementById('busca-termo').focus();
        return;
    }

    // Evita múltiplas buscas concorrentes
    if (_buscaEmAndamento) return;
    _buscaEmAndamento = true;
    atualizarBotaoLimparBusca();

    const inputTermo = document.getElementById('busca-termo');
    const btnBuscar = document.querySelector('.btn-buscar-modal');
    const loadingEl = document.getElementById('busca-loading');
    const loadingTextoEl = loadingEl ? loadingEl.querySelector('span') : null;

    // Mensagem de loading diferente para CPF x Nome/Telefone
    const ehCPF = typeof pareceCPF === 'function' && pareceCPF(termo);
    const ehCNPJ = typeof pareceCNPJ === 'function' && pareceCNPJ(termo);
    const ehTelefone = typeof pareceTelefone === 'function' && pareceTelefone(termo);
    const textoOriginalLoading = loadingTextoEl ? loadingTextoEl.textContent : null;

    if (loadingTextoEl) {
        if (ehCPF) {
            loadingTextoEl.textContent = 'Buscando CPF...';
        } else if (ehCNPJ) {
            loadingTextoEl.textContent = 'Buscando CNPJ...';
        } else if (ehTelefone) {
            loadingTextoEl.textContent = 'Buscando telefone no FOCO...';
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
        atualizarBotaoLimparBusca();
    }, 70000); // acima dos 60 s da consulta (busca por telefone leva ~30 s no FOCO)

    try {
        const resultado = await buscarContatosSebrae(termo);
        const registros = resultado.records || [];
        void registrarLog('busca_foco', `Buscou no FOCO: "${termo}" (${registros.length} resultado(s))`, null, null,
            { termo, tipo: ehCPF ? 'cpf' : ehCNPJ ? 'cnpj' : ehTelefone ? 'telefone' : 'nome', resultados: registros.length });

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
        void registrarLog('busca_foco', `Buscou no FOCO: "${termo}" (erro na consulta)`, null, null,
            { termo, resultados: null, erro: err?.message || String(err) });
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
        atualizarBotaoLimparBusca();
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
    // "Novo Cliente" não sai do cache: o role não basta (só o Administrador
    // SEBRAE o vê) — aplicarPermissoesLista() decide após carregar o perfil.
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
        _promessaPerfilLista = promessaAuth;

        const promessaDados = (async () => {
            try {
                // Página de lista: carregar parceiros do banco
                if (document.getElementById('tbody-parceiros')) {
                    inicializarMultiFiltrosLista();
                    ligarBotaoLimparFiltros();
                    await carregarParceiros();
                    agendarViradaDoDia();   // operador: lista do dia se renova à meia-noite
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
                    confirmarPesquisaLista();   // pode abrir o popup do operador
                }
            });
        }

        // Selects: filtra ao mudar a opção
        filtroStatus?.addEventListener('change', () => filtrarParceiros());
        filtroTipo?.addEventListener('change', () => filtrarParceiros());
        document.getElementById('filtro-usuario')?.addEventListener('change', () => filtrarParceiros());
    } catch (err) {
        console.error('Erro na inicialização:', err);
    }
});
