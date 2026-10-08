/* ============================================================
   SEBRAE - Gestão de Usuários (somente Admin)
   ============================================================ */

let todosUsuarios = [];
let _contasCompartilhadas = new Set();   // ids cuja conta também acessa outro sistema
let usuariosFiltrados = [];

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    await verificarAutenticacaoAdmin();
    await carregarUsuarios();
    await carregarSolicitacoesSenha();
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
            .select('id, email, nome_completo, role, ativo, ultimo_acesso, created_at, motivo_desativacao, foto_url, senha_temporaria, gere_senhas, whatsapp')
            .order('nome_completo', { ascending: true });

        if (error) throw error;

        todosUsuarios = data || [];

        // Contas que também acessam outro sistema do login compartilhado
        const { data: compart, error: errCompart } = await supabaseClient.rpc('admin_contas_compartilhadas');
        if (errCompart) console.warn('Contas compartilhadas:', errCompart.message);
        _contasCompartilhadas = new Set((compart || []).map(c => typeof c === 'string' ? c : Object.values(c)[0]));
        usuariosFiltrados = [...todosUsuarios];

        atualizarContadores();
        renderizarTabela();

    } catch (err) {
        if (tratarErroDeSessao(err)) return; // sessão expirada: vai para o login
        console.error('Erro ao carregar usuários:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#dc2626;">
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
                <td colspan="7" style="text-align:center; padding:40px; color:#9ca3af;">
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
            ? `<img src="${u.foto_url}${u.foto_url.includes('?') ? '&' : '?'}t=${Date.now()}" alt=""
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
                    ${(u.gere_senhas && u.role === 'admin' && u.ativo && !isAdminPrincipal) ? ' <span class="badge-gestor-senhas" title="Pode redefinir senhas e atender os pedidos do Esqueci minha senha"><i class="fas fa-key"></i> Gestor de senhas</span>' : ''}
                    ${_contasCompartilhadas.has(u.id) ? ' <span class="badge-conta-compartilhada" title="Esta conta também acessa outro sistema que usa o mesmo login: a senha é a mesma nos dois"><i class="fas fa-link"></i> Outro sistema</span>' : ''}
                    ${u.senha_temporaria ? ' <span class="badge-senha-temp" title="Ainda não trocou a senha temporária definida pelo administrador"><i class="fas fa-key"></i> Senha temporária</span>' : ''}
                </td>
                <td>${escapeHtml(u.email)}</td>
                <td style="white-space:nowrap;">${u.whatsapp
                    ? `<i class="fab fa-whatsapp" style="color:#16a34a;"></i> ${escapeHtml(u.whatsapp)}`
                    : '<span style="color:#9ca3af; font-size:0.8rem;">Não informado</span>'}</td>
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
            || u.email.toLowerCase().includes(pesquisa)
            || (!!pesquisa.replace(/\D/g, '') && digitosTelefone(u.whatsapp).includes(pesquisa.replace(/\D/g, '')));

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
    document.getElementById('usr-whatsapp').value = '';
    document.getElementById('usr-whatsapp').dataset.salvo = '';
    document.getElementById('usr-senha').value = '';
    document.getElementById('usr-role').value  = 'visualizador';
    document.getElementById('usr-email').readOnly = false;
    document.getElementById('usr-senha').required = true;
    document.getElementById('usr-senha').disabled = false;
    document.getElementById('senha-obrigatorio').style.display = '';
    document.getElementById('campo-senha').style.display = '';
    document.getElementById('campo-senha-bloqueada').style.display = 'none';
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
    document.getElementById('usr-whatsapp').value = u.whatsapp || '';
    document.getElementById('usr-whatsapp').dataset.salvo = u.whatsapp || '';
    document.getElementById('usr-senha').value = '';
    document.getElementById('usr-role').value  = u.role;
    document.getElementById('usr-ativo').value = u.ativo ? 'true' : 'false';
    document.getElementById('usr-motivo').value = u.motivo_desativacao || '';

    // Email não pode ser alterado após criação
    document.getElementById('usr-email').readOnly = true;
    document.getElementById('usr-senha').required = false;
    document.getElementById('usr-senha').disabled = true;
    document.getElementById('senha-obrigatorio').style.display = 'none';
    document.getElementById('campo-senha').style.display = 'none';
    document.getElementById('campo-senha-bloqueada').style.display = '';

    // Redefinir senha: fechado ao abrir; não vale para a própria conta (Meu Perfil)
    // Só o Administrador SEBRAE redefine (pode_gerir_senhas no banco)
    const ehProprio = u.id === _perfilAtual?.id;
    const gestor = podeGerirSenhas();
    const alvoPrincipal = ehAdminPrincipal(u);
    // Senha do principal: ninguém redefine pela tela (só o suporte, pelo banco)
    const bloqueioPrincipal = gestor && alvoPrincipal && !ehProprio;
    document.getElementById('redefinir-senha-box').hidden = ehProprio || !gestor || alvoPrincipal;
    document.getElementById('redefinir-senha-propria').hidden = !(ehProprio && gestor);
    const restrita = document.getElementById('redefinir-senha-restrita');
    restrita.hidden = gestor && !bloqueioPrincipal;
    restrita.textContent = bloqueioPrincipal
        ? 'A senha do administrador principal só pode ser redefinida pelo suporte técnico.'
        : 'A redefinição de senha é feita pelos gestores de senhas.';

    // Chave "Pode cuidar de senhas": gestores a veem nos administradores (exceto o principal)
    const campoGestor = document.getElementById('campo-gestor-senhas');
    const chaveGestor = document.getElementById('usr-gestor-senhas');
    campoGestor.hidden = !(gestor && u.role === 'admin' && !alvoPrincipal);
    chaveGestor.checked = !!u.gere_senhas;
    chaveGestor.dataset.original = u.gere_senhas ? '1' : '0';
    document.getElementById('redefinir-senha-compartilhada').hidden = !_contasCompartilhadas.has(u.id);
    cancelarRedefinirSenha();

    // Mostrar campos de status (exceto para o admin principal)
    const isAdminPrincipal = u.email === 'admin@sebrae.com.br';
    document.getElementById('campo-ativo').style.display  = isAdminPrincipal ? 'none' : '';
    document.getElementById('campo-motivo').style.display = isAdminPrincipal ? 'none' : '';

    // Impedir alterar role do admin principal
    document.getElementById('usr-role').disabled = isAdminPrincipal;

    esconderAlertaModal();
    document.getElementById('modal-usuario').style.display = 'flex';
}

// ============================================================
// REDEFINIR SENHA (admin) — senha temporária, troca no 1º acesso
// ============================================================
function abrirRedefinirSenha() {
    document.getElementById('btn-abrir-redefinir').hidden = true;
    document.getElementById('redefinir-senha-campos').hidden = false;
    document.getElementById('usr-senha-temp').focus();
}

function cancelarRedefinirSenha() {
    document.getElementById('usr-senha-temp').value = '';
    document.getElementById('usr-senha-temp-conf').value = '';
    document.getElementById('redefinir-senha-campos').hidden = true;
    document.getElementById('btn-abrir-redefinir').hidden = false;
}

async function confirmarRedefinirSenha() {
    const id = document.getElementById('usr-id').value;
    const senha = document.getElementById('usr-senha-temp').value;
    const conf = document.getElementById('usr-senha-temp-conf').value;
    const u = todosUsuarios.find(x => x.id === id);
    if (!id || !u) return;

    if (senha.length < 8) return mostrarAlertaModal('A senha temporária deve ter no mínimo 8 caracteres.', 'erro');
    if (senha !== conf) return mostrarAlertaModal('A confirmação não confere com a senha temporária.', 'erro');

    const btn = document.getElementById('btn-confirmar-redefinir');
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('admin_redefinir_senha', { p_usuario: id, p_nova_senha: senha });
        if (error) throw error;
        cancelarRedefinirSenha();
        mostrarAlertaModal(`Senha temporária definida para ${u.nome_completo}. Informe-a ao usuário: no próximo acesso ele será obrigado a criar a própria senha.`, 'sucesso');
        await carregarUsuarios();
        await carregarSolicitacoesSenha();
        void atualizarAvisoPedidosSenha();   // contador do menu
    } catch (err) {
        if (tratarErroDeSessao(err)) return;
        mostrarAlertaModal(traduzirErro(err.message || String(err)), 'erro');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
// SOLICITAÇÕES DO "ESQUECI MINHA SENHA"
// ============================================================
async function carregarSolicitacoesSenha() {
    const box = document.getElementById('solicitacoes-senha');
    if (!box) return;
    // Pedidos só para o Administrador SEBRAE (a RLS também só entrega a ele)
    if (!podeGerirSenhas()) { box.hidden = true; return; }
    const { data, error } = await supabaseClient
        .from('solicitacoes_senha')
        .select('id, perfil_id, email, criado_em')
        .eq('status', 'pendente')
        .order('criado_em', { ascending: true });
    if (error) {
        console.warn('Solicitações de senha:', error.message);
        box.hidden = true;
        return;
    }
    const pendentes = data || [];
    box.hidden = pendentes.length === 0;
    if (!pendentes.length) { box.innerHTML = ''; return; }

    const itens = pendentes.map(sol => {
        const u = todosUsuarios.find(x => x.id === sol.perfil_id);
        const nome = u ? u.nome_completo : sol.email;
        const botao = u
            ? `<button type="button" class="btn-redefinir-senha" onclick="abrirRedefinicaoDaSolicitacao('${u.id}')"><i class="fas fa-key"></i> Redefinir senha</button>`
            : '';
        return `
            <li>
                <span><strong>${escapeHtml(nome)}</strong> — ${escapeHtml(sol.email)}
                <small>pediu em ${formatarDataHora(sol.criado_em)}</small></span>
                ${botao}
            </li>`;
    }).join('');

    box.innerHTML = `
        <div class="solicitacoes-senha-titulo">
            <i class="fas fa-key"></i>
            ${pendentes.length === 1 ? '1 solicitação' : pendentes.length + ' solicitações'} de redefinição de senha
            <small>("Esqueci minha senha" na tela de login)</small>
        </div>
        <ul>${itens}</ul>`;
}

/** Da faixa de solicitações: abre o modal do usuário já com a redefinição aberta */
function abrirRedefinicaoDaSolicitacao(id) {
    abrirModalEditarUsuario(id);
    abrirRedefinirSenha();
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
    const campoWhats  = document.getElementById('usr-whatsapp');

    const modoEdicao = !!id;

    iniciarSpinner();

    try {
        // Telefone com WhatsApp (opcional): confere antes de gravar qualquer coisa
        const whats = await prepararWhatsAppUsuario(campoWhats.value, campoWhats.dataset.salvo);
        if (whats.erro) {
            mostrarAlertaModal(whats.erro, 'erro');
            campoWhats.focus();
            return;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (modoEdicao) {
            // ---- EDITAR ----
            const atualizacao = {
                nome_completo: nomeCompleto,
                role:          role,
                updated_by:    session.user.id
            };
            if (whats.alterado) {
                atualizacao.whatsapp     = whats.whatsapp;
                atualizacao.whatsapp_jid = whats.jid;
            }

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

            // Delegação de "cuidar de senhas": só pela função do banco (gatilho barra o UPDATE direto)
            const campoGestor = document.getElementById('campo-gestor-senhas');
            const chaveGestor = document.getElementById('usr-gestor-senhas');
            const querGestor = chaveGestor.checked && role === 'admin';
            if (!campoGestor.hidden && (querGestor ? '1' : '0') !== chaveGestor.dataset.original) {
                const { error: errGestor } = await supabaseClient
                    .rpc('definir_gestor_senhas', { p_usuario: id, p_valor: querGestor });
                if (errGestor) throw errGestor;
            }

            mostrarAlertaModal('Usuário atualizado com sucesso!' + whats.aviso, 'sucesso');

        } else {
            // ---- CRIAR ----
            // O login do Supabase é compartilhado com outros sistemas: se o
            // e-mail já tem conta lá, o banco VINCULA essa conta (mesma senha
            // para os dois) — o admin confirma antes, pois a senha digitada
            // passa a valer também no outro sistema.
            const { data: emOutroSistema, error: errCheck } = await supabaseClient
                .rpc('admin_email_em_outro_sistema', { p_email: email });
            if (errCheck) throw errCheck;

            if (emOutroSistema && !podeGerirSenhas()) {
                // Vincular troca a senha da conta existente: só o gestor
                mostrarAlertaModal('Este e-mail já tem acesso a outro sistema; somente um gestor de senhas pode vincular essa conta.', 'erro');
                return;
            }

            if (emOutroSistema) {
                pararSpinner();
                abrirModalConfirmacao({
                    titulo: 'E-mail já usado em outro sistema',
                    texto: `<strong>${escapeHtml(email)}</strong> já tem acesso a outro sistema que usa o mesmo login.<br>
                        <span style="font-size:0.83rem;">A conta será <strong>vinculada</strong> ao Termos URC e a senha digitada
                        passará a valer <strong>também no outro sistema</strong>. No primeiro acesso o usuário criará a nova senha,
                        que valerá para os dois.</span>`,
                    tipo: 'ativar',
                    labelOk: 'Vincular conta',
                    onConfirmar: () => criarUsuarioConfirmado({ email, senha, nomeCompleto, role, vinculada: true, whats })
                });
                return;
            }

            await criarUsuarioConfirmado({ email, senha, nomeCompleto, role, vinculada: false, whats });
            return;
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

/** Cria (ou vincula, se o e-mail já tem conta em outro sistema) via RPC admin_criar_usuario */
async function criarUsuarioConfirmado({ email, senha, nomeCompleto, role, vinculada, whats }) {
    iniciarSpinner();
    try {
        const { data: novoId, error } = await supabaseClient.rpc('admin_criar_usuario', {
            p_email:         email,
            p_senha:         senha,
            p_nome_completo: nomeCompleto,
            p_role:          role
        });
        if (error) throw error;

        // O telefone vai num UPDATE à parte (admin_criar_usuario não o recebe).
        // Se falhar, o usuário já existe: avisa para completar pelo Editar.
        let avisoWhats = whats?.aviso || '';
        if (whats?.whatsapp && novoId) {
            const { error: errWhats } = await supabaseClient
                .from('perfis_usuarios')
                .update({ whatsapp: whats.whatsapp, whatsapp_jid: whats.jid })
                .eq('id', novoId);
            if (errWhats) {
                console.error('Erro ao gravar WhatsApp do novo usuário:', errWhats);
                avisoWhats = ' Atenção: o telefone não foi salvo — informe-o novamente em Editar Usuário.';
            }
        }

        mostrarAlertaModal((vinculada
            ? 'Conta vinculada ao Termos URC. A senha digitada já vale também no outro sistema; no primeiro acesso o usuário criará a nova senha.'
            : 'Usuário criado com sucesso! No primeiro acesso ele criará a própria senha.') + avisoWhats, 'sucesso');
        await carregarUsuarios();
        setTimeout(() => fecharModalUsuario(), vinculada ? 3500 : 1500);
    } catch (err) {
        if (tratarErroDeSessao(err)) return;
        console.error('Erro ao criar usuário:', err);
        mostrarAlertaModal(traduzirErro(err.message || err), 'erro');
    } finally {
        pararSpinner();
    }
}

/**
 * Telefone com WhatsApp do usuário (08/10/2026) — opcional. Confere o formato e,
 * se mudou, pergunta à Evolution se o número tem WhatsApp: sem WhatsApp não
 * grava; serviço fora do ar grava com aviso (decisão do desenvolvedor).
 * Devolve { erro } ou { alterado, whatsapp, jid, aviso }.
 */
async function prepararWhatsAppUsuario(valor, salvo) {
    const digitos = digitosTelefone(valor);
    const base = { alterado: false, whatsapp: null, jid: null, aviso: '' };
    if (digitos === digitosTelefone(salvo)) return base;
    if (!digitos) return { ...base, alterado: true };
    if (!telefoneValido(digitos)) {
        return { erro: 'Telefone incompleto: informe o DDD e o número (10 ou 11 dígitos).' };
    }
    const whatsapp = formatarTelefoneParaCadastro(digitos);
    const v = await verificarWhatsApp(whatsapp);
    if (v.exists === false) {
        return { erro: 'Este número não tem WhatsApp. Confira o DDD e o número.' };
    }
    return {
        alterado: true,
        whatsapp,
        jid: v.exists === true ? (v.whatsapp || null) : null,
        aviso: v.exists === true ? '' : ' Não foi possível confirmar agora se o telefone tem WhatsApp.'
    };
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
    return formatarDataSebrae(iso);
}

function formatarDataHora(iso) {
    if (!iso) return '-';
    return formatarDataHoraSebrae(iso);
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
