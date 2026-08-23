// ============================================
// CÓDIGO PARA N8N - GERAR HTML DO TERMO DE CONSENTIMENTO (LGPD)
// Com botões "Aceito" e "Não Aceito" via Webhook (link direto, sem JS)
// ============================================

// =============================================
// 1. OBTER LOGO BASE64 DO INPUT
// =============================================
let logoBase64 = $input.first().json.data || "";
logoBase64 = String(logoBase64).replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

// =============================================
// 2. DADOS DINÂMICOS DO NÓ "seta_Dados"
// =============================================
const dadosNode = $('seta_Dados').first().json;

const nomeCompleto = dadosNode.Nome || "";
const cpfRaw = dadosNode.CPF || "";
const telefoneRaw = dadosNode.Telefone || "";

function formatarCPF(cpf) {
  const nums = cpf.replace(/\D/g, "");
  if (nums.length === 11) {
    return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return cpf;
}

function formatarTelefone(tel) {
  const nums = tel.replace(/\D/g, "");
  if (nums.length === 11) {
    return nums.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (nums.length === 10) {
    return nums.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return tel;
}

const cpfFormatado = formatarCPF(cpfRaw);
const telefoneFormatado = formatarTelefone(telefoneRaw);

const dataAtual = new Date();

const dataEnvio = dataAtual.toLocaleDateString("pt-BR", {
  timeZone: "America/Campo_Grande",
  day: "2-digit", month: "2-digit", year: "numeric",
}) + " " + dataAtual.toLocaleTimeString("pt-BR", {
  timeZone: "America/Campo_Grande",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// Gerar Hash SHA-256 único (JavaScript puro, sem módulo crypto)
function sha256(msg) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const bytes = [];
  for (let i = 0; i < msg.length; i++) {
    const c = msg.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push((c >> 6) | 192); bytes.push((c & 63) | 128); }
    else { bytes.push((c >> 12) | 224); bytes.push(((c >> 6) & 63) | 128); bytes.push((c & 63) | 128); }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let i = 56; i >= 0; i -= 8) bytes.push((bitLen / Math.pow(2, i)) & 0xff);
  for (let j = 0; j < bytes.length; j += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[j+i*4]<<24)|(bytes[j+i*4+1]<<16)|(bytes[j+i*4+2]<<8)|bytes[j+i*4+3];
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i-15],7) ^ rightRotate(w[i-15],18) ^ (w[i-15]>>>3);
      const s1 = rightRotate(w[i-2],17) ^ rightRotate(w[i-2],19) ^ (w[i-2]>>>10);
      w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e,6) ^ rightRotate(e,11) ^ rightRotate(e,25);
      const ch = (e&f) ^ (~e&g);
      const t1 = (h+S1+ch+k[i]+w[i])|0;
      const S0 = rightRotate(a,2) ^ rightRotate(a,13) ^ rightRotate(a,22);
      const maj = (a&b) ^ (a&c) ^ (b&c);
      const t2 = (S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v => (v>>>0).toString(16).padStart(8,'0')).join('');
}

const conteudoHash = `${nomeCompleto}|${cpfFormatado}|${dataEnvio}|${Date.now()}`;
const hashRaw = sha256(conteudoHash);
const hashSHA256 = hashRaw.match(/.{1,8}/g).join(" ");

// Data/hora de geração do documento
const dataGeracaoFormatada = dataAtual.toLocaleDateString("pt-BR", {
  timeZone: "America/Campo_Grande",
  day: "2-digit", month: "2-digit", year: "numeric",
});
const horaGeracaoFormatada = dataAtual.toLocaleTimeString("pt-BR", {
  timeZone: "America/Campo_Grande",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const dataHoraGeracao = `${dataGeracaoFormatada} ${horaGeracaoFormatada}`;

// =============================================
// 3. MONTAR HTML DO TERMO
// =============================================
const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:Arial,sans-serif;background:#ffffff;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;overflow:hidden;">

    <!-- Logo -->
    <div style="text-align:center;padding:28px 40px 12px 40px;background:#ffffff;">
      <img src="data:image/png;base64,${logoBase64}" alt="SEBRAE" style="height:50px;width:auto;"/>
    </div>
    <div style="margin:0 40px;border-bottom:2px solid #cccccc;"></div>

    <!-- Título -->
    <div style="text-align:center;padding:22px 40px 8px 40px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a;letter-spacing:0.5px;">TERMO DE CONSENTIMENTO (LGPD)</h1>
    </div>

    <!-- Corpo do Termo -->
    <div style="padding:15px 40px 8px 40px;line-height:1.6;color:#333333;font-size:13.5px;">

      <p style="text-align:justify;margin:0 0 16px 0;">
        Em observância à Lei nº 13.709/18 - Lei Geral de Proteção de Dados Pessoais e demais
        normativas aplicáveis sobre proteção de Dados Pessoais, Eu <strong>${nomeCompleto}</strong>,
        CPF nº <strong>${cpfFormatado}</strong>, manifesto-me de forma informada, livre, expressa e
        consciente no sentido de autorizar o SISTEMA SEBRAE a realizar o tratamento de meus
        Dados Pessoais para as finalidades aqui estabelecidas:
      </p>

      <div style="padding:0 0 8px 10px;">
        <p style="margin:0 0 7px 0;text-align:justify;">1. Oferecer produtos e serviços que sejam do meu interesse;</p>
        <p style="margin:0 0 7px 0;text-align:justify;">2. Realizar pesquisas com os clientes que foram atendidos pelo SISTEMA SEBRAE;</p>
        <p style="margin:0 0 7px 0;text-align:justify;">3. Realizar a comunicação oficial pelo SISTEMA SEBRAE com seus prestadores de serviços, por meio de quaisquer canais de comunicação (telefone, e-mail, SMS, WhatsApp, entre outros);</p>
        <p style="margin:0 0 7px 0;text-align:justify;">4. Enriquecer o meu cadastro a partir de bases de dados controlados pelo SISTEMA SEBRAE;</p>
        <p style="margin:0 0 7px 0;text-align:justify;">5. Para melhorar a personalização de meu atendimento, de acordo com minhas necessidades;</p>
        <p style="margin:0 0 7px 0;text-align:justify;">6. Compartilhar meus dados com entidades parceiras desta instituição e com cursos certificados ao SISTEMA SEBRAE, com seus mesmos objetivos acima.</p>
      </div>

      <!-- Nota de validade jurídica -->
      <div style="text-align:center;padding:18px 20px;margin:14px 0;border-top:1px solid #e0e0e0;">
        <p style="margin:0;font-size:11.5px;color:#666666;line-height:1.6;">
          Este documento possui validade jurídica conforme Lei nº 13.709/18 (LGPD). A assinatura digital garante a
          integridade e autenticidade do termo de consentimento.
        </p>
      </div>

      <!-- Hash SHA-256 -->
      <div style="text-align:center;padding:18px 0 12px 0;">
        <p style="margin:0 0 6px 0;font-size:12.5px;font-weight:700;color:#333333;font-family:'Courier New',Courier,monospace;">Hash SHA-256:</p>
        <p style="margin:0;font-size:11.5px;color:#555555;font-family:'Courier New',Courier,monospace;letter-spacing:1px;">${hashSHA256}</p>
      </div>

    </div>

    <!-- Rodapé -->
    <div style="padding:15px 40px;text-align:right;border-top:1px solid #e0e0e0;">
      <p style="margin:0;font-size:10.5px;color:#999999;font-style:italic;">Documento gerado em ${dataHoraGeracao}</p>
    </div>

  </div>
</body>
</html>`;

// =============================================
// 4. RETORNAR RESULTADO
// =============================================
return [
  {
    json: {
      erro: false,
      nome: nomeCompleto,
      cpf: cpfFormatado,
      telefone: telefoneFormatado,
      dataEnvioTermo: dataEnvio,
      hash: hashSHA256,
      dataGeracao: dataHoraGeracao,
      htmlEmail: htmlEmail,
    },
  },
];