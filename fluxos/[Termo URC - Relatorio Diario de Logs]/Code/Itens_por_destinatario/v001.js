// Um item por destinatário ativo: mensagem de apresentação + o mesmo PDF.
const d = $('Prepara dados').first().json;
const doc = $('Monta HTML').first().json;
const pdf = $('PDF base64').first().json.data;
const t = d.totais || {};

const resumo = t.eventos > 0
  ? `${Number(t.eventos).toLocaleString('pt-BR')} evento(s) registrado(s) por ${Number(t.usuarios || 0).toLocaleString('pt-BR')} usuário(s).`
  : 'Nenhuma atividade registrada no período.';

return (d.destinatarios || []).map(x => ({ json: {
  nome: x.nome,
  remote_jid: String(x.remote_jid || '').replace(/\D/g, ''),
  arquivo: doc.arquivo + '.pdf',
  pdf,
  mensagem:
    `Olá, ${x.nome}!\n\n` +
    `📄 *${doc.titulo} — TERMOS URC*\n` +
    `Período: ${doc.periodo}\n` +
    `${resumo}\n\n` +
    `O relatório completo segue em PDF.`
} }));
