/* ============================================================
   SEBRAE - Gestão de Usuários (somente Admin)
   ============================================================ */

let todosUsuarios = [];
let usuariosFiltrados = [];

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    await verificarAutenticacaoAdmin();
    await carregarUsuarios();
    configurarBotaoSair();
});

// Substitui mini avatares quebrados pelo placeholder
document.addEventListener('error', function (e) {
    if (e.target.tagName === 'IMG' && e.target.dataset.fallback === 'avatar') {
        const placeholder = document.createElement('span');
        placeholder.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#e5e7eb;color:#9ca3af;font-size:0.8rem;vertical-align:middle;margin-right:6px;flex-shrink:0;';
        placeholder.innerHTML = '<i class="fas fa-user"></i>';
        e.target.parentNode?.replaceChild(placeholder, e.target);
    }
}, true);

// ============================================================
// CARREGAR LISTA DE USUÁRIOS
// ============================================================
async function carregarUsuarios() {
    const tbody = document.getElementById('tbody-usuarios');

    try {
        const { data, error } = await supabaseClient
            .from('perfis_usuarios')
            .select('id, email, nome_completo, role, ativo, ultimo_acesso, created_at, motivo_desativacao, foto_url')
            .order('nome_completo', { ascending: true });

        if (error) throw error;

        todosUsuarios = data || [];
        usuariosFiltrados = [...todosUsuarios];

        atualizarContadores();
        renderizarTabela();

    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:40px; color:#dc2626;">
                    <i class="fas fa-exclamation-triangle" style="font-size:1.4rem;"></i>
                    <p style="margin-top:10px;">Erro ao carregar usuários. Tente novamente.</p>
                </td>
            </tr>`;
    }
}

// ============================================================
// ATUALIZAR CONTADORES DO RESUMO
// ============================================================
function atualizarContadores() {
    const total   = todosUsuarios.length;
    const ativos  = todosUsuarios.filter(u => u.ativo).length;
    const inativos = total - ativos;
    const admins  = todosUsuarios.filter(u => u.role === 'admin').length;

    document.getElementById('cnt-total').textContent   = total;
    document.getElementById('cnt-ativos').textContent  = ativos;
    document.getElementById('cnt-inativos').textContent = inativos;
    document.getElementById('cnt-admins').textContent  = admins;
}

// ============================================================
// RENDERIZAR TABELA
// ============================================================
function renderizarTabela() {
    const tbody = document.getElementById('tbody-usuarios');

    if (usuariosFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:40px; color:#9ca3af;">
                    <i class="fas fa-users-slash" style="font-size:1.4rem;"></i>
                    <p style="margin-top:10px;">Nenhum usuário encontrado.</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = usuariosFiltrados.map(u => {
        const badgeRole   = badgeRoleHtml(u.role);
        const badgeStatus = u.ativo
            ? `<span class="badge-status ativo"><i class="fas fa-check-circle"></i> Ativo</span>`
            : `<span class="badge-status inativo"><i class="fas fa-ban"></i> Inativo</span>`;

        const ultimoAcesso = u.ultimo_acesso
            ? formatarDataHora(u.ultimo_acesso)
            : `<span style="color:#9ca3af; font-size:0.8rem;">Nunca acessou</span>`;

        const isAdminPrincipal = u.email === 'admin@sebrae.com.br';

        const fotoHtml = u.foto_url
            ? `<img src="${u.foto_url}?t=${Date.now()}" alt=""
                    data-fallback="avatar"
                    style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid #e5e7eb;vertical-align:middle;margin-right:6px;">`
            : `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#e5e7eb;color:#9ca3af;font-size:0.8rem;vertical-align:middle;margin-right:6px;flex-shrink:0;"><i class="fas fa-user"></i></span>`;

        const btnEditar = `
            <button class="btn-acao editar" title="Editar usuário"
                    onclick="abrirModalEditarUsuario('${u.id}')">
                <i class="fas fa-edit"></i>
            </button>`;

        const btnFoto = `
            <button class="btn-acao" title="Alterar foto do usuário" style="color:#7c3aed;"
                    onclick="abrirModalPerfil('${u.id}')">
                <i class="fas fa-camera"></i>
            </button>`;

        const estadoToggle = u.ativo ? 'on' : 'off';
        const labelToggle  = u.ativo ? 'Ativo' : 'Inativo';
        const toggleStatus = isAdminPrincipal
            ? `<span class="toggle-wrap ${estadoToggle} disabled" title="Admin principal não pode ser desativado">
                   <span class="toggle-track ${estadoToggle}">
                       <span class="toggle-thumb"></span>
                   </span>
                   <span class="toggle-label">${labelToggle}</span>
               </span>`
            : `<span class="toggle-wrap ${estadoToggle}" title="${u.ativo ? 'Clique para desativar' : 'Clique para ativar'}"
                     onclick="confirmarAlterarStatus('${u.id}', ${!u.ativo})">
                   <span class="toggle-track ${estadoToggle}">
                       <span class="toggle-thumb"></span>
                   </span>
                   <span class="toggle-label">${labelToggle}</span>
               </span>`;

        return `
            <tr style="${!u.ativo ? 'opacity:0.6;' : ''}">
                <td style="white-space:nowrap;">
                    ${fotoHtml}<strong>${escapeHtml(u.nome_completo)}</strong>
                    ${isAdminPrincipal ? ' <i class="fas fa-crown" style="color:#d97706; font-size:0.75rem;" title="Admin principal"></i>' : ''}
                </td>
                <td>${escapeHtml(u.email)}</td>
                <td>${badgeRole}</td>
                <td>${ultimoAcesso}</td>
                <td>${formatarData(u.created_at)}</td>
                <td style="white-space:nowrap; vertical-align:middle;">
                    <div style="display:flex; align-items:center; gap:4px;">
                        ${btnEditar}
                        ${btnFoto}
                        ${toggleStatus}
                    </div>
                </td>
            </tr>`;
    }).join('');
}

// ============================================================
// FILTROS
// ============================================================
function filtrarUsuarios() {
    const pesquisa = document.getElementById('filtro-pesquisa').value.toLowerCase().trim();
    const role     = document.getElementById('filtro-role').value;
    const status   = document.getElementById('filtro-status').value;

    usuariosFiltrados = todosUsuarios.filter(u => {
        const matchPesquisa = !pesquisa
            || u.nome_completo.toLowerCase().includes(pesquisa)
            || u.email.toLowerCase().includes(pesquisa);

        const matchRole = !role || u.role === role;

        const matchStatus = !status
            || (status === 'ativo'   &&  u.ativo)
            || (status === 'inativo' && !u.ativo);

        return matchPesquisa && matchRole && matchStatus;
    });

    renderizarTabela();
}

// ============================================================
// MODAL NOVO USUÁRIO
// ============================================================
function abrirModalNovoUsuario() {
    document.getElementById('modal-titulo').innerHTML =
        '<i class="fas fa-user-plus"></i> Novo Usuário';
    document.getElementById('usr-id').value    = '';
    document.getElementById('usr-nome').value  = '';
    document.getElementById('usr-email').value = '';
    document.getElementById('usr-senha').value = '';
    document.getElementById('usr-role').value  = 'visualizador';
    document.getElementById('usr-email').readOnly = false;
    document.getElementById('usr-senha').required = true;
    document.getElementById('senha-obrigatorio').style.display = '';
    document.getElementById('campo-ativo').style.display  = 'none';
    document.getElementById('campo-motivo').style.display = 'none';

    esconderAlertaModal();
    document.getElementById('modal-usuario').style.display = 'flex';
}

// ============================================================
// MODAL EDITAR USUÁRIO
// ============================================================
function abrirModalEditarUsuario(id) {
    const u = todosUsuarios.find(x => x.id === id);
    if (!u) return;

    document.getElementById('modal-titulo').innerHTML =
        '<i class="fas fa-user-edit"></i> Editar Usuário';
    document.getElementById('usr-id').value    = u.id;
    document.getElementById('usr-nome').value  = u.nome_completo;
    document.getElementById('usr-email').value = u.email;
    document.getElementById('usr-senha').value = '';
    document.getElementById('usr-role').value  = u.role;
    document.getElementById('usr-ativo').value = u.ativo ? 'true' : 'false';
    document.getElementById('usr-motivo').value = u.motivo_desativacao || '';

    // Email não pode ser alterado após criação
    document.getElementById('usr-email').readOnly = true;
    document.getElementById('usr-senha').required = false;
    document.getElementById('senha-obrigatorio').style.display = 'none';

    // Mostrar campos de status (exceto para o admin principal)
    const isAdminPrincipal = u.email === 'admin@sebrae.com.br';
    document.getElementById('campo-ativo').style.display  = isAdminPrincipal ? 'none' : '';
    document.getElementById('campo-motivo').style.display = isAdminPrincipal ? 'none' : '';

    // Impedir alterar role do admin principal
    document.getElementById('usr-role').disabled = isAdminPrincipal;

    esconderAlertaModal();
    document.getElementById('modal-usuario').style.display = 'flex';
}

function fecharModalUsuario() {
    document.getElementById('modal-usuario').style.display = 'none';
    document.getElementById('usr-role').disabled = false;
}

// ============================================================
// SALVAR USUÁRIO (criar ou atualizar)
// ============================================================
async function salvarUsuario(event) {
    event.preventDefault();

    const id          = document.getElementById('usr-id').value;
    const nomeCompleto = document.getElementById('usr-nome').value.trim();
    const email       = document.getElementById('usr-email').value.trim().toLowerCase();
    const senha       = document.getElementById('usr-senha').value;
    const role        = document.getElementById('usr-role').value;
    const ativoVal    = document.getElementById('usr-ativo').value;
    const motivo      = document.getElementById('usr-motivo').value.trim();

    const modoEdicao = !!id;

    iniciarSpinner();

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (modoEdicao) {
            // ---- EDITAR ----
            const atualizacao = {
                nome_completo: nomeCompleto,
                role:          role,
                updated_by:    session.user.id
            };

            const campoAtivo = document.getElementById('campo-ativo');
            if (campoAtivo.style.display !== 'none') {
                atualizacao.ativo = ativoVal === 'true';
                if (ativoVal === 'false') {
                    atualizacao.motivo_desativacao = motivo || null;
                } else {
                    atualizacao.motivo_desativacao = null;
                }
            }

            const { error } = await supabaseClient
                .from('perfis_usuarios')
                .update(atualizacao)
                .eq('id', id);

            if (error) throw error;

            mostrarAlertaModal('Usuário atualizado com sucesso!', 'sucesso');

        } else {
            // ---- CRIAR ----
            // 1. Criar conta no Auth via Admin API (necessita service_role)
            // Como este é frontend com anon key, usamos a função RPC ou
            // criamos com signUp e depois confirmamos via trigger.
            // Aqui chamamos uma função RPC segura no banco:
            const { data: novoUser, error: errAuth } = await supabaseClient
                .rpc('admin_criar_usuario', {
                    p_email:        email,
                    p_senha:        senha,
                    p_nome_completo: nomeCompleto,
                    p_role:         role
                });

            if (errAuth) throw errAuth;

            mostrarAlertaModal('Usuário criado com sucesso!', 'sucesso');
        }

        await carregarUsuarios();
        setTimeout(() => fecharModalUsuario(), 1500);

    } catch (err) {
        console.error('Erro ao salvar usuário:', err);
        const msg = traduzirErro(err.message || err);
        mostrarAlertaModal(msg, 'erro');
    } finally {
        pararSpinner();
    }
}

// ============================================================
// MODAL DE CONFIRMAÇÃO CUSTOMIZADO
// ============================================================
function abrirModalConfirmacao({ titulo, texto, tipo, labelOk, onConfirmar }) {
    const modal     = document.getElementById('modal-confirmacao');
    const iconWrap  = document.getElementById('confirm-icon-wrap');
    const icon      = document.getElementById('confirm-icon');
    const tituloEl  = document.getElementById('confirm-titulo');
    const textoEl   = document.getElementById('confirm-texto');
    const btnOk     = document.getElementById('btn-confirm-ok');
    const btnOkIcon = document.getElementById('btn-confirm-icon');
    const btnLabel  = document.getElementById('btn-confirm-label');
    const btnCancel = document.getElementById('btn-confirm-cancelar');

    // Configura visual conforme o tipo
    iconWrap.className = `modal-confirm-icon ${tipo}`;
    btnOk.className    = `btn-confirm-ok ${tipo}`;

    if (tipo === 'desativar') {
        icon.className      = 'fas fa-ban';
        btnOkIcon.className = 'fas fa-ban';
    } else {
        icon.className      = 'fas fa-check-circle';
        btnOkIcon.className = 'fas fa-check-circle';
    }

    tituloEl.textContent  = titulo;
    textoEl.innerHTML     = texto;
    btnLabel.textContent  = labelOk;

    modal.style.display = 'flex';

    // Remove listeners antigos clonando os botões
    const novoOk     = btnOk.cloneNode(true);
    const novoCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(novoOk, btnOk);
    btnCancel.parentNode.replaceChild(novoCancel, btnCancel);

    // Re-aplica ícone e label no clone
    novoOk.querySelector('i').className    = icon.className;
    novoOk.querySelector('span').textContent = labelOk;

    novoOk.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirmar();
    });
    novoCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

// ============================================================
// ATIVAR / DESATIVAR RÁPIDO (botão na tabela)
// ============================================================
function confirmarAlterarStatus(id, novoStatus) {
    const u = todosUsuarios.find(x => x.id === id);
    if (!u) return;

    const tipo    = novoStatus ? 'ativar' : 'desativar';
    const titulo  = novoStatus ? 'Ativar usuário' : 'Desativar usuário';
    const labelOk = novoStatus ? 'Ativar' : 'Desativar';
    const texto   = novoStatus
        ? `Deseja reativar o acesso de <strong>${escapeHtml(u.nome_completo)}</strong>?<br>
           <span style="font-size:0.83rem;">O usuário poderá acessar o sistema normalmente.</span>`
        : `Deseja desativar o acesso de <strong>${escapeHtml(u.nome_completo)}</strong>?<br>
           <span style="font-size:0.83rem;">O usuário não conseguirá mais entrar no sistema.</span>`;

    abrirModalConfirmacao({
        titulo,
        texto,
        tipo,
        labelOk,
        onConfirmar: () => executarAlterarStatus(id, novoStatus)
    });
}

async function executarAlterarStatus(id, novoStatus) {
    const acao = novoStatus ? 'ativar' : 'desativar';
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        const payload = {
            ativo:      novoStatus,
            updated_by: session.user.id
        };
        if (!novoStatus) {
            payload.motivo_desativacao = 'Desativado pelo administrador';
        } else {
            payload.motivo_desativacao = null;
        }

        const { error } = await supabaseClient
            .from('perfis_usuarios')
            .update(payload)
            .eq('id', id);

        if (error) throw error;

        await carregarUsuarios();

    } catch (err) {
        console.error(`Erro ao ${acao} usuário:`, err);
        alert('Erro: ' + traduzirErro(err.message));
    }
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function badgeRoleHtml(role) {
    const mapa = {
        admin:        { label: 'Administrador', icon: 'fa-crown' },
        operador:     { label: 'Operador',      icon: 'fa-user-edit' },
        visualizador: { label: 'Visualizador',  icon: 'fa-eye' }
    };
    const r = mapa[role] || { label: role, icon: 'fa-user' };
    return `<span class="badge-role ${role}"><i class="fas ${r.icon}"></i> ${r.label}</span>`;
}

function formatarData(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDataHora(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function traduzirErro(msg) {
    if (!msg) return 'Erro desconhecido.';
    if (msg.includes('duplicate') || msg.includes('unique'))
        return 'Já existe um usuário com este e-mail.';
    if (msg.includes('admin principal'))
        return 'Não é permitido alterar o administrador principal.';
    if (msg.includes('permission') || msg.includes('policy'))
        return 'Você não tem permissão para esta operação.';
    return msg;
}

function mostrarAlertaModal(msg, tipo) {
    const div = document.getElementById('alerta-modal');
    const span = document.getElementById('alerta-modal-msg');
    div.className = `alert-inline ${tipo}`;
    div.style.display = 'flex';
    span.textContent = msg;
}

function esconderAlertaModal() {
    document.getElementById('alerta-modal').style.display = 'none';
}

function iniciarSpinner() {
    const btn = document.getElementById('btn-salvar-usuario');
    btn.disabled = true;
    document.getElementById('spinner-salvar').style.display = 'block';
    document.getElementById('icon-salvar').style.display = 'none';
    document.getElementById('txt-salvar').textContent = 'Salvando...';
}

function pararSpinner() {
    const btn = document.getElementById('btn-salvar-usuario');
    btn.disabled = false;
    document.getElementById('spinner-salvar').style.display = 'none';
    document.getElementById('icon-salvar').style.display = '';
    document.getElementById('txt-salvar').textContent = 'Salvar';
}

// ============================================================
// ATUALIZA FOTO NA TABELA APÓS UPLOAD (sem reload completo)
// ============================================================
function atualizarFotoNaTabela(userId, fotoUrl) {
    const u = todosUsuarios.find(x => x.id === userId);
    if (u) {
        u.foto_url = fotoUrl;
        const uFilt = usuariosFiltrados.find(x => x.id === userId);
        if (uFilt) uFilt.foto_url = fotoUrl;
        renderizarTabela();
    }
}

// Fechar modais ao clicar no overlay
document.getElementById('modal-usuario')?.addEventListener('click', function (e) {
    if (e.target === this) fecharModalUsuario();
});

document.getElementById('modal-confirmacao')?.addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
});
