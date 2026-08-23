// ============================================
// TERMOS URC - IDENTIFICA A QUAL DOCUMENTO A RESPOSTA SE REFERE
// Entrada: itens da view vw_documentos_pendentes (documentos aguardando
// resposta do telefone que respondeu) + a mensagem do WhatsApp.
// Saída: { acao, documento..., lista_pendentes } para o Switch.
// ============================================

const body = $('Webhook').first().json.body || {};
const evento = body.data || {};

// ---------- Telefone do remetente (mesma normalização do cadastro) ----------
const jid1 = evento.key?.remoteJid || '';
const jid2 = evento.key?.remoteJidAlt || '';
const raw = jid1.endsWith('@s.whatsapp.net') ? jid1
          : (jid2.endsWith('@s.whatsapp.net') ? jid2 : '');

let num = raw.replace('@s.whatsapp.net', '').replace(/^55/, '');
if (num.length === 10) num = num.slice(0, 2) + '9' + num.slice(2); // 9º dígito
const telefone = num.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1)$2-$3');

// ---------- Texto da resposta ----------
const texto = (
  evento.message?.conversation ||
  evento.message?.extendedTextMessage?.text ||
  ''
).trim();

const messageId = evento.key?.id || '';

// ---------- Documentos pendentes (view) ----------
const pendentes = $input.all()
  .map(i => i.json)
  .filter(j => j && j.documento_id);

// ---------- Interpretação: "1A", "1 A", "A1", "aceito A", "1", "2" ----------
const t = texto.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');

let intencao = null; // 'aceite' | 'recusa'
let codigo = null;   // letra do documento (A, B, C...)

const mNum      = t.match(/^([12])([A-Z])?$/);            // 1 / 2 / 1A / 2B
const mLetraNum = t.match(/^([A-Z])([12])$/);             // A1 / B2
const mPalavra  = t.match(/^(ACEITO|ACEITAR|SIM|NAOACEITO|NAOACEITAR|NAO|RECUSO|RECUSAR|RECUSADO)([A-Z])?$/);

if (mNum) {
  intencao = mNum[1] === '1' ? 'aceite' : 'recusa';
  codigo   = mNum[2] || null;
} else if (mLetraNum) {
  intencao = mLetraNum[2] === '1' ? 'aceite' : 'recusa';
  codigo   = mLetraNum[1];
} else if (mPalavra) {
  const palavra = mPalavra[1];
  intencao = (palavra === 'ACEITO' || palavra === 'ACEITAR' || palavra === 'SIM') ? 'aceite' : 'recusa';
  codigo   = mPalavra[2] || null;
}

// ---------- Decisão ----------
let acao;
let documento = null;

if (pendentes.length === 0) {
  acao = 'sem_pendentes';                 // nada aguardando resposta
} else if (!intencao) {
  acao = 'invalido';                      // texto não reconhecido
} else if (codigo) {
  documento = pendentes.find(p => String(p.codigo_resposta || '').toUpperCase() === codigo) || null;
  acao = documento ? intencao : 'codigo_invalido';
} else if (pendentes.length === 1) {
  documento = pendentes[0];               // sem código, mas só há um: sem ambiguidade
  acao = intencao;
} else {
  acao = 'ambiguo';                       // vários pendentes e nenhum código
}

// ---------- Lista para a mensagem de desambiguação ----------
const listaPendentes = pendentes
  .map(p => `*${p.codigo_resposta}* - ${p.nome_documento}`)
  .join('\n');

const referencia = documento || pendentes[0] || {};

return [{
  json: {
    acao: acao,
    intencao: intencao,
    codigo_informado: codigo,
    texto_resposta: texto,
    message_id: messageId,
    telefone_whatsapp: telefone,
    quantidade_pendentes: pendentes.length,
    lista_pendentes: listaPendentes,

    // Documento identificado (nulo quando ambíguo/sem pendentes)
    documento_id: documento?.documento_id || null,
    tipo_documento: documento?.tipo_documento || null,
    nome_documento: documento?.nome_documento || null,
    codigo_resposta: documento?.codigo_resposta || null,
    html_documento: documento?.html_documento || null,
    case_id_salesforce: documento?.case_id_salesforce || null,
    e_lgpd: documento?.tipo_documento === 'termo-lgpd',

    // Dados do cliente (do documento ou do primeiro pendente)
    parceiro_id: referencia.parceiro_id || null,
    cpf: referencia.cpf || null,
    nome: referencia.nome_razao_social || null,
    telefone: referencia.telefone || telefone,
    id_salesforce: referencia.id_salesforce || null,
    id_contato_salesforce: referencia.id_contato_salesforce || null
  }
}];
