-- ============================================
-- vw_documentos_pendentes — remoção do estado "Unrestricted"
-- A view foi criada sem security_invoker (padrão do Postgres): rodava com os
-- privilégios do dono (postgres) e IGNORAVA o RLS de documentos/parceiros —
-- qualquer portador da anon key lia todos os documentos pendentes (CPF,
-- telefone, HTML do termo). Era o badge "SEM RESTRIÇÕES" no painel.
--
-- Correção: security_invoker = true (o RLS passa a valer conforme quem
-- consulta) + revogação do SELECT da anon.
--   • n8n ([Termo URC - Assinado], credencial service_role): continua lendo
--     tudo — service_role tem BYPASSRLS (conferido em pg_roles).
--   • authenticated: mantém SELECT (policy pol_select_* = true).
--   • anon: sem acesso (não tem policy de SELECT nas tabelas-base).
-- Aplicada em 23/08/2026 via MCP Supabase (migração
-- vw_documentos_pendentes_security_invoker). Conferido: reloptions
-- {security_invoker=true} e relacl da view (anon sem "r").
-- ============================================

alter view public.vw_documentos_pendentes set (security_invoker = true);
revoke select on public.vw_documentos_pendentes from anon;
