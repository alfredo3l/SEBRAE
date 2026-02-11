/* ============================================
   SEBRAE - Configuração do Supabase
   ============================================ */

const SUPABASE_URL = 'https://qvjpnucpwdrtxfjqicsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2anBudWNwd2RydHhmanFpY3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDEzODksImV4cCI6MjA4NjQxNzM4OX0.N2B5YbdXhaCTs_Sy9t1maY5xZ91YPvxex3XwDnsx8qQ';

// Inicializa o cliente Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
