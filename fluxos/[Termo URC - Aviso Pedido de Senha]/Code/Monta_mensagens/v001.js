// Uma mensagem por gestor de senhas com WhatsApp. Sempre devolve ao menos
// 1 item: sem mensagem a enviar, sai { enviar: false } (o If desvia direto
// para a resposta ao front).
const r = $input.first().json || {};
if (r.error || !r.enviar) {
  return [{ json: { enviar: false, motivo: r.error ? 'falha ao consultar o banco' : (r.motivo || 'sem pedido novo') } }];
}
const u = r.usuario || {};
const gestores = Array.isArray(r.gestores) ? r.gestores : [];
if (!gestores.length) {
  return [{ json: { enviar: false, motivo: 'nenhum gestor de senhas com WhatsApp' } }];
}
return gestores.map(g => ({ json: {
  enviar: true,
  remote_jid: String(g.remote_jid || '').replace(/\D/g, ''),
  gestor: g.nome,
  mensagem:
    `Olá, ${g.nome}!\n\n` +
    `⚠️ *Pedido de redefinição de senha — TERMOS URC*\n\n` +
    `*${u.nome || u.email}* (${u.email}) informou que esqueceu a senha de acesso ao sistema.\n\n` +
    `Para atender, acesse *Gestão de Usuários* no TERMOS URC, abra o usuário e use *Redefinir senha* para definir uma senha temporária.\n\n` +
    `https://sebrae-seven.vercel.app/usuarios`
} }));
