-- =============================================================
-- preparar_envio_documento: só para usuário autenticado (01/10/2026)
-- A RPC é SECURITY DEFINER (ignora RLS) e marca o documento como
-- "enviado" + reserva a letra de resposta. Estava executável pelo
-- papel anon (sem login) via PUBLIC. Só o front logado a chama;
-- o n8n não usa esta função.
-- =============================================================

revoke execute on function public.preparar_envio_documento(uuid) from public;
revoke execute on function public.preparar_envio_documento(uuid) from anon;
grant  execute on function public.preparar_envio_documento(uuid) to authenticated;
grant  execute on function public.preparar_envio_documento(uuid) to service_role;
