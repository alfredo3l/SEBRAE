/* ============================================
   SEBRAE - Autenticação com Supabase
   ============================================ */

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

    // Atualiza o nome do usuário no header
    const userInfoSpan = document.querySelector('.user-info span');
    if (userInfoSpan && session.user) {
        const nome = session.user.user_metadata?.nome || session.user.email;
        userInfoSpan.textContent = nome;
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
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error('Erro ao fazer logout:', error.message);
    }

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

// Inicialização nas páginas protegidas (index.html e detalhe.html)
document.addEventListener('DOMContentLoaded', function () {
    // Não verificar autenticação na página de login
    if (!window.location.pathname.includes('login')) {
        verificarAutenticacao();
        configurarBotaoSair();
    }
});
