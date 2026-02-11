/**
 * Script de build para gerar o supabase-config.js
 * a partir das variáveis de ambiente (Vercel, Netlify, etc.)
 */

const fs = require('fs');
const path = require('path');

console.log('=== SEBRAE Build ===');
console.log('Diretório atual:', __dirname);
console.log('Variáveis de ambiente disponíveis:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA');
console.log('  SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'DEFINIDA' : 'NÃO DEFINIDA');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('');
    console.error('ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias.');
    console.error('Configure-as no painel da Vercel em Settings > Environment Variables.');
    process.exit(1);
}

const configContent = `/* ============================================
   SEBRAE - Configuração do Supabase
   Gerado automaticamente pelo build
   ============================================ */

const SUPABASE_URL = '${SUPABASE_URL}';
const SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';

// Inicializa o cliente Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
`;

const jsDir = path.join(__dirname, 'js');
const outputPath = path.join(jsDir, 'supabase-config.js');

// Garante que o diretório js/ existe
if (!fs.existsSync(jsDir)) {
    console.log('Criando diretório js/...');
    fs.mkdirSync(jsDir, { recursive: true });
}

fs.writeFileSync(outputPath, configContent, 'utf8');

// Verifica se o arquivo foi criado
if (fs.existsSync(outputPath)) {
    console.log('');
    console.log('supabase-config.js gerado com sucesso!');
    console.log('Caminho:', outputPath);
    console.log('Tamanho:', fs.statSync(outputPath).size, 'bytes');
} else {
    console.error('ERRO: Falha ao criar o arquivo supabase-config.js');
    process.exit(1);
}

// Lista arquivos do diretório js/ para confirmação
console.log('');
console.log('Arquivos em js/:');
fs.readdirSync(jsDir).forEach(f => console.log('  -', f));
console.log('');
console.log('=== Build concluído ===');
