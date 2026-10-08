// Normaliza a resposta das duas entradas do fluxo (só uma roda por execução):
//  - agendada: RPC n8n_relatorio_logs_agendado (credencial Acto) → objeto direto;
//  - manual ("Enviar agora" da tela): RPC relatorio_logs_manual com o token do
//    Administrador SEBRAE, resposta completa { statusCode, body }.
const j = $input.first().json || {};
let d;
if (j.statusCode !== undefined) {
  d = j.statusCode === 200 && j.body
    ? j.body
    : { executar: false, modo: 'manual', motivo: (j.body && j.body.message) || 'acesso negado' };
} else if (j.error) {
  d = { executar: false, modo: 'agendado', motivo: 'falha ao consultar o banco: ' + (j.error.message || JSON.stringify(j.error)) };
} else {
  d = j;
}
return [{ json: { ...d, modo: d.modo || 'agendado', executar: d.executar === true } }];
