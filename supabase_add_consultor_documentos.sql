-- ============================================
-- Termos URC — coluna consultor em public.documentos
-- Nome do consultor logado que gerou o documento (timeline de evidências,
-- Tela 6 da POC: "Documento gerado • Consultor X").
-- Aplicada em 23/08/2026 via Supabase Management API.
-- ============================================

alter table public.documentos
    add column if not exists consultor text;
