// Normaliza o telefone recebido do front para o formato que a Evolution API
// espera (DDI 55 + DDD + número, só dígitos). Não tenta adivinhar o 9 do
// celular: quem resolve o JID real é a própria Evolution.
const body = $('Webhook').first().json.body || {};
const bruto = String(body.telefone || '');
const d = bruto.replace(/\D/g, '');

let numero = null;
let motivo = null;

// Testa o tamanho ANTES do prefixo: um número de 10/11 dígitos que comece
// com 55 é DDD 55 (RS), não o DDI.
if (d.length === 10 || d.length === 11) {
  numero = '55' + d;
} else if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
  numero = d;
} else {
  motivo = d ? 'telefone com quantidade de dígitos inválida' : 'telefone não informado';
}

return [{ json: { telefone: bruto, numero, valido: !!numero, motivo } }];
