/* ============================================================
   SEBRAE - Foto de Perfil do Usuário
   ============================================================ */

const AVATAR_BUCKET = 'avatars';

// ============================================================
// ATUALIZA O AVATAR NA NAVBAR
// ============================================================
/**
 * Atualiza o avatar na navbar.
 * bustCache = true apenas após upload de nova foto, para forçar recarga da imagem.
 * bustCache = false (padrão) nas navegações normais, permitindo uso do cache do browser.
 */
function atualizarNavbarAvatar(fotoUrl, bustCache = false) {
    const wrap = document.getElementById('navbar-avatar-wrap');
    if (!wrap || !fotoUrl) return;

    const img = document.createElement('img');
    img.id        = 'navbar-avatar-wrap';
    img.className = 'navbar-avatar';
    img.alt       = 'Avatar';
    img.src       = bustCache ? fotoUrl + '?t=' + Date.now() : fotoUrl;

    img.addEventListener('error', function () {
        const placeholder = document.createElement('div');
        placeholder.id        = 'navbar-avatar-wrap';
        placeholder.className = 'navbar-avatar-placeholder';
        placeholder.innerHTML = '<i class="fas fa-user"></i>';
        if (this.parentNode) this.parentNode.replaceChild(placeholder, this);
    });

    if (wrap.parentNode) wrap.parentNode.replaceChild(img, wrap);
}

// ============================================================
// ABRIR MODAL DE PERFIL
// ============================================================
async function abrirModalPerfil(userId) {
    const modal = document.getElementById('modal-perfil');
    if (!modal) return;

    esconderAlertaPerfil();

    let uid = userId;
    if (!uid) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        uid = session.user.id;
    }

    const { data: perfil } = await supabaseClient
        .from('perfis_usuarios')
        .select('id, email, nome_completo, role, ativo, ultimo_acesso, foto_url')
        .eq('id', uid)
        .single();

    if (!perfil) return;

    // Guarda o id sendo editado no input oculto
    const inputFile = document.getElementById('input-foto-perfil');
    if (inputFile) inputFile.dataset.userId = uid;

    // Preenche dados
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('perfil-nome-display',   perfil.nome_completo || '—');
    setEl('perfil-email-display',  perfil.email || '—');
    setEl('perfil-role-display',   traduzirRole(perfil.role));
    setEl('perfil-acesso-display', perfil.ultimo_acesso
        ? new Date(perfil.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : 'Nunca acessou');

    // Foto
    preencherFotoModal(perfil.foto_url);

    modal.style.display = 'flex';
}

function fecharModalPerfil() {
    const modal = document.getElementById('modal-perfil');
    if (modal) modal.style.display = 'none';
}

// Fecha ao clicar fora
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-perfil');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) fecharModalPerfil();
        });
    }
});

// ============================================================
// PREENCHE A FOTO NO MODAL
// ============================================================
function preencherFotoModal(fotoUrl) {
    const img         = document.getElementById('perfil-foto-img');
    const placeholder = document.getElementById('perfil-foto-placeholder');
    if (!img || !placeholder) return;

    if (fotoUrl) {
        img.src = fotoUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        img.addEventListener('error', function () {
            img.style.display = 'none';
            placeholder.style.display = 'flex';
        }, { once: true });
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
    }
}

// ============================================================
// UPLOAD DA FOTO DE PERFIL
// ============================================================
async function uploadFotoPerfil(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;

    // Validação de tamanho (2 MB)
    if (arquivo.size > 2 * 1024 * 1024) {
        mostrarAlertaPerfil('A imagem deve ter no máximo 2 MB.', 'erro');
        input.value = '';
        return;
    }

    const userId = input.dataset.userId;
    if (!userId) return;

    const ext      = arquivo.name.split('.').pop().toLowerCase();
    const caminho  = `${userId}/avatar.${ext}`;

    mostrarProgressoPerfil(10);
    esconderAlertaPerfil();

    try {
        // Faz upload para o bucket (upsert substitui se já existir)
        const { error: uploadError } = await supabaseClient.storage
            .from(AVATAR_BUCKET)
            .upload(caminho, arquivo, {
                upsert:      true,
                contentType: arquivo.type,
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        mostrarProgressoPerfil(70);

        // Obtém URL pública permanente
        const { data: urlData } = supabaseClient.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(caminho);

        const fotoUrl = urlData.publicUrl;

        mostrarProgressoPerfil(85);

        // Salva a URL no perfil do usuário via função segura (SECURITY DEFINER)
        // que permite ao próprio usuário atualizar apenas o campo foto_url,
        // sem conceder permissão para alterar role ou outros campos sensíveis.
        const { error: updateError } = await supabaseClient
            .rpc('atualizar_foto_url', { nova_url: fotoUrl });

        if (updateError) throw updateError;

        mostrarProgressoPerfil(100);

        // Atualiza a foto no modal e na navbar (se for o próprio usuário)
        preencherFotoModal(fotoUrl);

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user.id === userId) {
            // bustCache=true: força o browser a buscar a imagem recém-enviada
            atualizarNavbarAvatar(fotoUrl, true);
            // Atualiza o cache da navbar com a nova URL
            try { sessionStorage.setItem(_CACHE_FOTO, fotoUrl); } catch (_) { }
        }

        // Atualiza a foto na tabela de usuários (se a função existir)
        if (typeof atualizarFotoNaTabela === 'function') {
            atualizarFotoNaTabela(userId, fotoUrl);
        }

        mostrarAlertaPerfil('Foto atualizada com sucesso!', 'sucesso');

        setTimeout(() => esconderProgressoPerfil(), 600);

    } catch (err) {
        console.error('Erro ao fazer upload da foto:', err);
        esconderProgressoPerfil();
        const msg = err.message?.includes('mime')
            ? 'Formato não suportado. Use JPG, PNG ou WebP.'
            : 'Erro ao enviar a foto. Tente novamente.';
        mostrarAlertaPerfil(msg, 'erro');
    }

    input.value = '';
}

// ============================================================
// PROGRESSO DO UPLOAD
// ============================================================
function mostrarProgressoPerfil(pct) {
    const bar  = document.getElementById('perfil-progress-bar');
    const fill = document.getElementById('perfil-progress-fill');
    if (bar)  bar.style.display  = 'block';
    if (fill) fill.style.width   = pct + '%';
}

function esconderProgressoPerfil() {
    const bar  = document.getElementById('perfil-progress-bar');
    const fill = document.getElementById('perfil-progress-fill');
    if (fill) fill.style.width  = '0%';
    setTimeout(() => { if (bar) bar.style.display = 'none'; }, 300);
}

// ============================================================
// ALERTAS DO MODAL DE PERFIL
// ============================================================
function mostrarAlertaPerfil(msg, tipo) {
    const div  = document.getElementById('perfil-alert');
    const span = document.getElementById('perfil-alert-msg');
    if (!div || !span) return;
    div.className = `perfil-alert ${tipo}`;
    span.textContent = msg;
    if (tipo === 'sucesso') setTimeout(() => esconderAlertaPerfil(), 3000);
}

function esconderAlertaPerfil() {
    const div = document.getElementById('perfil-alert');
    if (div) div.className = 'perfil-alert';
}

// ============================================================
// UTILITÁRIO
// ============================================================
function traduzirRole(role) {
    const mapa = { admin: 'Administrador', operador: 'Operador', visualizador: 'Visualizador' };
    return mapa[role] || role || '—';
}
