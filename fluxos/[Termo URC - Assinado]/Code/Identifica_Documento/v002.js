// ============================================
// TERMOS URC - IDENTIFICA A QUAL DOCUMENTO A RESPOSTA SE REFERE
// Entrada: itens da view vw_documentos_pendentes + evento do WhatsApp.
// Saída: { acao, dados do documento, mensagem_orientacao } para o Switch.
//
// Trata: texto, áudio, mídia, emoji, reação, botões, mensagem do próprio bot,
// teclado esbarrado e qualquer texto aleatório — sempre orientando o cliente
// em linguagem natural.
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

// ---------- Nome do cliente para a saudação ----------
function primeiroNome(nomeCompleto) {
  const bruto = String(nomeCompleto || evento.pushName || '').trim();
  if (!bruto) return '';
  const parte = bruto.split(/\s+/)[0];
  if (parte.length < 2) return '';
  return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
}

const nomeCliente = primeiroNome(pendentes[0]?.nome_razao_social);
const saudacao = nomeCliente ? `Oi, ${nomeCliente}! ` : 'Oi! ';

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
  acao = 'ignorar';                    // curtida/reação não é resposta
} else if (pendentes.length === 0) {
  acao = 'ignorar';                    // nada aguardando: não interromper o cliente
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

// ---------- Mensagem de orientação (linguagem natural) ----------
const lista = pendentes
  .map(p => `*${p.codigo_resposta}* — ${p.nome_documento}`)
  .join('\n');

const primeiraLetra = pendentes[0]?.codigo_resposta || 'A';
const umSo = pendentes.length === 1;

const comoResponder = umSo
  ? `Para responder, é só enviar:\n\n✅ *1${primeiraLetra}* — se você aceita\n❌ *2${primeiraLetra}* — se você não aceita`
  : `Para responder, envie o número e a letra do documento juntos. Por exemplo:\n\n✅ *1${primeiraLetra}* — aceito o documento ${primeiraLetra}\n❌ *2${primeiraLetra}* — não aceito o documento ${primeiraLetra}`;

const cabecalhoLista = umSo
  ? 'Você tem um documento esperando sua resposta:'
  : `Você tem ${pendentes.length} documentos esperando sua resposta:`;

let abertura;
switch (motivo) {
  case 'audio':
    abertura = `${saudacao}Recebi seu áudio, mas por aqui eu consigo ler apenas mensagens de texto. 🙏`;
    break;
  case 'midia':
    abertura = `${saudacao}Recebi seu arquivo, mas preciso que a resposta venha por texto. 🙏`;
    break;
  case 'codigo_invalido':
    abertura = `${saudacao}Não encontrei nenhum documento com a letra *${codigo}*. 🤔`;
    break;
  case 'falta_codigo':
    abertura = intencao === 'aceite'
      ? `${saudacao}Entendi que você quer aceitar, mas preciso saber *qual documento*.`
      : `${saudacao}Entendi que você não quer aceitar, mas preciso saber *qual documento*.`;
    break;
  default:
    abertura = `${saudacao}Não consegui entender sua resposta. 😅`;
}

const mensagemOrientacao = `${abertura}\n\n${cabecalhoLista}\n\n${lista}\n\n${comoResponder}`;

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
