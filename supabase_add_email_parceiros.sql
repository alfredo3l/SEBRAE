-- ============================================
-- Termos URC — coluna email em public.parceiros
-- O e-mail é usado por todos os formulários de termos (campo obrigatório
-- nas validações de envio) e passa a ser editável no sistema, com
-- sincronização do Contact.Email no FOCO (igual ao telefone).
-- Aplicada em 23/08/2026 via Supabase Management API.
-- ============================================

alter table public.parceiros
    add column if not exists email text;
