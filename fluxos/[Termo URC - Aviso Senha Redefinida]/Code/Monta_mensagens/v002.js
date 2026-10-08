// Mensagem ao usuário (com a senha temporária) + aviso aos demais gestores.
// Sempre devolve ao menos 1 item: sem mensagem, sai { enviar: false }.
const r = $input.first().json || {};
if (r.error || !r.usuario) {
  return [{ json: { enviar: false, motivo: 'redefinição não confirmada pelo banco' } }];
}
const senha = String($('Webhook').first().json.body?.senha || '');
const u = r.usuario;
const gestor = r.gestor?.nome || 'um administrador';
const itens = [];
if (u.remote_jid) {
  itens.push({ json: {
    enviar: true, tipo: 'usuario', remote_jid: String(u.remote_jid).replace(/\D/g, ''),
    mensagem:
      `Olá, ${u.nome}!\n\n` +
      `✅ *Senha redefinida — TERMOS URC*\n\n` +
      `Sua senha de acesso ao TERMOS URC foi redefinida por ${gestor}.\n\n` +
      `Senha temporária: ${'```'}${senha}${'```'}\n\n` +
      `No primeiro acesso, o sistema pedirá que você crie uma nova senha pessoal.`
  } });
}
for (const g of (Array.isArray(r.outros_gestores) ? r.outros_gestores : [])) {
  itens.push({ json: {
    enviar: true, tipo: 'gestor', remote_jid: String(g.remote_jid || '').replace(/\D/g, ''),
    mensagem:
      `Olá, ${g.nome}!\n\n` +
      `✅ *Pedido de senha atendido — TERMOS URC*\n\n` +
      `A senha de *${u.nome}* (${u.email}) foi redefinida por ${gestor}. Não é necessário redefinir novamente.`
  } });
}
return itens.length ? itens : [{ json: { enviar: false, motivo: 'ninguém com WhatsApp cadastrado' } }];
