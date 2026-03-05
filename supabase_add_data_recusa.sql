-- Adiciona a coluna data_recusa na tabela public.parceiros (Supabase).
-- Mesmo tipo da coluna data_aceite (timestamp with time zone).
-- Execute no SQL Editor do projeto Supabase (ex.: consultoria de dados).

ALTER TABLE public.parceiros
ADD COLUMN IF NOT EXISTS data_recusa timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.parceiros.data_recusa IS 'Data e hora em que o parceiro recusou o termo LGPD (mesmo formato de data_aceite).';
