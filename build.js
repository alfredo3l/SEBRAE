/**
 * Script de build para gerar o supabase-config.js
 * a partir das variáveis de ambiente (Vercel, Netlify, etc.)
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

const outputPath = path.join(__dirname, 'js', 'supabase-config.js');
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('supabase-config.js gerado com sucesso!');
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY.substring(0, 20) + '...');
