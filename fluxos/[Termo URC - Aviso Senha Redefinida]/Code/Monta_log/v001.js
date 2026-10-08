// Log do sistema (logs_sistema). NUNCA inclui a senha. Sem redefinição confirmada: descrição vazia (a RPC não grava).
const r = $('Valida redefinicao').first().json || {};
const resumo = $('Resumo').first().json || {};
if (r.error || !r.usuario) {
  return [{ json: { p_acao: 'whatsapp_senha_temporaria', p_descricao: '' } }];
}
const u = r.usuario;
const partes = [resumo.usuario_avisado
  ? `senha temporária enviada ao WhatsApp de ${u.nome}`
  : `${u.nome} não recebeu a senha pelo WhatsApp (sem número cadastrado ou falha no envio)`];
if (resumo.gestores_avisados > 0) partes.push(`${resumo.gestores_avisados} gestor(es) de senhas avisado(s)`);
return [{ json: {
  p_acao: 'whatsapp_senha_temporaria',
  p_descricao: 'Redefinição de senha: ' + partes.join('; '),
  p_usuario_id: (r.gestor && r.gestor.id) || null,
  p_entidade: 'perfis_usuarios',
  p_entidade_id: u.id || null,
  p_dados: { usuario: u.nome, email: u.email, usuario_avisado: !!resumo.usuario_avisado, gestores_avisados: resumo.gestores_avisados || 0 }
} }];
