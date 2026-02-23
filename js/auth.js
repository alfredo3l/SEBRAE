/* ============================================
   SEBRAE - Autenticação com Supabase
   ============================================ */

// Perfil do usuário logado - acessível globalmente por outros scripts
let _perfilAtual = null;

// Chaves do sessionStorage para cache da navbar
const _CACHE_NOME = 'sbr_navbar_nome';
const _CACHE_FOTO = 'sbr_navbar_foto';
const _CACHE_ROLE = 'sbr_navbar_role';

/**
 * Preenche a navbar imediatamente com dados do cache (sessionStorage).
 * Chamada de forma SÍNCRONA no DOMContentLoaded para eliminar o flash
 * de "Carregando..." ao navegar entre páginas.
 */
function preencherNavbarComCache() {
    const nome = sessionStorage.getItem(_CACHE_NOME);
    const foto = sessionStorage.getItem(_CACHE_FOTO);
    const role = sessionStorage.getItem(_CACHE_ROLE);

    if (nome) {
        const span = document.querySelector('.user-info span');
        if (span) span.textContent = nome;
    }

    if (foto && typeof atualizarNavbarAvatar === 'function') {
        atualizarNavbarAvatar(foto);
    }

    // Mostra/oculta o link de Gestão de Usuários com base no role em cache
    const linkUsuarios = document.querySelector('.link-usuarios');
    if (linkUsuarios && role) {
        linkUsuarios.style.display = (role === 'admin') ? '' : 'none';
    }
}

/**
 * Retorna o perfil do usuário logado (carregado após verificarAutenticacao).
 */
function obterPerfilAtual() {
    return _perfilAtual;
}

/**
 * Verifica se o usuário logado é admin.
 */
function usuarioEAdmin() {
    return _perfilAtual?.role === 'admin' && _perfilAtual?.ativo === true;
}

/**
 * Verifica se o usuário pode editar parceiros (admin ou operador).
 * Operador tem acesso a CRUD de parceiros, mas NÃO à gestão de usuários.
 */
function usuarioPodeEditar() {
    const role = _perfilAtual?.role;
    return (role === 'admin' || role === 'operador') && _perfilAtual?.ativo === true;
}

/**
 * Busca o perfil completo do usuário logado (com role).
 * Retorna null se não existir perfil cadastrado.
 */
async function buscarPerfilUsuario(userId) {
    const { data, error } = await supabaseClient
        .from('perfis_usuarios')
        .select('id, email, nome_completo, role, ativo, ultimo_acesso, foto_url')
        .eq('id', userId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Verifica se o usuário logado é administrador.
 */
async function isAdmin() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return false;

    const perfil = await buscarPerfilUsuario(session.user.id);
    return perfil?.role === 'admin' && perfil?.ativo === true;
}

/**
 * Verifica se o usuário está autenticado.
 * Se não estiver, redireciona para a página de login.
 */
async function verificarAutenticacao() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'login';
        return null;
    }

    const perfil = await buscarPerfilUsuario(session.user.id);

    if (perfil && !perfil.ativo) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login?motivo=inativo';
        return null;
    }

    // Armazena o perfil globalmente para uso em outros scripts
    _perfilAtual = perfil;

    const nome = perfil?.nome_completo || session.user.user_metadata?.nome || session.user.email;

    // Atualiza navbar
    const userInfoSpan = document.querySelector('.user-info span');
    if (userInfoSpan) userInfoSpan.textContent = nome;

    const linkUsuarios = document.querySelector('.link-usuarios');
    if (linkUsuarios) {
        linkUsuarios.style.display = (perfil?.role === 'admin') ? '' : 'none';
    }

    if (perfil?.foto_url && typeof atualizarNavbarAvatar === 'function') {
        atualizarNavbarAvatar(perfil.foto_url);
    }

    // Salva cache no sessionStorage para preencher a navbar instantaneamente
    // nas próximas navegações, eliminando o flash de "Carregando..."
    try {
        sessionStorage.setItem(_CACHE_NOME, nome);
        sessionStorage.setItem(_CACHE_ROLE, perfil?.role || '');
        if (perfil?.foto_url) {
            sessionStorage.setItem(_CACHE_FOTO, perfil.foto_url);
        } else {
            sessionStorage.removeItem(_CACHE_FOTO);
        }
    } catch (_) { /* sessionStorage indisponível (modo privado restrito) */ }

    return session;
}

/**
 * Verifica autenticação E exige que o usuário seja admin.
 * Redireciona para index se não for admin.
 */
async function verificarAutenticacaoAdmin() {
    const session = await verificarAutenticacao();
    if (!session) return null;

    const admin = await isAdmin();
    if (!admin) {
        window.location.href = 'index';
        return null;
    }

    return session;
}

/**
 * Realiza o login com email e senha
 */
async function fazerLogin(email, senha) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: senha
    });

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Realiza o logout do usuário
 */
async function fazerLogout() {
    // Limpa o cache da navbar antes de redirecionar
    try {
        sessionStorage.removeItem(_CACHE_NOME);
        sessionStorage.removeItem(_CACHE_FOTO);
        sessionStorage.removeItem(_CACHE_ROLE);
    } catch (_) { }

    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error('Erro ao fazer logout:', error.message);

    window.location.href = 'login';
}

/**
 * Configura o botão de Sair em todas as páginas
 */
function configurarBotaoSair() {
    const btnSair = document.querySelector('.btn-sair');
    if (btnSair) {
        btnSair.addEventListener('click', function (e) {
            e.preventDefault();
            fazerLogout();
        });
    }
}

/**
 * Abre/fecha o dropdown do menu (3 pontinhos)
 */
function toggleMenuDropdown() {
    const dropdown = document.getElementById('navbar-dropdown');
    if (!dropdown) return;
    const aberto = dropdown.style.display !== 'none';
    dropdown.style.display = aberto ? 'none' : 'block';
}

// Fecha o dropdown ao clicar fora dele
document.addEventListener('click', function (e) {
    const wrapper = document.querySelector('.navbar-dropdown-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        const dropdown = document.getElementById('navbar-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

// Inicialização nas páginas protegidas
document.addEventListener('DOMContentLoaded', function () {
    if (window.location.pathname.includes('login')) return;

    // Preenche a navbar INSTANTANEAMENTE com dados do cache (síncrono).
    // Elimina o flash de "Carregando..." e do ícone placeholder ao navegar.
    preencherNavbarComCache();

    configurarBotaoSair();

    // app.js já awaita verificarAutenticacao() antes de carregar os dados da página.
    // Este bloco cobre apenas páginas sem app.js (ex: usuarios.html).
    if (typeof carregarParceiros === 'undefined' && typeof carregarDetalhe === 'undefined') {
        verificarAutenticacao();
    }
});
