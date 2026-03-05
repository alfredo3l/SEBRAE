-- Adiciona a coluna recusado na tabela public.parceiros (Supabase).
-- Quando recusado = true, o status do termo é exibido como "Recusado" em vez de "Não".
-- Execute no SQL Editor do seu projeto Supabase (Dashboard > SQL Editor).

ALTER TABLE public.parceiros
ADD COLUMN IF NOT EXISTS recusado boolean DEFAULT false;

COMMENT ON COLUMN public.parceiros.recusado IS 'Indica se o parceiro recusou o termo LGPD (exibe "Recusado" no status do termo).';
