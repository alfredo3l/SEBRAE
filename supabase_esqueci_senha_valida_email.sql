-- ============================================================================
-- "Esqueci minha senha" passa a conferir o e-mail (08/10/2026)
-- ============================================================================
-- Antes a função respondia igual para qualquer e-mail (não revelava quem é
-- cadastrado). Decisão do desenvolvedor: recusar e-mail não cadastrado, avisar
-- usuário inativo e pedido já pendente — ciente de que isso permite descobrir,
-- testando, quais e-mails são usuários do Termos URC.
--
-- Retorno (text):
--   'registrada'     → pedido novo gravado
--   'pendente'       → já havia pedido pendente; nada gravado
--   'nao_cadastrado' → e-mail não é usuário do Termos URC (perfis_usuarios)
--   'inativo'        → usuário existe mas está inativo; nada gravado
--   'invalido'       → e-mail vazio ou longo demais
-- O tipo de retorno muda (void → text), por isso o drop.
-- ============================================================================

drop function if exists public.solicitar_redefinicao_senha(text);

create function public.solicitar_redefinicao_senha(p_email text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_perfil uuid;
    v_ativo  boolean;
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_linhas integer;
begin
    if v_email = '' or length(v_email) > 254 then
        return 'invalido';
    end if;

    -- Se houver mais de um perfil com o mesmo e-mail, o ativo prevalece
    select id, ativo into v_perfil, v_ativo
      from public.perfis_usuarios
     where lower(email) = v_email
     order by ativo desc
     limit 1;

    if v_perfil is null then
        return 'nao_cadastrado';
    end if;
    if not v_ativo then
        return 'inativo';
    end if;

    insert into public.solicitacoes_senha (perfil_id, email)
    values (v_perfil, v_email)
    on conflict (perfil_id) where status = 'pendente' do nothing;
    get diagnostics v_linhas = row_count;

    return case when v_linhas > 0 then 'registrada' else 'pendente' end;
end;
$$;

revoke all on function public.solicitar_redefinicao_senha(text) from public;
grant execute on function public.solicitar_redefinicao_senha(text) to anon, authenticated;
