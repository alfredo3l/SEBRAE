/* ============================================
   SEBRAE - Autenticação com Supabase
   ============================================ */

// Perfil do usuário logado - acessível globalmente por outros scripts
let _perfilAtual = null;

// Chaves do sessionStorage para cache da navbar
const _CACHE_NOME = 'sbr_navbar_nome';
const _CACHE_FOTO = 'sbr_navbar_foto';
const _CACHE_ROLE = 'sbr_navbar_role';
/** sessionStorage: último envio bem-sucedido de ultimo_acesso (timestamp ms) */
const _UA_PING_KEY = 'sbr_ultimo_acesso_ping_ms';
const _UA_PING_INTERVAL_MS = 60 * 1000;

/**
 * Chama a RPC registrar_ultimo_acesso no Supabase (com throttle por aba).
 * Ignora erros silenciosamente (ex.: RPC ainda não aplicada no projeto).
 */
async function registrarUltimoAcessoThrottled() {
    try {
        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(_UA_PING_KEY) || '0', 10);
        if (now - last < _UA_PING_INTERVAL_MS) return;

        const { error } = await supabaseClient.rpc('registrar_ultimo_acesso');
        if (error) {
            console.warn('registrar_ultimo_acesso:', error.message);
            return;
        }
        sessionStorage.setItem(_UA_PING_KEY, String(now));
    } catch (e) {
        console.warn('registrar_ultimo_acesso:', e?.message || e);
    }
}

// ===== Sessão expirada =====
// Quando a sessão acaba (expirou, foi revogada ou encerrada em outra aba), as
// consultas ao Supabase passam a falhar. Sem tratamento, a tela mostrava
// "Erro ao carregar dados" e o usuário não entendia o que fazer — agora ele é
// levado direto para o login, voltando à página em que estava depois de entrar.

let _redirecionandoLogin = false;
let _logoutIntencional = false;

/** Estamos na própria tela de login? (evita redirecionar em loop) */
function ehPaginaLogin() {
    return window.location.pathname.includes('login');
}

/**
 * Manda o usuário para o login, guardando a página atual em `redirect`.
 * @param {string} motivo - 'expirado' (sessão perdida) ou 'inativo'.
 */
function redirecionarParaLogin(motivo) {
    if (_redirecionandoLogin || ehPaginaLogin()) return;
    _redirecionandoLogin = true;

    try {
        sessionStorage.removeItem(_CACHE_NOME);
        sessionStorage.removeItem(_CACHE_FOTO);
        sessionStorage.removeItem(_CACHE_ROLE);
    } catch (_) { }

    const params = new URLSearchParams();
    if (motivo) params.set('motivo', motivo);
    const destino = window.location.pathname + window.location.search;
    if (destino && destino !== '/') params.set('redirect', destino);

    window.location.href = 'login?' + params.toString();
}

/** Reconhece os erros que significam "sua sessão não vale mais" */
function erroDeSessao(error) {
    if (!error) return false;
    if (error.status === 401 || error.code === 'PGRST301') return true;

    const msg = String(error.message || '').toLowerCase();
    return msg.includes('jwt expired')
        || msg.includes('jwt is expired')
        || msg.includes('invalid jwt')
        || msg.includes('token is expired')
        || msg.includes('refresh token')
        || msg.includes('not authenticated');
}

/**
 * Se o erro for de sessão, leva ao login e devolve `true` — assim quem chamou
 * sabe que não deve exibir a mensagem de erro genérica.
 */
function tratarErroDeSessao(error) {
    if (!erroDeSessao(error)) return false;
    redirecionarParaLogin('expirado');
    return true;
}

// Sessão encerrada pelo próprio Supabase (refresh token inválido/expirado,
// logout em outra aba): sai da tela em vez de deixar a página quebrada.
supabaseClient.auth.onAuthStateChange(function (evento) {
    if (evento === 'SIGNED_OUT' && !_logoutIntencional) {
        redirecionarParaLogin('expirado');
    }
});

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

    // Mostra/oculta o botão de menu (3 pontinhos) e a seção "Gestão de Usuários" com base no role em cache
    const menuWrapper = document.querySelector('.navbar-dropdown-wrapper');
    const linkUsuarios = document.querySelector('.navbar-dropdown-section.link-usuarios');
    if (menuWrapper && role) {
        menuWrapper.style.display = (role === 'admin') ? '' : 'none';
        if (linkUsuarios) linkUsuarios.style.display = (role === 'admin') ? '' : 'none';
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
        // Sem sessão: volta ao login guardando a página que ele tentou abrir
        redirecionarParaLogin();
        return null;
    }

    const perfil = await buscarPerfilUsuario(session.user.id);

    if (perfil && !perfil.ativo) {
        _logoutIntencional = true; // o motivo aqui é "inativo", não sessão expirada
        await supabaseClient.auth.signOut();
        window.location.href = 'login?motivo=inativo';
        return null;
    }

    // Armazena o perfil globalmente para uso em outros scripts
    _perfilAtual = perfil;

    if (perfil) {
        void registrarUltimoAcessoThrottled();
    }

    const nome = perfil?.nome_completo || session.user.user_metadata?.nome || session.user.email;

    // Atualiza navbar
    const userInfoSpan = document.querySelector('.user-info span');
    if (userInfoSpan) userInfoSpan.textContent = nome;

    const menuWrapper = document.querySelector('.navbar-dropdown-wrapper');
    const linkUsuarios = document.querySelector('.navbar-dropdown-section.link-usuarios');
    if (menuWrapper) {
        menuWrapper.style.display = (perfil?.role === 'admin') ? '' : 'none';
        if (linkUsuarios) linkUsuarios.style.display = (perfil?.role === 'admin') ? '' : 'none';
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
    _logoutIntencional = true; // não é sessão expirada: não avisar no login

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
function toggleMenuDropdown(e) {
    if (e) e.stopPropagation();
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
