// ============================================
// TERMOS URC - MONTA A MENSAGEM DE TEXTO DO WHATSAPP
//
// Um clique no sistema com N documentos dispara N execucoes deste fluxo (uma
// por documento, todas em paralelo). Para o cliente nao receber N textos
// iguais, o sistema marca apenas UMA das chamadas com lote.enviar_texto = true:
// essa execucao envia UMA mensagem listando todos os documentos e seus codigos;
// as demais pulam o texto e mandam so o PDF.
//
// Com um unico documento - ou com um payload antigo, sem o bloco "lote" -
// a mensagem e exatamente a mesma que o fluxo enviava antes.
//
// Acrescenta ao item: { mensagem_texto, enviar_texto, total_lote }
// ============================================

const body = $('Webhook').first().json.body || {};
const dados = $('seta_Dados').first().json || {};
const lote = body.lote || {};

/**
 * "ALFREDO ANTONIO DE OLIVEIRA" -> "Alfredo".
 * Vira funcao (antes era expressao inline no "Enviar texto") para nao estourar
 * com nome nulo nem produzir "Ola, !" com nome vazio.
 */
function primeiroNome(nomeCompleto) {
    const bruto = String(nomeCompleto || '').trim();
    if (!bruto) return '';
    const parte = bruto.split(/\s+/)[0];
    if (parte.length < 2) return '';   // inicial solta nao vira tratamento
    return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
}

const nome = primeiroNome(dados.Nome);
const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';

// Documentos do lote: so entram itens com nome; o codigo vai em maiuscula
const documentos = (Array.isArray(lote.documentos) ? lote.documentos : [])
    .filter(d => d && d.nome)
    .map(d => ({
        nome: String(d.nome).trim(),
        codigo: String(d.codigo || '').trim().toUpperCase()
    }));

// Sem o bloco "lote" (payload antigo), esta execucao e a unica: manda o texto
const enviarTexto = (lote.enviar_texto === undefined) ? true : (lote.enviar_texto === true);

let mensagem;

if (documentos.length > 1) {
    // ----- Lote com 2 ou mais documentos: uma mensagem so -----
    // Um bloco por documento, mantendo o padrao visual da mensagem individual
    const blocos = documentos
        .map(d => `📄 *${d.nome}*\n✅ *1${d.codigo}* - Aceito    ❌ *2${d.codigo}* - Não aceito`)
        .join('\n\n');

    mensagem =
        `${saudacao}\n\n` +
        `Para dar continuidade ao seu atendimento no SEBRAE/MS, é necessária a leitura e o aceite de ` +
        `*${documentos.length} documentos*. Eles serão enviados a seguir para sua leitura.\n\n` +
        `Após ler cada documento, responda com o código dele:\n\n` +
        `${blocos}\n\n` +
        `O código identifica o documento e deve ser informado na resposta.`;

} else {
    // ----- Documento unico (ou payload sem lote): mensagem de sempre -----
    // Prefere o dado do lote; sem ele, usa o que o seta_Dados ja preenchia
    const nomeDocumento = (documentos[0] && documentos[0].nome) || dados.NomeDocumento || 'Termo de Consentimento (LGPD)';
    const codigo = (documentos[0] && documentos[0].codigo) || String(dados.CodigoResposta || '').trim().toUpperCase();

    mensagem =
        `${saudacao}\n\n` +
        `Para dar continuidade ao seu atendimento no SEBRAE/MS, é necessária a leitura e o aceite do documento ` +
        `*${nomeDocumento}*.\n\n` +
        `📄 O documento será enviado a seguir para sua leitura.\n\n` +
        `Após a leitura, responda com:\n\n` +
        `✅ *1${codigo}* - Aceito\n` +
        `❌ *2${codigo}* - Não aceito\n\n` +
        `O código *${codigo}* identifica este documento e deve ser informado na resposta.`;
}

// Acrescenta ao item que veio do "If" (linha do parceiro) sem descarta-lo:
// preserva o pareamento e os dados que os nos seguintes possam usar
const item = $input.first();
item.json = {
    ...item.json,
    mensagem_texto: mensagem,
    enviar_texto: enviarTexto,
    total_lote: documentos.length || 1
};

return [item];
