// ============================================
// TERMOS URC - IDENTIFICA A QUAL DOCUMENTO A RESPOSTA SE REFERE
// Entrada: itens da view vw_documentos_pendentes + evento do WhatsApp.
// Saída: { acao, dados do documento, mensagem_orientacao } para o Switch.
//
// Trata: texto, áudio, mídia, emoji, reação, botões, mensagem do próprio bot,
// teclado esbarrado e texto aleatório - sempre orientando o cliente em
// linguagem clara e institucional.
// ============================================

const body = $('Webhook').first().json.body || {};
const evento = body.data || {};
const chave = evento.key || {};
const msg = evento.message || {};
const tipoMensagem = evento.messageType || '';

// ---------- Telefone do remetente (só dígitos) ----------
const jid1 = chave.remoteJid || '';
const jid2 = chave.remoteJidAlt || '';
const raw = jid1.endsWith('@s.whatsapp.net') ? jid1
          : (jid2.endsWith('@s.whatsapp.net') ? jid2 : '');

let telefoneDigitos = raw.replace('@s.whatsapp.net', '').replace(/\D/g, '').replace(/^55/, '');
if (telefoneDigitos.length === 10) {
  telefoneDigitos = telefoneDigitos.slice(0, 2) + '9' + telefoneDigitos.slice(2); // 9º dígito
}

// ---------- Texto da resposta (cobrindo os formatos do WhatsApp) ----------
const texto = (
  msg.conversation ||
  msg.extendedTextMessage?.text ||
  msg.imageMessage?.caption ||
  msg.videoMessage?.caption ||
  msg.documentMessage?.caption ||
  msg.buttonsResponseMessage?.selectedDisplayText ||
  msg.buttonsResponseMessage?.selectedButtonId ||
  msg.templateButtonReplyMessage?.selectedDisplayText ||
  msg.listResponseMessage?.title ||
  msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
  ''
).trim();

const messageId = chave.id || '';

// ---------- Documentos aguardando resposta ----------
const pendentes = $input.all()
  .map(i => i.json)
  .filter(j => j && j.documento_id);

// ---------- Tratamento do nome do cliente ----------
function primeiroNome(nomeCompleto) {
  const bruto = String(nomeCompleto || evento.pushName || '').trim();
  if (!bruto) return '';
  const parte = bruto.split(/\s+/)[0];
  if (parte.length < 2) return '';
  return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
}

const nomeCliente = primeiroNome(pendentes[0]?.nome_razao_social);
const tratamento = nomeCliente ? `Olá, ${nomeCliente},` : 'Olá,';

// ---------- Interpretação da resposta ----------
const limpo = texto.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');

let intencao = null; // 'aceite' | 'recusa'
let codigo = null;   // letra do documento

const mNum      = limpo.match(/^([12])([A-Z])?$/);   // 1 / 2 / 1A / 2B
const mLetraNum = limpo.match(/^([A-Z])([12])$/);    // A1 / B2
const mPalavra  = limpo.match(/^(ACEITO|ACEITAR|ACEITE|SIM|CONCORDO|NAOACEITO|NAOACEITAR|NAO|RECUSO|RECUSAR|RECUSADO|DISCORDO)([A-Z])?$/);

if (mNum) {
  intencao = mNum[1] === '1' ? 'aceite' : 'recusa';
  codigo   = mNum[2] || null;
} else if (mLetraNum) {
  intencao = mLetraNum[2] === '1' ? 'aceite' : 'recusa';
  codigo   = mLetraNum[1];
} else if (mPalavra) {
  const p = mPalavra[1];
  intencao = ['ACEITO', 'ACEITAR', 'ACEITE', 'SIM', 'CONCORDO'].includes(p) ? 'aceite' : 'recusa';
  codigo   = mPalavra[2] || null;
}

// ---------- Classificação do tipo de mensagem ----------
const ehAudio = /audio|ptt/i.test(tipoMensagem) || !!msg.audioMessage;
const ehMidia = /image|video|sticker|document|contact|location/i.test(tipoMensagem)
             || !!(msg.imageMessage || msg.videoMessage || msg.stickerMessage || msg.documentMessage);
const ehReacao = /reaction/i.test(tipoMensagem) || !!msg.reactionMessage;

// ---------- Decisão ----------
let acao;
let documento = null;
let motivo = null;

if (chave.fromMe === true) {
  acao = 'ignorar';                    // mensagem enviada pelo próprio SEBRAE
} else if (ehReacao) {
  acao = 'ignorar';                    // reação não é resposta
} else if (pendentes.length === 0) {
  acao = 'ignorar';                    // nada aguardando resposta
} else if (ehAudio) {
  acao = 'orientar'; motivo = 'audio';
} else if (ehMidia && !texto) {
  acao = 'orientar'; motivo = 'midia';
} else if (!intencao) {
  acao = 'orientar'; motivo = 'nao_entendi';
} else if (codigo) {
  documento = pendentes.find(p => String(p.codigo_resposta || '').toUpperCase() === codigo) || null;
  if (documento) { acao = intencao; } else { acao = 'orientar'; motivo = 'codigo_invalido'; }
} else if (pendentes.length === 1) {
  documento = pendentes[0];            // sem letra, mas só há um: sem ambiguidade
  acao = intencao;
} else {
  acao = 'orientar'; motivo = 'falta_codigo';
}

// ---------- Mensagem de orientação (institucional) ----------
// Emojis apenas com função de marcação (documento, aceite, recusa, atenção).
const lista = pendentes
  .map(p => `📄 *${p.codigo_resposta}* - ${p.nome_documento}`)
  .join('\n');

const primeiraLetra = pendentes[0]?.codigo_resposta || 'A';
const umSo = pendentes.length === 1;

const cabecalhoLista = umSo
  ? 'Documento aguardando sua resposta:'
  : `Documentos aguardando sua resposta (${pendentes.length}):`;

const comoResponder = umSo
  ? `Para responder, informe:\n\n✅ *1${primeiraLetra}* - Aceito\n❌ *2${primeiraLetra}* - Não aceito`
  : `Para responder, informe o número e a letra correspondente ao documento. Exemplo:\n\n✅ *1${primeiraLetra}* - Aceito o documento ${primeiraLetra}\n❌ *2${primeiraLetra}* - Não aceito o documento ${primeiraLetra}`;

let situacao;
switch (motivo) {
  case 'audio':
    situacao = '⚠️ Recebemos sua mensagem de áudio. Para o registro do aceite, a resposta precisa ser enviada por texto.';
    break;
  case 'midia':
    situacao = '⚠️ Recebemos seu arquivo. Para o registro do aceite, a resposta precisa ser enviada por texto.';
    break;
  case 'codigo_invalido':
    situacao = `⚠️ Não localizamos nenhum documento identificado pela letra *${codigo}*.`;
    break;
  case 'falta_codigo':
    situacao = intencao === 'aceite'
      ? '⚠️ Identificamos sua intenção de aceitar, porém é necessário informar a qual documento ela se refere.'
      : '⚠️ Identificamos sua intenção de não aceitar, porém é necessário informar a qual documento ela se refere.';
    break;
  default:
    situacao = '⚠️ Não foi possível identificar sua resposta.';
}

const mensagemOrientacao =
  `${tratamento}\n\n${situacao}\n\n${cabecalhoLista}\n\n${lista}\n\n${comoResponder}`;

const referencia = documento || pendentes[0] || {};

return [{
  json: {
    acao: acao,
    motivo: motivo,
    intencao: intencao,
    codigo_informado: codigo,
    texto_resposta: texto || `[${tipoMensagem || 'mensagem sem texto'}]`,
    tipo_mensagem: tipoMensagem,
    message_id: messageId,
    telefone_digitos: telefoneDigitos,
    quantidade_pendentes: pendentes.length,
    lista_pendentes: lista,
    mensagem_orientacao: mensagemOrientacao,
    primeiro_nome: nomeCliente,
    tratamento: tratamento,

    // Documento identificado (nulo quando não houver)
    documento_id: documento?.documento_id || null,
    tipo_documento: documento?.tipo_documento || null,
    nome_documento: documento?.nome_documento || null,
    codigo_resposta: documento?.codigo_resposta || null,
    html_documento: documento?.html_documento || null,
    case_id_salesforce: documento?.case_id_salesforce || null,
    e_lgpd: documento?.tipo_documento === 'termo-lgpd',

    // Dados do cliente
    parceiro_id: referencia.parceiro_id || null,
    cpf: referencia.cpf || null,
    nome: referencia.nome_razao_social || null,
    telefone: referencia.telefone || null,
    id_salesforce: referencia.id_salesforce || null,
    id_contato_salesforce: referencia.id_contato_salesforce || null
  }
}];
