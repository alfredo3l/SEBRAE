// Chega aqui pelo If (não executar) OU depois dos envios — só um roda por execução.
// Monta o registro do envio (RPC n8n_registrar_envio_relatorio: com p_modo nulo
// nada é gravado) e a resposta do "Enviar agora" da tela.
const d = $('Prepara dados').first().json;
const dest = Array.isArray(d.destinatarios) ? d.destinatarios : [];
let saidas = [];
try { saidas = $('Envia PDF').all().map(i => i.json); } catch (e) { /* não executado */ }
const executou = d.executar === true;
const enviados = saidas.filter(s => s && !s.error).length;
const total = (d.totais && d.totais.eventos) || 0;

return [{ json: {
  p_modo: executou ? d.modo : null,
  p_periodo_inicio: executou ? d.periodo_inicio : null,
  p_periodo_fim: executou ? d.periodo_fim : null,
  p_total_eventos: total,
  p_destinatarios: dest.length,
  p_enviados: enviados,
  p_detalhes: {
    destinatarios: dest.map((x, i) => ({ nome: x.nome, whatsapp: x.whatsapp, enviado: !!(saidas[i] && !saidas[i].error) }))
  },
  resposta: {
    ok: true, modo: d.modo, executou, enviados, destinatarios: dest.length,
    total_eventos: total, motivo: d.motivo || null
  }
} }];
