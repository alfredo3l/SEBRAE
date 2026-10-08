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

// Uma única tentativa de renovar o token por aba antes de mandar ao login —
// se a renovação "funcionar" mas o servidor seguir recusando, não recarrega de novo.
const _CHAVE_REFRESH_TENTADO = 'sbr_refresh_tentado';

/**
 * Apaga a sessão guardada no navegador (sem depender do servidor). Sem isso,
 * o login lia o token recusado do localStorage, achava que havia sessão e
 * devolvia o usuário à página — loop infinito entre / e /login.
 */
async function limparSessaoLocal() {
    _logoutIntencional = true; // o SIGNED_OUT abaixo não deve redirecionar de novo
    try {
        await supabaseClient.auth.signOut({ scope: 'local' });
    } catch (_) { }
    // Rede de segurança: remove a chave do supabase-js mesmo se o signOut falhar
    try {
        Object.keys(localStorage)
            .filter(k => /^sb-.*-auth-token$/.test(k))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) { }
}

/**
 * Manda o usuário para o login, guardando a página atual em `redirect`.
 * Com motivo 'expirado', tenta antes renovar o token (uma vez por aba) e, se não
 * der, limpa a sessão local para o login não devolver o usuário para cá.
 * @param {string} motivo - 'expirado' (sessão perdida) ou 'inativo'.
 */
async function redirecionarParaLogin(motivo) {
    if (_redirecionandoLogin || ehPaginaLogin()) return;
    _redirecionandoLogin = true;

    if (motivo === 'expirado') {
        let jaTentou = false;
        try { jaTentou = sessionStorage.getItem(_CHAVE_REFRESH_TENTADO) === '1'; } catch (_) { }

        if (!jaTentou) {
            try { sessionStorage.setItem(_CHAVE_REFRESH_TENTADO, '1'); } catch (_) { }
            try {
                const { data, error } = await supabaseClient.auth.refreshSession();
                if (!error && data?.session) {
                    window.location.reload();
                    return;
                }
            } catch (_) { }
        }
        await limparSessaoLocal();
    }

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
    void redirecionarParaLogin('expirado');
    return true;
}

// Sessão encerrada pelo próprio Supabase (refresh token inválido/expirado,
// logout em outra aba): sai da tela em vez de deixar a página quebrada.
supabaseClient.auth.onAuthStateChange(function (evento) {
    if (evento === 'SIGNED_OUT' && !_logoutIntencional) {
        void redirecionarParaLogin('expirado');
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
        .select('id, email, nome_completo, role, ativo, ultimo_acesso, foto_url, senha_temporaria, gere_senhas')
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

    // Senha temporária (definida pelo admin): troca obrigatória antes de usar
    if (perfil?.senha_temporaria) mostrarTrocaSenhaObrigatoria(perfil);

    // Gestor de senhas: contador de pedidos do "Esqueci minha senha" no menu
    if (podeGerirSenhas()) void atualizarAvisoPedidosSenha();

    if (perfil) {
        void registrarUltimoAcessoThrottled();
        // O token foi aceito pelo servidor: libera nova tentativa de renovação no futuro
        try { sessionStorage.removeItem(_CHAVE_REFRESH_TENTADO); } catch (_) { }
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
 * Gestor de senhas: redefine senhas, vê os pedidos do "Esqueci minha senha",
 * vincula conta existente e concede/retira a função de outros admins.
 * = o administrador principal (admin@sebrae.com.br) OU um administrador ativo
 * com a marca gere_senhas (delegação, 08/10/2026). O banco aplica a mesma
 * regra (pode_gerir_senhas()); aqui é só para a tela.
 */
const EMAIL_GESTOR_SENHAS = 'admin@sebrae.com.br';
function ehAdminPrincipal(perfil) {
    return (perfil?.email || '').toLowerCase() === EMAIL_GESTOR_SENHAS;
}
/**
 * Usuários ocultos (08/10/2026): a conta do desenvolvedor (marca
 * perfis_usuarios.oculto, só alterável pelo banco) só aparece para o
 * administrador principal e para ela mesma. Para os demais somem a linha na
 * Gestão de Usuários, a opção no filtro "Usuário", os termos que ela gerar
 * e a autoria. Decisão do desenvolvedor: ocultação só de tela.
 */
let _usuariosOcultos = null;   // Set de ids (null = ainda não carregado)

async function carregarUsuariosOcultos() {
    if (_usuariosOcultos) return _usuariosOcultos;
    try {
        const { data, error } = await supabaseClient
            .from('perfis_usuarios')
            .select('id')
            .eq('oculto', true);
        if (error) throw error;
        _usuariosOcultos = new Set((data || []).map(u => u.id));
    } catch (e) {
        console.warn('Usuários ocultos:', e?.message || e);
        _usuariosOcultos = new Set();
    }
    return _usuariosOcultos;
}

/** Quem está logado vê os usuários ocultos? (só o administrador principal) */
function veUsuariosOcultos() {
    return _perfilAtual?.role === 'admin' && _perfilAtual?.ativo === true && ehAdminPrincipal(_perfilAtual);
}

/** Este autor/usuário deve sumir para quem está logado? (ele mesmo sempre se vê) */
function usuarioOcultoParaMim(id) {
    if (!id || !_usuariosOcultos || veUsuariosOcultos()) return false;
    if (id === _perfilAtual?.id) return false;
    return _usuariosOcultos.has(id);
}

function podeGerirSenhas() {
    return _perfilAtual?.role === 'admin' && _perfilAtual?.ativo === true
        && (ehAdminPrincipal(_perfilAtual) || _perfilAtual?.gere_senhas === true);
}

/**
 * Contador vermelho no botão do menu (⋮) e item "Pedidos de senha (N)" na
 * seção Administração, em qualquer tela. Inserido por JS: não precisa mexer
 * nas 6 páginas. Sem pedidos, some. Só o gestor lê a tabela (RLS).
 */
async function atualizarAvisoPedidosSenha() {
    if (!podeGerirSenhas()) return;
    const { count, error } = await supabaseClient
        .from('solicitacoes_senha')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente');
    if (error) { console.warn('Pedidos de senha:', error.message); return; }
    const n = count || 0;

    const btnMenu = document.querySelector('.btn-menu');
    if (btnMenu) {
        let badge = btnMenu.querySelector('.badge-pedidos-senha');
        if (n > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge-pedidos-senha';
                btnMenu.appendChild(badge);
            }
            badge.textContent = n > 9 ? '9+' : String(n);
            btnMenu.title = `Menu — ${n} pedido(s) de redefinição de senha`;
        } else if (badge) {
            badge.remove();
            btnMenu.title = 'Menu';
        }
    }

    const secao = document.querySelector('.navbar-dropdown-section.link-usuarios');
    if (secao) {
        let item = secao.querySelector('.item-pedidos-senha');
        if (n > 0) {
            if (!item) {
                item = document.createElement('a');
                item.href = 'usuarios';
                item.className = 'navbar-dropdown-item item-admin item-pedidos-senha';
                secao.appendChild(item);
            }
            item.innerHTML = `<i class="fas fa-key"></i> Pedidos de senha <span class="badge-pedidos-senha-item">${n}</span>`;
        } else if (item) {
            item.remove();
        }
    }
}

/**
 * Troca obrigatória da senha temporária (06/10/2026 — item 9 do SEBRAE).
 * A senha definida pelo admin (redefinição ou usuário novo) só vale para o
 * primeiro acesso: esta janela bloqueia a página até o usuário criar a dele.
 * A validação é do servidor (RPC trocar_senha_temporaria: mínimo 8, diferente
 * da temporária). Idempotente: a página de usuários verifica o login 2 vezes.
 */
function mostrarTrocaSenhaObrigatoria(perfil) {
    if (document.getElementById('troca-senha-obrigatoria')) return;

    const overlay = document.createElement('div');
    overlay.id = 'troca-senha-obrigatoria';
    overlay.className = 'troca-senha-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'troca-senha-titulo');
    overlay.innerHTML = `
        <form class="troca-senha-card" id="form-troca-senha" novalidate>
            <div class="troca-senha-header">
                <h3 id="troca-senha-titulo"><i class="fas fa-key"></i> Crie sua nova senha</h3>
            </div>
            <div class="troca-senha-body">
                <p class="troca-senha-intro">
                    Você entrou com uma <strong>senha temporária</strong> definida pelo administrador.
                    Para continuar, crie a sua senha pessoal.
                </p>
                <div class="troca-senha-campo">
                    <label for="troca-senha-nova">Nova senha <small>(mínimo 8 caracteres)</small></label>
                    <input type="password" id="troca-senha-nova" autocomplete="new-password" minlength="8" required>
                </div>
                <div class="troca-senha-campo">
                    <label for="troca-senha-confirmar">Confirmar nova senha</label>
                    <input type="password" id="troca-senha-confirmar" autocomplete="new-password" minlength="8" required>
                </div>
                <div class="troca-senha-erro" id="troca-senha-erro" hidden></div>
                <div class="troca-senha-acoes">
                    <button type="button" class="troca-senha-sair" id="troca-senha-sair">
                        <i class="fas fa-sign-out-alt"></i> Sair
                    </button>
                    <button type="submit" class="troca-senha-salvar" id="troca-senha-salvar">
                        <i class="fas fa-check"></i> Salvar nova senha
                    </button>
                </div>
            </div>
        </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add('troca-senha-ativa');

    const erro = overlay.querySelector('#troca-senha-erro');
    const mostrarErro = msg => { erro.textContent = msg; erro.hidden = !msg; };

    overlay.querySelector('#troca-senha-sair').addEventListener('click', () => fazerLogout());
    overlay.querySelector('#form-troca-senha').addEventListener('submit', async e => {
        e.preventDefault();
        const nova = overlay.querySelector('#troca-senha-nova').value;
        const confirmar = overlay.querySelector('#troca-senha-confirmar').value;
        if (nova.length < 8) return mostrarErro('A nova senha deve ter no mínimo 8 caracteres.');
        if (nova !== confirmar) return mostrarErro('A confirmação não confere com a nova senha.');

        const btn = overlay.querySelector('#troca-senha-salvar');
        btn.disabled = true;
        mostrarErro('');
        const { error } = await supabaseClient.rpc('trocar_senha_temporaria', { p_nova_senha: nova });
        btn.disabled = false;
        if (error) return mostrarErro(error.message || 'Não foi possível salvar a nova senha. Tente novamente.');

        if (perfil) perfil.senha_temporaria = false;
        overlay.remove();
        document.body.classList.remove('troca-senha-ativa');
    });

    // A janela não fecha por Esc nem por clique fora: é obrigatória
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); }, true);
    setTimeout(() => overlay.querySelector('#troca-senha-nova')?.focus(), 50);
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
