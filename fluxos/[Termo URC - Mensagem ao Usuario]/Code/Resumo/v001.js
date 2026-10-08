// Chega aqui pelo If (recusado) OU depois do envio — só um roda por execução.
const m = $('Monta mensagem').first().json;
if (!m.enviar) return [{ json: { ok: true, enviado: false, motivo: m.motivo } }];
let envio = null;
try { envio = $('Envia mensagem').first().json; } catch (e) { /* não executado */ }
const enviado = !!envio && !envio.error;
return [{ json: { ok: true, enviado, motivo: enviado ? null : 'falha ao enviar pelo WhatsApp' } }];
