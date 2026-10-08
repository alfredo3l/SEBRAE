/* ============================================================
   SEBRAE - Logs do Sistema (somente o Administrador SEBRAE)
   ============================================================
   Lê public.logs_sistema (supabase_logs_sistema.sql). A RLS só entrega as
   linhas ao Administrador SEBRAE; a tela também redireciona os demais.
   Paginação, filtros e exportação são feitos no servidor (PostgREST).
   ============================================================ */

const LOGS_POR_PAGINA = 50;
const LOGS_LIMITE_EXPORTACAO = 5000;
let _logsPagina = 1;
let _logsTotal = 0;
let _logsLinhas = [];
let _logsCarregando = false;

const CATEGORIAS_LOG = {
    acesso:   { rotulo: 'Acesso',   cor: '#2563eb', fundo: '#dbeafe', icone: 'fas fa-right-to-bracket' },
    consulta: { rotulo: 'Consulta', cor: '#7c3aed', fundo: '#ede9fe', icone: 'fas fa-magnifying-glass' },
    cliente:  { rotulo: 'Cliente',  cor: '#0e7490', fundo: '#cffafe', icone: 'fas fa-user-tie' },
    termo:    { rotulo: 'Termo',    cor: '#047857', fundo: '#d1fae5', icone: 'fas fa-file-signature' },
    usuario:  { rotulo: 'Usuário',  cor: '#b45309', fundo: '#fef3c7', icone: 'fas fa-users-cog' },
    senha:    { rotulo: 'Senha',    cor: '#b91c1c', fundo: '#fee2e2', icone: 'fas fa-key' },
    whatsapp: { rotulo: 'WhatsApp', cor: '#15803d', fundo: '#dcfce7', icone: 'fab fa-whatsapp' },
    foco:     { rotulo: 'FOCO',     cor: '#4338ca', fundo: '#e0e7ff', icone: 'fas fa-link' },
    relatorio: { rotulo: 'Relatório', cor: '#475569', fundo: '#f1f5f9', icone: 'fas fa-file-pdf' }
};

const ATORES_LOG = {
    sistema: { rotulo: 'Sistema', icone: 'fas fa-gears' },
    cliente: { rotulo: 'Cliente (WhatsApp)', icone: 'fas fa-mobile-screen' },
    anonimo: { rotulo: 'Tela de login', icone: 'fas fa-door-open' }
};

const ORIGENS_LOG = { tela: 'Tela', banco: 'Banco', n8n: 'n8n' };

// Nome amigável das colunas mostradas no "antes → depois"
const ROTULOS_CAMPOS_LOG = {
    nome_razao_social: 'Nome / Razão social', cpf: 'CPF', telefone: 'Telefone', email: 'E-mail',
    id_salesforce: 'Account ID (FOCO)', id_contato_salesforce: 'Contact ID (FOCO)',
    termo_aceito: 'LGPD aceito', termo_aceito_foco: 'LGPD no FOCO', recusado: 'Recusado',
    data_envio: 'Data de envio', data_aceite: 'Data de aceite', data_recusa: 'Data de recusa',
    status: 'Status', salvo_foco: 'Integrado no FOCO', arquivo_path: 'Arquivo (PDF)',
    case_id_salesforce: 'Interação (Case ID)', case_number: 'Nº da interação',
    content_document_id: 'Anexo no FOCO', dados_formulario: 'Dados do formulário',
    consultor: 'Consultor', codigo_resposta: 'Código de resposta', html_documento: 'Texto do documento',
    resposta_texto: 'Resposta do cliente', respondido_em: 'Respondido em',
    whatsapp_message_id: 'ID da mensagem (WhatsApp)', assinatura_digital: 'Assinatura digital',
    tipo_documento: 'Tipo de documento', nome_documento: 'Documento',
    nome_completo: 'Nome completo', role: 'Perfil de acesso', ativo: 'Ativo',
    motivo_desativacao: 'Motivo da desativação', foto_url: 'Foto', senha_temporaria: 'Senha temporária',
    conta_compartilhada: 'Conta compartilhada', gere_senhas: 'Cuida de senhas',
    gere_senhas_por: 'Função de senhas dada por', gere_senhas_em: 'Função de senhas dada em',
    whatsapp: 'WhatsApp', whatsapp_jid: 'WhatsApp (identificador)', oculto: 'Oculto',
    texto: 'Mensagem', destinatario_id: 'Destinatário', erro: 'Erro', termo: 'Termo pesquisado',
    tipo: 'Tipo', resultados: 'Resultados', path: 'Arquivo', tela: 'Tela', campos: 'Campos',
    contact_id: 'Contact ID (FOCO)', parceiro_id: 'Cliente (id)'
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const session = await verificarAutenticacao();
    if (!session) return;
    if (!(_perfilAtual?.ativo && _perfilAtual?.role === 'admin' && ehAdminPrincipal(_perfilAtual))) {
        window.location.href = 'index';
        return;
    }
    configurarBotaoSair();
    preencherPeriodoPadraoLogs();
    await popularFiltroUsuarioLogs();
    void carregarDestinatarios();
    void carregarUltimoEnvio();
    document.getElementById('log-texto').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); filtrarLogs(); }
    });
    await carregarLogs();
});

// ============================================================
// FILTROS
// ============================================================
function dataISOSebrae(d) {
    const p = partesDataSebrae(d);
    return `${p.year}-${p.month}-${p.day}`;
}

function preencherPeriodoPadraoLogs() {
    const hoje = new Date();
    document.getElementById('log-ate').value = dataISOSebrae(hoje);
    document.getElementById('log-de').value = dataISOSebrae(new Date(hoje.getTime() - 6 * 86400000));
}

async function popularFiltroUsuarioLogs() {
    const sel = document.getElementById('log-usuario');
    const { data, error } = await supabaseClient
        .from('perfis_usuarios')
        .select('id, nome_completo, email, ativo')
        .order('nome_completo', { ascending: true });
    if (error) { console.warn('Usuários do filtro:', error.message); return; }
    const grupoPessoas = document.createElement('optgroup');
    grupoPessoas.label = 'Usuários';
    (data || []).forEach(u => {
        const op = document.createElement('option');
        op.value = u.id;
        op.textContent = `${u.nome_completo} — ${u.email}${u.ativo ? '' : ' (inativo)'}`;
        grupoPessoas.appendChild(op);
    });
    const grupoAuto = document.createElement('optgroup');
    grupoAuto.label = 'Automático';
    Object.entries(ATORES_LOG).forEach(([valor, a]) => {
        const op = document.createElement('option');
        op.value = 'ator:' + valor;
        op.textContent = a.rotulo;
        grupoAuto.appendChild(op);
    });
    sel.appendChild(grupoPessoas);
    sel.appendChild(grupoAuto);
}

function filtrosLogs() {
    return {
        de: document.getElementById('log-de').value,
        ate: document.getElementById('log-ate').value,
        usuario: document.getElementById('log-usuario').value,
        categoria: document.getElementById('log-categoria').value,
        texto: document.getElementById('log-texto').value.trim()
    };
}

/** Aplica os filtros numa consulta do PostgREST. Datas no fuso de MS (UTC−4). */
function aplicarFiltrosLogs(q, f) {
    if (f.de) q = q.gte('criado_em', new Date(`${f.de}T00:00:00-04:00`).toISOString());
    if (f.ate) q = q.lt('criado_em', new Date(new Date(`${f.ate}T00:00:00-04:00`).getTime() + 86400000).toISOString());
    if (f.usuario.startsWith('ator:')) q = q.eq('ator', f.usuario.slice(5));
    else if (f.usuario) q = q.eq('usuario_id', f.usuario);
    if (f.categoria) q = q.eq('categoria', f.categoria);
    if (f.texto) {
        // Vírgula, parênteses e asterisco têm significado no filtro "or" do PostgREST
        const t = f.texto.replace(/[,()*\\]/g, ' ').trim();
        if (t) q = q.or(`descricao.ilike.*${t}*,usuario_nome.ilike.*${t}*,usuario_email.ilike.*${t}*,ip.ilike.*${t}*`);
    }
    return q;
}

function filtrarLogs() {
    const f = filtrosLogs();
    if (f.de && f.ate && f.de > f.ate) {
        mostrarErroLogs('A data inicial é depois da data final.');
        return;
    }
    _logsPagina = 1;
    carregarLogs();
}

function limparFiltrosLogs() {
    preencherPeriodoPadraoLogs();
    document.getElementById('log-usuario').value = '';
    document.getElementById('log-categoria').value = '';
    document.getElementById('log-texto').value = '';
    _logsPagina = 1;
    carregarLogs();
}

// ============================================================
// CARGA E RENDERIZAÇÃO
// ============================================================
async function carregarLogs() {
    if (_logsCarregando) return;
    _logsCarregando = true;
    const tbody = document.getElementById('tbody-logs');
    tbody.innerHTML = `<tr><td colspan="6" class="logs-vazio"><i class="fas fa-spinner fa-spin"></i> Carregando registros...</td></tr>`;
    document.getElementById('logs-erro').hidden = true;
    try {
        const ini = (_logsPagina - 1) * LOGS_POR_PAGINA;
        let q = supabaseClient.from('logs_sistema').select('*', { count: 'exact' });
        q = aplicarFiltrosLogs(q, filtrosLogs())
            .order('criado_em', { ascending: false })
            .order('id', { ascending: false })
            .range(ini, ini + LOGS_POR_PAGINA - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        _logsLinhas = data || [];
        _logsTotal = count || 0;
        renderizarLogs();
    } catch (err) {
        if (tratarErroDeSessao(err)) return;
        console.error('Erro ao carregar logs:', err);
        tbody.innerHTML = '';
        mostrarErroLogs('Erro ao carregar os registros: ' + (err.message || err));
    } finally {
        _logsCarregando = false;
    }
}

function mostrarErroLogs(msg) {
    const el = document.getElementById('logs-erro');
    el.textContent = msg;
    el.hidden = false;
}

function escLog(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Data e hora com segundos, no fuso de MS */
function dataHoraLog(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO_SEBRAE, day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(d).replace(',', '');
}

function badgeCategoriaLog(cat) {
    const c = CATEGORIAS_LOG[cat] || { rotulo: cat, cor: '#374151', fundo: '#f3f4f6', icone: 'fas fa-circle' };
    return `<span class="badge-log" style="color:${c.cor}; background:${c.fundo};"><i class="${c.icone}"></i> ${escLog(c.rotulo)}</span>`;
}

function celulaAutorLog(l) {
    const auto = ATORES_LOG[l.ator];
    if (l.usuario_nome) {
        const extra = auto ? ` <span class="log-ator">${escLog(auto.rotulo)}</span>` : '';
        return `<strong>${escLog(l.usuario_nome)}</strong>${extra}<small>${escLog(l.usuario_email || '')}</small>`;
    }
    if (auto) return `<span class="log-ator-auto"><i class="${auto.icone}"></i> ${escLog(auto.rotulo)}</span>`;
    return '<span style="color:#9ca3af;">—</span>';
}

function renderizarLogs() {
    const tbody = document.getElementById('tbody-logs');
    const total = _logsTotal;
    document.getElementById('logs-total').textContent = total.toLocaleString('pt-BR');

    if (!_logsLinhas.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="logs-vazio"><i class="fas fa-clipboard-list"></i> Nenhum registro encontrado para os filtros escolhidos.</td></tr>`;
    } else {
        tbody.innerHTML = _logsLinhas.map((l, i) => `
            <tr class="linha-log" onclick="abrirDetalheLog(${i})" title="Ver detalhes">
                <td class="log-data">${dataHoraLog(l.criado_em)}</td>
                <td class="log-autor">${celulaAutorLog(l)}</td>
                <td>${badgeCategoriaLog(l.categoria)}</td>
                <td class="log-descricao">${escLog(l.descricao)}</td>
                <td class="log-origem">${escLog(ORIGENS_LOG[l.origem] || l.origem)}${l.ip ? `<small>${escLog(l.ip)}</small>` : ''}</td>
                <td><button type="button" class="btn-acao" title="Detalhes" onclick="event.stopPropagation(); abrirDetalheLog(${i})"><i class="fas fa-eye"></i></button></td>
            </tr>`).join('');
    }
    renderizarPaginacaoLogs();
}

function renderizarPaginacaoLogs() {
    const totalPaginas = Math.max(1, Math.ceil(_logsTotal / LOGS_POR_PAGINA));
    const ini = _logsTotal ? (_logsPagina - 1) * LOGS_POR_PAGINA + 1 : 0;
    const fim = Math.min(_logsPagina * LOGS_POR_PAGINA, _logsTotal);
    document.getElementById('logs-status').textContent = _logsTotal
        ? `Mostrando ${ini.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${_logsTotal.toLocaleString('pt-BR')} registro(s)`
        : '';
    const cont = document.getElementById('logs-paginacao');
    if (totalPaginas <= 1) { cont.innerHTML = ''; return; }
    const botao = (rotulo, pagina, opts = {}) =>
        `<button class="page-btn${opts.ativo ? ' active' : ''}${opts.label ? ' page-btn-label' : ''}" ${opts.desab ? 'disabled' : ''} onclick="irParaPaginaLogs(${pagina})">${rotulo}</button>`;
    let html = botao('&laquo;', _logsPagina - 1, { label: true, desab: _logsPagina === 1 });
    const inicio = Math.max(1, _logsPagina - 2);
    const final = Math.min(totalPaginas, inicio + 4);
    for (let p = inicio; p <= final; p++) html += botao(p, p, { ativo: p === _logsPagina });
    html += botao('&raquo;', _logsPagina + 1, { label: true, desab: _logsPagina === totalPaginas });
    cont.innerHTML = html;
}

function irParaPaginaLogs(p) {
    const totalPaginas = Math.max(1, Math.ceil(_logsTotal / LOGS_POR_PAGINA));
    if (p < 1 || p > totalPaginas || p === _logsPagina) return;
    _logsPagina = p;
    carregarLogs();
}

// ============================================================
// DETALHE DE UM REGISTRO
// ============================================================
function valorLog(v) {
    if (v === null || v === undefined || v === '') return '<span class="log-vazio">(vazio)</span>';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return escLog(dataHoraLog(v));
    if (typeof v === 'object') return `<pre class="log-json">${escLog(JSON.stringify(v, null, 2))}</pre>`;
    return escLog(String(v));
}

function rotuloCampoLog(k) {
    return ROTULOS_CAMPOS_LOG[k] || k;
}

function tabelaChaveValorLog(obj) {
    return `<table class="log-tabela-detalhe"><tbody>${Object.entries(obj).map(([k, v]) =>
        `<tr><th>${escLog(rotuloCampoLog(k))}</th><td>${valorLog(v)}</td></tr>`).join('')}</tbody></table>`;
}

function abrirDetalheLog(i) {
    const l = _logsLinhas[i];
    if (!l) return;
    const auto = ATORES_LOG[l.ator];
    const quem = l.usuario_nome
        ? `${escLog(l.usuario_nome)} <small>(${escLog(l.usuario_email || '')})</small>${auto ? ' — ' + escLog(auto.rotulo) : ''}`
        : (auto ? escLog(auto.rotulo) : '—');

    let html = `
        <table class="log-tabela-detalhe log-cabecalho"><tbody>
            <tr><th>Data e hora</th><td>${dataHoraLog(l.criado_em)}</td></tr>
            <tr><th>Quem</th><td>${quem}</td></tr>
            <tr><th>Categoria</th><td>${badgeCategoriaLog(l.categoria)} <code>${escLog(l.acao)}</code></td></tr>
            <tr><th>Descrição</th><td>${escLog(l.descricao)}</td></tr>
            <tr><th>Origem</th><td>${escLog(ORIGENS_LOG[l.origem] || l.origem)}${l.entidade ? ` · ${escLog(l.entidade)} <code>${escLog(l.entidade_id || '')}</code>` : ''}</td></tr>
            <tr><th>IP</th><td>${escLog(l.ip || '—')}</td></tr>
            <tr><th>Navegador</th><td class="log-ua">${escLog(l.user_agent || '—')}</td></tr>
        </tbody></table>`;

    const dados = l.dados || {};
    if (dados.alteracoes && Object.keys(dados.alteracoes).length) {
        html += `<h4 class="log-subtitulo"><i class="fas fa-right-left"></i> Alterações (antes → depois)</h4>
            <table class="log-tabela-detalhe log-diff"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>
            ${Object.entries(dados.alteracoes).map(([k, v]) =>
                `<tr><th>${escLog(rotuloCampoLog(k))}</th><td class="log-antes">${valorLog(v?.antes)}</td><td class="log-depois">${valorLog(v?.depois)}</td></tr>`).join('')}
            </tbody></table>`;
    }
    if (dados.registro) {
        html += `<h4 class="log-subtitulo"><i class="fas fa-file-lines"></i> Registro</h4>` + tabelaChaveValorLog(dados.registro);
    }
    const resto = Object.fromEntries(Object.entries(dados).filter(([k]) => k !== 'alteracoes' && k !== 'registro'));
    if (Object.keys(resto).length) {
        html += `<h4 class="log-subtitulo"><i class="fas fa-circle-info"></i> Detalhes</h4>` + tabelaChaveValorLog(resto);
    }

    document.getElementById('log-detalhe-corpo').innerHTML = html;
    document.getElementById('modal-log').style.display = 'flex';
}

function fecharDetalheLog() {
    document.getElementById('modal-log').style.display = 'none';
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-log')?.style.display === 'flex'
        && document.getElementById('modal-confirmacao-logs')?.style.display !== 'flex') fecharDetalheLog();
});

// ============================================================
// RELATÓRIO DIÁRIO POR WHATSAPP (08/10/2026)
// ============================================================
// Destinatários em relatorio_logs_destinatarios (RLS: só o Administrador
// SEBRAE). O envio é do fluxo [Termo URC - Relatorio Diario de Logs]: seg–sex
// 17:00 (agendado) ou pelo botão "Enviar agora" (webhook com o token).
const WEBHOOK_RELATORIO_LOGS = 'https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-RELATORIO-LOGS';
let _destinatarios = [];

/**
 * Popup de confirmação próprio (no lugar do confirm() nativo do navegador).
 * Devolve uma Promise: true = confirmou; false = Cancelar, Esc ou clique fora.
 * `texto` é HTML: quem chama escapa os valores com escLog().
 */
function confirmarAcaoLogs({ titulo, texto, tipo = 'whatsapp', icone, rotuloOk, iconeOk }) {
    const modal = document.getElementById('modal-confirmacao-logs');
    const btnOk = document.getElementById('btn-confirm-logs-ok');
    const btnCancelar = document.getElementById('btn-confirm-logs-cancelar');
    document.getElementById('confirm-logs-titulo').textContent = titulo;
    document.getElementById('confirm-logs-texto').innerHTML = texto;
    document.getElementById('confirm-logs-icone-wrap').className = `modal-confirm-icon ${tipo}`;
    document.getElementById('confirm-logs-icone').className = icone;
    document.getElementById('btn-confirm-logs-icone').className = iconeOk || icone;
    document.getElementById('btn-confirm-logs-rotulo').textContent = rotuloOk;
    btnOk.className = `btn-confirm-ok ${tipo}`;
    modal.style.display = 'flex';
    // Ação destrutiva: o foco fica no Cancelar (Enter não apaga sem querer)
    (tipo === 'perigo' ? btnCancelar : btnOk).focus();

    return new Promise(resolve => {
        const fechar = resposta => {
            modal.style.display = 'none';
            btnOk.removeEventListener('click', aoOk);
            btnCancelar.removeEventListener('click', aoCancelar);
            modal.removeEventListener('click', aoFora);
            document.removeEventListener('keydown', aoTecla, true);
            resolve(resposta);
        };
        const aoOk = () => fechar(true);
        const aoCancelar = () => fechar(false);
        const aoFora = e => { if (e.target === modal) fechar(false); };
        const aoTecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(false); } };
        btnOk.addEventListener('click', aoOk);
        btnCancelar.addEventListener('click', aoCancelar);
        modal.addEventListener('click', aoFora);
        document.addEventListener('keydown', aoTecla, true);
    });
}

function mostrarMsgRelatorio(texto, tipo) {
    const el = document.getElementById('relatorio-msg');
    el.textContent = texto;
    el.className = `relatorio-msg ${tipo}`;
    el.hidden = false;
}

async function carregarDestinatarios() {
    const tbody = document.getElementById('tbody-destinatarios');
    const { data, error } = await supabaseClient
        .from('relatorio_logs_destinatarios')
        .select('id, nome, whatsapp, ativo')
        .order('nome', { ascending: true });
    if (error) {
        if (tratarErroDeSessao(error)) return;
        tbody.innerHTML = `<tr><td colspan="5" class="rel-vazio">Erro ao carregar: ${escLog(error.message)}</td></tr>`;
        return;
    }
    _destinatarios = data || [];
    if (!_destinatarios.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="rel-vazio">Nenhum destinatário cadastrado — o relatório não é enviado até haver pelo menos um marcado.</td></tr>';
        return;
    }
    // Caixa de marcação = recebe ou não o relatório (agendado e "Enviar agora").
    // Facilita os testes: desmarcar não apaga o cadastro (08/10/2026).
    tbody.innerHTML = _destinatarios.map(d => `
        <tr class="${d.ativo ? '' : 'pausado'}">
            <td class="rel-col-check">
                <label class="rel-check" title="${d.ativo ? 'Desmarque para não receber' : 'Marque para receber'}">
                    <input type="checkbox" ${d.ativo ? 'checked' : ''} onchange="marcarDestinatario('${d.id}', this)"
                           aria-label="${escLog(d.nome)} recebe o relatório diário">
                    <span>${d.ativo ? 'Recebe' : 'Não recebe'}</span>
                </label>
            </td>
            <td><strong>${escLog(d.nome)}</strong></td>
            <td><i class="fab fa-whatsapp" style="color:#16a34a;"></i> ${escLog(d.whatsapp)}</td>
            <td style="text-align:right;"><button type="button" class="rel-excluir" title="Excluir destinatário"
                    onclick="excluirDestinatario('${d.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('');
}

async function carregarUltimoEnvio() {
    const el = document.getElementById('relatorio-ultimo');
    const { data, error } = await supabaseClient
        .from('relatorio_logs_envios')
        .select('criado_em, modo, enviados, destinatarios, total_eventos')
        .order('criado_em', { ascending: false })
        .limit(1);
    if (error || !data?.length) { el.textContent = 'Último envio: nenhum ainda.'; return; }
    const e = data[0];
    el.textContent = `Último envio: ${dataHoraLog(e.criado_em)} (${e.modo === 'manual' ? 'manual' : 'automático'}) — `
        + `${e.enviados} de ${e.destinatarios} destinatário(s), ${Number(e.total_eventos).toLocaleString('pt-BR')} evento(s).`;
}

async function adicionarDestinatario(event) {
    if (event) event.preventDefault();
    const nome = document.getElementById('rel-nome').value.trim();
    const campoTel = document.getElementById('rel-telefone');
    const digitos = digitosTelefone(campoTel.value);
    if (!nome) { mostrarMsgRelatorio('Informe o nome de quem vai receber.', 'erro'); return; }
    if (!telefoneValido(digitos)) { mostrarMsgRelatorio('Telefone incompleto: informe o DDD e o número (10 ou 11 dígitos).', 'erro'); campoTel.focus(); return; }
    if (_destinatarios.some(d => digitosTelefone(d.whatsapp) === digitos)) {
        mostrarMsgRelatorio('Este número já está na lista.', 'erro');
        return;
    }
    const btn = document.getElementById('btn-rel-adicionar');
    btn.disabled = true;
    try {
        const whatsapp = formatarTelefoneParaCadastro(digitos);
        const v = await verificarWhatsApp(whatsapp);
        if (v.exists === false) { mostrarMsgRelatorio('Este número não tem WhatsApp. Confira o DDD e o número.', 'erro'); return; }
        const { error } = await supabaseClient.from('relatorio_logs_destinatarios').insert({
            nome, whatsapp, whatsapp_jid: v.exists === true ? (v.whatsapp || null) : null
        });
        if (error) {
            if (tratarErroDeSessao(error)) return;
            mostrarMsgRelatorio(/duplicate|unique/i.test(error.message) ? 'Este número já está na lista.' : 'Erro ao salvar: ' + error.message, 'erro');
            return;
        }
        document.getElementById('rel-nome').value = '';
        campoTel.value = '';
        mostrarMsgRelatorio(`${nome} vai receber o relatório diário.` + (v.exists === true ? '' : ' Não foi possível confirmar agora se o número tem WhatsApp.'),
            v.exists === true ? 'ok' : 'aviso');
        await carregarDestinatarios();
    } finally {
        btn.disabled = false;
    }
}

/** Caixa de marcação: grava "recebe / não recebe"; se falhar, desfaz a marcação */
async function marcarDestinatario(id, caixa) {
    const d = _destinatarios.find(x => x.id === id);
    if (!d) return;
    const novoAtivo = !!caixa.checked;
    caixa.disabled = true;
    const { error } = await supabaseClient.from('relatorio_logs_destinatarios').update({ ativo: novoAtivo }).eq('id', id);
    if (error) {
        caixa.checked = !novoAtivo;
        caixa.disabled = false;
        if (!tratarErroDeSessao(error)) mostrarMsgRelatorio('Erro ao alterar: ' + error.message, 'erro');
        return;
    }
    mostrarMsgRelatorio(novoAtivo ? `${d.nome} vai receber o relatório.` : `${d.nome} não vai receber o relatório (cadastro mantido).`, 'ok');
    await carregarDestinatarios();
}

/** Inverte a marcação (atalho usado por código; a tela usa a caixa) */
async function alternarDestinatario(id) {
    const d = _destinatarios.find(x => x.id === id);
    if (!d) return;
    await marcarDestinatario(id, { checked: !d.ativo, disabled: false });
}

async function excluirDestinatario(id) {
    const d = _destinatarios.find(x => x.id === id);
    if (!d) return;
    const ok = await confirmarAcaoLogs({
        titulo: 'Excluir destinatário',
        texto: `<strong>${escLog(d.nome)}</strong> — WhatsApp ${escLog(d.whatsapp)} — deixará de receber o relatório diário.<br>`
            + `<span style="font-size:0.83rem;">Para apenas suspender o envio, <strong>desmarque a caixa</strong> em vez de excluir.</span>`,
        tipo: 'perigo', icone: 'fas fa-trash', rotuloOk: 'Excluir'
    });
    if (!ok) return;
    const { error } = await supabaseClient.from('relatorio_logs_destinatarios').delete().eq('id', id);
    if (error) { if (!tratarErroDeSessao(error)) mostrarMsgRelatorio('Erro ao excluir: ' + error.message, 'erro'); return; }
    mostrarMsgRelatorio(`${d.nome} foi excluído da lista.`, 'ok');
    await carregarDestinatarios();
}

async function enviarRelatorioAgora() {
    const ativos = _destinatarios.filter(d => d.ativo).length;
    if (!ativos) { mostrarMsgRelatorio('Marque pelo menos um destinatário (caixa "Recebe") antes de enviar.', 'erro'); return; }
    const ok = await confirmarAcaoLogs({
        titulo: 'Enviar relatório agora',
        texto: `O relatório de <strong>hoje (00:00 até agora)</strong> será enviado pelo WhatsApp para `
            + `<strong>${ativos} destinatário(s)</strong>.<br>`
            + `<span style="font-size:0.83rem;">O envio automático das 17:00 continua normalmente.</span>`,
        tipo: 'whatsapp', icone: 'fab fa-whatsapp', rotuloOk: 'Enviar agora', iconeOk: 'fas fa-paper-plane'
    });
    if (!ok) return;
    const btn = document.getElementById('btn-relatorio-agora');
    btn.disabled = true;
    mostrarMsgRelatorio('Gerando o PDF e enviando...', 'aviso');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) { mostrarMsgRelatorio('Sua sessão expirou. Entre novamente.', 'erro'); return; }
        const resp = await fetch(WEBHOOK_RELATORIO_LOGS, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: session.access_token }), signal: ctrl.signal
        });
        const r = resp.ok ? await resp.json() : null;
        if (r?.executou && r.enviados > 0) {
            mostrarMsgRelatorio(`Relatório enviado para ${r.enviados} de ${r.destinatarios} destinatário(s) (${Number(r.total_eventos).toLocaleString('pt-BR')} evento(s) hoje).`,
                r.enviados === r.destinatarios ? 'ok' : 'aviso');
        } else {
            const motivo = r?.motivo || '';
            mostrarMsgRelatorio(/JWT|jwt|token/.test(motivo) ? 'Sua sessão expirou. Recarregue a página e tente novamente.'
                : `Não foi possível enviar: ${motivo || (r ? 'nenhuma mensagem foi entregue' : 'serviço de mensagens indisponível')}.`, 'erro');
        }
        void carregarUltimoEnvio();
    } catch (e) {
        mostrarMsgRelatorio('Não foi possível enviar: serviço de mensagens indisponível. Tente novamente.', 'erro');
    } finally {
        clearTimeout(timer);
        btn.disabled = false;
    }
}

// ============================================================
// EXPORTAÇÃO (CSV para Excel)
// ============================================================
async function exportarLogsCSV() {
    const btn = document.getElementById('btn-exportar-logs');
    btn.disabled = true;
    try {
        let q = supabaseClient.from('logs_sistema').select('*', { count: 'exact' });
        q = aplicarFiltrosLogs(q, filtrosLogs())
            .order('criado_em', { ascending: false })
            .order('id', { ascending: false })
            .range(0, LOGS_LIMITE_EXPORTACAO - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const linhas = [['Data e hora', 'Usuário', 'E-mail', 'Ator', 'Categoria', 'Ação', 'Descrição', 'Origem', 'IP', 'Navegador', 'Detalhes']]
            .concat((data || []).map(l => [
                dataHoraLog(l.criado_em), l.usuario_nome || '', l.usuario_email || '',
                ATORES_LOG[l.ator]?.rotulo || 'Usuário', CATEGORIAS_LOG[l.categoria]?.rotulo || l.categoria,
                l.acao, l.descricao, ORIGENS_LOG[l.origem] || l.origem, l.ip || '', l.user_agent || '',
                l.dados ? JSON.stringify(l.dados) : ''
            ]));
        const csv = '﻿' + linhas.map(r => r.map(cel).join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `logs_termos_urc_${dataISOSebrae(new Date())}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if ((count || 0) > LOGS_LIMITE_EXPORTACAO) {
            mostrarErroLogs(`Exportados os ${LOGS_LIMITE_EXPORTACAO.toLocaleString('pt-BR')} registros mais recentes de ${count.toLocaleString('pt-BR')}. Reduza o período para exportar o restante.`);
        }
    } catch (err) {
        if (tratarErroDeSessao(err)) return;
        mostrarErroLogs('Erro ao exportar: ' + (err.message || err));
    } finally {
        btn.disabled = false;
    }
}
