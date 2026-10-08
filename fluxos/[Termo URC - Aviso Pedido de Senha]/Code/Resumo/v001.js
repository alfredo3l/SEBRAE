// Chega aqui pelo If (sem mensagem) OU pelo envio — só um roda por execução.
const base = $('Monta mensagens').all().map(i => i.json);
let avisados = 0;
try {
  avisados = $('Envia aos gestores').all().filter(i => i.json && !i.json.error).length;
} catch (e) { /* envio não executado */ }
return [{ json: { ok: true, avisados, motivo: base[0]?.enviar ? null : (base[0]?.motivo || null) } }];
