// Resposta única para o front: { ok, exists, jid, whatsapp, motivo }.
// Chega aqui por dois caminhos: telefone inválido (direto do If) ou a
// resposta da Evolution (via Consulta Evolution) — só um deles roda por execução.
const entrada = $('Normaliza telefone').first().json;
const base = { ok: true, telefone: entrada.telefone, numero: entrada.numero, exists: false, jid: null, whatsapp: null, motivo: null };

if (!entrada.valido) {
  return [{ json: { ...base, motivo: entrada.motivo } }];
}

const itens = $input.all().map(i => i.json);
const comErro = itens.find(i => i && i.error);
if (comErro) {
  const e = comErro.error;
  const msg = (e && (e.message || e.description)) || JSON.stringify(e);
  return [{ json: { ...base, ok: false, exists: null, motivo: 'falha ao consultar a Evolution API: ' + msg } }];
}

// A Evolution devolve um array com um item por número consultado
const r = itens[0] || {};
const exists = r.exists === true;
const jid = exists ? (r.jid || (String(r.number || entrada.numero) + '@s.whatsapp.net')) : null;

return [{ json: {
  ...base,
  exists,
  jid,
  whatsapp: jid ? jid.split('@')[0] : null,
  motivo: exists ? null : 'número sem WhatsApp'
} }];
