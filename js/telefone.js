// ============================================================
// Telefone e WhatsApp — utilitários compartilhados (08/10/2026)
// ============================================================
// Movidos de js/app.js (formato/máscara) e js/documentos.js (verificação do
// WhatsApp) para servirem também à Gestão de Usuários e ao Meu Perfil, que não
// carregam aqueles arquivos. Carregado em todas as páginas logadas, depois de
// datas.js. Código sem alteração.

/**
 * Formato padrão do telefone no sistema — o MESMO em parceiros, nos formulários
 * dos termos, no payload do n8n e no Phone do FOCO:
 *   celular (11 dígitos): (67)99245-1961
 *   fixo    (10 dígitos): (67)3389-5349   ← fixo pode ter WhatsApp Business
 * Só os dígitos importam; qualquer outra quantidade volta como veio.
 */
function formatarTelefoneParaCadastro(tel) {
    if (!tel) return '';
    const nums = String(tel).replace(/\D/g, '');
    if (nums.length === 11) return `(${nums.substring(0, 2)})${nums.substring(2, 7)}-${nums.substring(7)}`;
    if (nums.length === 10) return `(${nums.substring(0, 2)})${nums.substring(2, 6)}-${nums.substring(6)}`;
    return tel;
}

/** Só os dígitos do telefone (para comparar números escritos de formas diferentes) */
function digitosTelefone(tel) {
    return String(tel || '').replace(/\D/g, '');
}

/** Telefone utilizável: 10 (fixo) ou 11 (celular) dígitos */
function telefoneValido(tel) {
    const n = digitosTelefone(tel).length;
    return n === 10 || n === 11;
}

/**
 * Máscara de Telefone: (00)0000-0000 enquanto há até 10 dígitos (fixo),
 * (00)00000-0000 ao chegar no 11º (celular). Antes o hífen era fixo após o
 * 5º dígito e um fixo saía como (67)33214-567.
 */
function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/, '($1)$2');
    v = v.length <= 12   // "(67)" + até 8 dígitos = fixo; o 9º dígito muda para o corte do celular
        ? v.replace(/^(\(\d{2}\)\d{4})(\d)/, '$1-$2')
        : v.replace(/^(\(\d{2}\)\d{5})(\d)/, '$1-$2');
    input.value = v;
}

// Webhook que pergunta à Evolution API se o telefone tem WhatsApp e qual é o
// JID real (fluxo [Termo URC - Verifica WhatsApp]). Não envia nada ao cliente.
const WEBHOOK_VERIFICA_WHATSAPP = 'https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-VERIFICA';

/**
 * Consulta o webhook de verificação. Nunca lança: falha de rede ou do serviço
 * volta como { ok: false, exists: null } — o envio não é bloqueado nesse caso,
 * só avisado (a Evolution é a mesma que faria o envio; se ela está fora, o
 * consultor precisa saber, mas não pode ficar preso por uma verificação).
 */
async function verificarWhatsApp(telefone) {
    const base = { telefone, ok: false, exists: null, whatsapp: null, jid: null, motivo: null };
    try {
        const resp = await fetch(WEBHOOK_VERIFICA_WHATSAPP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone })
        });
        if (!resp.ok) {
            return { ...base, motivo: `serviço de verificação respondeu ${resp.status}` };
        }
        const r = await resp.json();
        return {
            ...base,
            ok: r.ok !== false,
            exists: typeof r.exists === 'boolean' ? r.exists : null,
            whatsapp: r.whatsapp || null,
            jid: r.jid || null,
            motivo: r.motivo || null
        };
    } catch (e) {
        return { ...base, motivo: e?.message || 'erro de conexão' };
    }
}

