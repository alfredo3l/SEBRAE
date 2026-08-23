-- ============================================
-- Termos URC — atualização em tempo real das telas
-- Sem isto, a lista e o acompanhamento só mostram o aceite/recusa do cliente
-- depois de um F5: o n8n grava no banco e o navegador não fica sabendo.
-- Habilita a replicação em tempo real (websocket) nas tabelas que alimentam
-- o status dos documentos.
-- Aplicada em 23/08/2026 via Supabase Management API.
-- ============================================

-- documentos: status (gerado/enviado/aceito/recusado), datas e salvo_foco
alter publication supabase_realtime add table public.documentos;

-- parceiros: o Termo LGPD ainda deriva o status das flags desta tabela
alter publication supabase_realtime add table public.parceiros;

-- REPLICA IDENTITY FULL: o Supabase envia a linha completa (não apenas a PK)
-- nos eventos de UPDATE, permitindo que o front atualize sem nova consulta.
alter table public.documentos replica identity full;
alter table public.parceiros  replica identity full;
