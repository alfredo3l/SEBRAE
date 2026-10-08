// Monta o texto final com o rodapé do administrador. Se o banco recusou,
// devolve { enviar: false, motivo } com a mensagem de erro do banco.
const r = $input.first().json || {};
const status = Number(r.statusCode || 0);
const body = r.body || {};
if (r.error || status !== 200 || !body.id) {
  const motivo = (body && body.message) || (r.error && r.error.message) || 'não foi possível preparar a mensagem';
  return [{ json: { enviar: false, motivo } }];
}
const rem = body.remetente || {};
const dest = body.destinatario || {};
const primeiroNome = String(rem.nome || '').trim().split(/\s+/)[0] || 'o administrador';
return [{ json: {
  enviar: true,
  id: body.id,
  remote_jid: String(dest.remote_jid || '').replace(/\D/g, ''),
  mensagem:
    `Olá, ${dest.nome}!\n\n` +
    `${body.texto}\n\n` +
    `— *${rem.nome}*, administrador do TERMOS URC\n` +
    `WhatsApp: ${rem.whatsapp}\n\n` +
    `_Esta mensagem foi enviada pelo sistema. Para responder, fale diretamente com ${primeiroNome} pelo WhatsApp acima._`
} }];
