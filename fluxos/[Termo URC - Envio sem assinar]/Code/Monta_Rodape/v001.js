// ============================================
// TERMOS URC - RODAPÉ DAS PÁGINAS DO PDF
// O Gotenberg imprime em todas as páginas o arquivo chamado "footer.html"
// enviado no multipart. Este nó ACRESCENTA esse segundo binário ao item,
// preservando o "data" (index.html) montado pelo Convert to File — por isso
// não usamos um segundo Convert to File, que sobrescreveria o binário.
// A numeração mostra ao leitor que nenhuma página do documento falta.
// ============================================

const item = $input.first();

const rodape = `<html>
<head>
  <style>
    body { margin:0; font-family:Arial, sans-serif; font-size:9px; color:#999999; }
    .rodape { width:100%; text-align:center; padding-top:4px; }
  </style>
</head>
<body>
  <div class="rodape">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
</body>
</html>`;

item.binary = item.binary || {};
item.binary.footer = {
  data: Buffer.from(rodape, 'utf8').toString('base64'),
  fileName: 'footer.html',
  mimeType: 'text/html'
};

return [item];
