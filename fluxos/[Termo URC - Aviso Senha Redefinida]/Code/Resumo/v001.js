// Chega aqui pelo If (sem mensagem) OU pelo envio — só um roda por execução.
// A saída do envio vem na mesma ordem dos itens de 'Monta mensagens'.
const base = $('Monta mensagens').all().map(i => i.json);
let saidas = [];
try { saidas = $('Envia mensagens').all().map(i => i.json); } catch (e) { /* não executado */ }
let usuario_avisado = false, gestores_avisados = 0;
saidas.forEach((s, i) => {
  if (!s || s.error) return;
  if (base[i]?.tipo === 'usuario') usuario_avisado = true;
  else if (base[i]?.tipo === 'gestor') gestores_avisados++;
});
return [{ json: { ok: true, usuario_avisado, gestores_avisados, motivo: base[0]?.enviar ? null : (base[0]?.motivo || null) } }];
