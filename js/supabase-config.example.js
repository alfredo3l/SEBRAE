/* ============================================
   SEBRAE - Configuração do Supabase
   ============================================
   
   INSTRUÇÕES:
   1. Copie este arquivo como "supabase-config.js" na mesma pasta
   2. Substitua os valores abaixo pelas suas credenciais do Supabase
   3. O arquivo supabase-config.js está no .gitignore e NÃO será commitado
   ============================================ */

const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY-AQUI';

// Inicializa o cliente Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
