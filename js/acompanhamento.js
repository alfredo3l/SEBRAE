/* ============================================
   SEBRAE - Termos URC - Acompanhamento do Atendimento
   acompanhamento.html?id=<parceiro>  (Tela 6 da POC)
   Cards de documentos + timeline de evidências + recusa
   ============================================ */

let _acompParceiro = null;
let _acompDocs = [];          // linhas { doc } — LGPD derivado + registros de documentos
let _acompSelecionado = 0;    // índice do documento selecionado (timeline)

/** Escapa HTML (página tem escHTML só quando documentos.js está carregado) */
function escAcomp(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Monta a lista de documentos do atendimento: linha LGPD derivada das flags
 * de parceiros (fonte viva — reusa linhaLGPDDoParceiro de app.js) + registros
 * de documentos com tipo != termo-lgpd, mais recentes primeiro.
 */
function montarDocsAcompanhamento(p) {
    const docs = [];
    (p.documentos || [])
        .filter(d => d.tipo_documento !== 'termo-lgpd')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .forEach(d => docs.push(d));

    // Linha do LGPD: status vem das flags de parceiros (fonte viva), mas
    // herda id/consultor/arquivo do registro em documentos, quando existir.
    // Só entra se o termo existe de fato — cliente novo não tem termo algum.
    const registroLGPD = (p.documentos || [])
        .filter(d => d.tipo_documento === 'termo-lgpd')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (registroLGPD || temHistoricoLGPD(p)) {
        const lgpd = linhaLGPDDoParceiro(p).doc;
        if (registroLGPD) {
            lgpd.id = registroLGPD.id;
            lgpd.consultor = registroLGPD.consultor;
            lgpd.created_at = registroLGPD.created_at;
            lgpd.arquivo_path = lgpd.arquivo_path || registroLGPD.arquivo_path;
        }
        docs.push(lgpd);
    }
    return docs;
}

/** Rótulo/classe da linha FOCO de um card */
function focoDoDocumento(doc) {
    if (doc.salvo_foco) return '<span class="badge-foco">Integrado ✓</span>';
    if (doc.status === 'enviado') return '<span class="acomp-muted">aguardando aceite</span>';
    if (doc.status === 'aceito') return '<span class="acomp-muted">aguardando integração</span>';
    return '<span class="acomp-muted">—</span>';
}

/** Data curta dd/mm hh:mm para os cards */
function dataCurta(v) {
    return formatarDataCurtaSebrae(v);   // horário de MS (js/datas.js)
}

/**
 * Botão de ação do card: retomar o envio de um documento gerado
 * (ou reenviar um já enviado). Documentos aceitos/recusados não têm ação.
 */
function acaoDoCard(doc) {
    const params = `'${doc.tipo_documento}'` + (doc.id ? `, '${doc.id}'` : '');

    if (doc.status === 'gerado') {
        return `<button class="btn-card-enviar" onclick="event.stopPropagation(); abrirEnvioDocumento(${params})">
                    <i class="fab fa-whatsapp"></i> Enviar
                </button>`;
    }
    if (doc.status === 'enviado') {
        return `<button class="btn-card-reenviar" onclick="event.stopPropagation(); abrirEnvioDocumento(${params})">
                    <i class="fas fa-rotate-right"></i> Reenviar
                </button>`;
    }
    if (doc._lgpdDerivado && doc.status === 'nao_aceito') {
        return `<button class="btn-card-enviar" onclick="event.stopPropagation(); abrirEnvioDocumento(${params})">
                    <i class="fab fa-whatsapp"></i> Enviar
                </button>`;
    }
    return '';
}

/** Abre a página do documento para retomar/reenviar (com o registro existente) */
function abrirEnvioDocumento(tipo, docId) {
    if (!_acompParceiro) return;
    const url = `documento?id=${encodeURIComponent(_acompParceiro.id)}&tipo=${encodeURIComponent(tipo)}`
        + (docId ? `&doc=${encodeURIComponent(docId)}` : '');
    window.location.href = url;
}

/** Renderiza a grade de cards de documentos */
function renderCardsAcompanhamento() {
    const grid = document.getElementById('acomp-docs');
    if (!grid) return;

    // Cliente ainda sem nenhum documento gerado
    if (!_acompDocs.length) {
        grid.innerHTML = `
            <div class="acomp-vazio">
                <i class="fas fa-file-circle-plus"></i>
                <p>Nenhum documento gerado para este cliente.</p>
                <p class="acomp-muted">Use "Enviar novo documento" para escolher o termo a ser preenchido.</p>
            </div>`;
        const tl = document.getElementById('acomp-timeline');
        if (tl) tl.innerHTML = '<li class="pending"><b>Nenhuma evidência registrada</b><span>As evidências aparecem aqui depois que o primeiro documento for gerado.</span></li>';
        const nomeEl = document.getElementById('acomp-evidencia-doc');
        if (nomeEl) nomeEl.textContent = '—';
        return;
    }

    grid.innerHTML = _acompDocs.map((doc, idx) => {
        const badge = BADGES_STATUS_DOC[doc.status] || BADGES_STATUS_DOC.nao_aceito;
        const classeCard = {
            aceito: 'st-card-aceito',
            enviado: 'st-card-enviado',
            recusado: 'st-card-recusado'
        }[doc.status] || '';
        const selecionado = idx === _acompSelecionado ? ' st-card-selecionado' : '';
        const dataRecusaLinha = doc.status === 'recusado'
            ? `<div class="st-line"><span class="acomp-muted">Recusado</span><b>${dataCurta(doc.data_recusa || _acompParceiro.data_recusa)}</b></div>`
            : `<div class="st-line"><span class="acomp-muted">Aceito</span><b>${dataCurta(doc.data_aceite)}</b></div>`;

        // Letra que o cliente usa para responder no WhatsApp (só enquanto aguarda)
        const codigoBadge = (doc.status === 'enviado' && doc.codigo_resposta)
            ? ` <span class="badge-codigo" title="O cliente responde 1${doc.codigo_resposta} para aceitar ou 2${doc.codigo_resposta} para recusar">Resposta: ${escAcomp(doc.codigo_resposta)}</span>`
            : '';

        return `
        <div class="st-card ${classeCard}${selecionado}" onclick="selecionarDocAcompanhamento(${idx})">
            <h5>${escAcomp(doc.nome_documento)}</h5>
            <span class="${badge.classe}"><i class="fas fa-${badge.icone}"></i> ${badge.rotulo}</span>${codigoBadge}
            <div class="st-line"><span class="acomp-muted">Enviado</span><b>${dataCurta(doc.data_envio)}</b></div>
            ${dataRecusaLinha}
            <div class="st-line"><span class="acomp-muted">FOCO</span>${focoDoDocumento(doc)}</div>
            ${acaoDoCard(doc)}
        </div>`;
    }).join('');
}

/** Seleciona um documento e atualiza a timeline */
function selecionarDocAcompanhamento(idx) {
    _acompSelecionado = idx;
    renderCardsAcompanhamento();
    renderTimelineAcompanhamento();
    renderRecusaAcompanhamento();
}

/**
 * Monta os eventos reais do documento selecionado (sem inventar dados —
 * "Visualizado pelo cliente" não é rastreado hoje e fica de fora).
 */
function eventosDoDocumento(doc) {
    const p = _acompParceiro;
    const eventos = [];

    // Documento gerado (só existe para registros reais de documentos)
    if (doc.created_at) {
        eventos.push({
            titulo: 'Documento gerado',
            sub: `${formatarDataHora(doc.created_at)}${doc.consultor ? ' • Consultor ' + doc.consultor : ''}`,
            done: true
        });
    }

    // Enviado via WhatsApp
    eventos.push({
        titulo: 'Enviado via WhatsApp',
        sub: doc.data_envio ? `${formatarDataHora(doc.data_envio)} • ${p.telefone || ''}` : 'pendente',
        done: !!doc.data_envio
    });

    if (doc.status === 'recusado') {
        eventos.push({
            titulo: 'Recusado pelo cliente',
            sub: formatarDataHora(doc.data_recusa || p.data_recusa),
            done: true,
            recusa: true
        });
        return eventos;
    }

    // Aceite
    eventos.push({
        titulo: 'Aceito e assinado eletronicamente',
        sub: doc.data_aceite ? `${formatarDataHora(doc.data_aceite)} • CPF validado` : 'aguardando aceite do cliente',
        done: !!doc.data_aceite
    });

    // Integração no FOCO
    eventos.push({
        titulo: 'Integração no FOCO',
        sub: doc.salvo_foco ? 'Documento anexado à interação do cliente' : 'pendente',
        done: !!doc.salvo_foco
    });

    return eventos;
}

/** Renderiza a timeline de evidências do documento selecionado */
function renderTimelineAcompanhamento() {
    const doc = _acompDocs[_acompSelecionado];
    const ul = document.getElementById('acomp-timeline');
    const nomeEl = document.getElementById('acomp-evidencia-doc');
    if (!doc || !ul) return;

    if (nomeEl) nomeEl.textContent = doc.nome_documento;

    ul.innerHTML = eventosDoDocumento(doc).map(ev => `
        <li class="${ev.done ? '' : 'pending'}${ev.recusa ? ' recusa' : ''}">
            <b>${escAcomp(ev.titulo)}</b>
            <span>${escAcomp(ev.sub)}</span>
        </li>`).join('');
}

/** Renderiza o card de tratamento de recusa */
function renderRecusaAcompanhamento() {
    const cont = document.getElementById('acomp-recusa');
    if (!cont) return;

    const recusados = _acompDocs.filter(d => d.status === 'recusado');
    if (recusados.length === 0) {
        cont.innerHTML = '<div class="acomp-sem-recusa"><i class="fas fa-check-circle"></i> Nenhuma recusa registrada neste atendimento.</div>';
        return;
    }

    cont.innerHTML = recusados.map(d => `
        <div class="acomp-recusa-box">
            <span class="badge-nao"><i class="fas fa-times-circle"></i> Não aceito</span>
            <div class="st-line"><span class="acomp-muted">Documento</span><b>${escAcomp(d.nome_documento)}</b></div>
            <div class="st-line"><span class="acomp-muted">Data recusa</span><b>${dataCurta(d.data_recusa || _acompParceiro.data_recusa)}</b></div>
            <p class="acomp-recusa-nota">A manifestação de recusa permanece registrada para acompanhamento.</p>
        </div>`).join('');
}

/**
 * Recarrega os documentos do atendimento mantendo o card selecionado.
 * Usada pela atualização ao vivo (o aceite chega pelo WhatsApp).
 */
async function recarregarAcompanhamentoAoVivo() {
    if (!_acompParceiro) return;

    // O LGPD derivado pode não ter registro em documentos: cai no tipo
    const chaveDoc = d => d?.id || d?.tipo_documento || null;
    const docSelecionado = chaveDoc(_acompDocs[_acompSelecionado]);

    const { data: parceiro, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .eq('id', _acompParceiro.id)
        .single();

    if (error || !parceiro) return;

    _acompParceiro = parceiro;
    parceiroAtual = parceiro;   // usado pelo modal "Editar Cliente" (app.js)
    _acompDocs = montarDocsAcompanhamento(parceiro);

    // Mantém o documento que estava aberto, se ele ainda existir
    const novoIndice = _acompDocs.findIndex(d => chaveDoc(d) === docSelecionado);
    _acompSelecionado = novoIndice >= 0 ? novoIndice : 0;

    pintarCabecalhoAcompanhamento();
    renderCardsAcompanhamento();
    renderTimelineAcompanhamento();
    renderRecusaAcompanhamento();
}

/** Cabeçalho do cliente (nome, CPF, telefone) — repintado após editar o cliente */
function pintarCabecalhoAcompanhamento() {
    if (!_acompParceiro) return;
    document.getElementById('acomp-nome').textContent = _acompParceiro.nome_razao_social;
    document.getElementById('acomp-cpf').textContent = _acompParceiro.cpf;
    document.getElementById('acomp-telefone').textContent = _acompParceiro.telefone || '—';
    document.getElementById('btn-novo-documento').href =
        `detalhe?id=${encodeURIComponent(_acompParceiro.id)}`;
}

/** Inicialização da página */
async function inicializarAcompanhamento() {
    const grid = document.getElementById('acomp-docs');
    if (!grid) return; // não é a página de acompanhamento

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
        document.getElementById('acomp-nome').textContent = 'Cliente não informado';
        return;
    }

    const { data: parceiro, error } = await supabaseClient
        .from('parceiros')
        .select('*, documentos(*)')
        .eq('id', id)
        .single();

    if (error || !parceiro) {
        if (tratarErroDeSessao(error)) return;
        console.error('Erro ao carregar atendimento:', error?.message);
        document.getElementById('acomp-nome').textContent = 'Erro ao carregar o atendimento';
        return;
    }

    _acompParceiro = parceiro;
    parceiroAtual = parceiro;   // usado pelo modal "Editar Cliente" (app.js)
    _acompDocs = montarDocsAcompanhamento(parceiro);
    _acompSelecionado = 0;

    pintarCabecalhoAcompanhamento();
    renderCardsAcompanhamento();
    renderTimelineAcompanhamento();
    renderRecusaAcompanhamento();

    // Aceite/recusa chega pelo WhatsApp: atualiza a tela sozinha
    if (typeof ligarAtualizacaoAoVivo === 'function') {
        await ligarAtualizacaoAoVivo('acompanhamento', recarregarAcompanhamentoAoVivo);
        atualizarAoVoltarParaAba(recarregarAcompanhamentoAoVivo);
    }

    // Interação (Case) e CNPJ do FOCO — assíncrono, sem travar a tela
    const chaveFoco = 'sbr_foco_' + (parceiro.cpf || '').replace(/\D/g, '');
    const focoCache = (typeof cacheNavGet === 'function') ? cacheNavGet(chaveFoco) : null;
    if (focoCache?.contatos) pintarCNPJFoco('acomp-cnpj', focoCache.contatos, parceiro);

    try {
        const [contatos, interacao] = await Promise.all([
            buscarContatosFocoPorCPF(parceiro.cpf),
            buscarUltimaInteracaoFoco(parceiro.id_contato_salesforce, parceiro.cpf)
        ]);
        if (interacao?.CaseNumber) {
            document.getElementById('acomp-interacao').textContent = interacao.CaseNumber;
        }
        pintarCNPJFoco('acomp-cnpj', contatos, parceiro);

        const contato = escolherContatoFoco(contatos, parceiro.id_salesforce);
        if (typeof cacheNavSet === 'function' && (contatos.length || interacao)) {
            cacheNavSet(chaveFoco, { contato, interacao, contatos });
        }
    } catch { /* FOCO indisponível: mantém "—" */ }
}

document.addEventListener('DOMContentLoaded', inicializarAcompanhamento);
