// Log do sistema (logs_sistema): só quando havia pedido real. Descrição vazia = a RPC não grava nada.
const r = $('Reivindica pedido').first().json || {};
const resumo = $('Resumo').first().json || {};
if (r.error || !r.enviar) {
  return [{ json: { p_acao: 'whatsapp_aviso_pedido_senha', p_descricao: '' } }];
}
const u = r.usuario || {};
let nomes = [];
try { nomes = $('Monta mensagens').all().filter(i => i.json.enviar).map(i => i.json.gestor); } catch (e) { /* sem gestor */ }
const descricao = resumo.avisados > 0
  ? `Aviso do "Esqueci minha senha" de ${u.nome} enviado pelo WhatsApp a ${resumo.avisados} gestor(es) de senhas: ${nomes.join(', ')}`
  : `Pedido de senha de ${u.nome}: nenhum gestor de senhas recebeu o aviso pelo WhatsApp (sem número cadastrado ou falha no envio)`;
return [{ json: {
  p_acao: 'whatsapp_aviso_pedido_senha',
  p_descricao: descricao,
  p_usuario_id: null,
  p_entidade: 'perfis_usuarios',
  p_entidade_id: u.id || null,
  p_dados: { usuario: u.nome, email: u.email, avisados: resumo.avisados, gestores: nomes }
} }];
