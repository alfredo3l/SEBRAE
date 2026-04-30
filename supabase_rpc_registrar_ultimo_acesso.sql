-- Atualiza ultimo_acesso do usuário autenticado (perfis_usuarios.id = auth.uid()).
-- Execute no SQL Editor do Supabase (ou via migrate) antes de usar o front-end atualizado.

CREATE OR REPLACE FUNCTION public.registrar_ultimo_acesso()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.perfis_usuarios
  SET
    ultimo_acesso = now(),
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ultimo_acesso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ultimo_acesso() TO authenticated;
