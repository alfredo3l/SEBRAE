// Rodapé de todas as páginas do PDF: o Gotenberg reconhece o arquivo chamado
// "footer.html" enviado no mesmo campo "files". Acrescenta o binário sem mexer
// no "data" (index.html) montado pelo Convert to File.
const item = $input.first();

const rodape = `<html>
<head>
  <style>
    body { margin:0; font-family:Arial, sans-serif; font-size:8px; color:#9ca3af; }
    .rodape { width:100%; padding:4px 22px 0; display:flex; justify-content:space-between; }
  </style>
</head>
<body>
  <div class="rodape">
    <span>TERMOS URC · Relatório de logs — documento gerado automaticamente</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>
</body>
</html>`;

item.binary = item.binary || {};
item.binary.footer = {
  data: Buffer.from(rodape, 'utf8').toString('base64'),
  fileName: 'footer.html',
  mimeType: 'text/html'
};

return [item];
