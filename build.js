/**
 * Script de build para gerar o supabase-config.js
 * a partir das variáveis de ambiente (Vercel, Netlify, etc.)
 */

const fs = require('fs');
const path = require('path');

console.log('=== SEBRAE Build ===');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('AVISO: Variáveis SUPABASE_URL e/ou SUPABASE_ANON_KEY não definidas.');
    console.warn('O arquivo supabase-config.js será gerado com valores vazios.');
    console.warn('Configure as variáveis em Settings > Environment Variables na Vercel.');
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

if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
}

fs.writeFileSync(outputPath, configContent, 'utf8');
console.log('supabase-config.js gerado com sucesso!');
console.log('=== Build concluído ===');
