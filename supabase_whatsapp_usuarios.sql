-- ============================================================================
-- Telefone com WhatsApp dos usuários do sistema (08/10/2026)
-- ============================================================================
-- O usuário cadastra no Meu Perfil; o administrador cadastra/corrige na
-- Gestão de Usuários. O número será usado pelo n8n para disparos aos usuários
-- (os disparos em si ficam para depois — decisão do desenvolvedor).
--
--   whatsapp          → formato padrão do sistema: (DD)NNNNN-NNNN / (DD)NNNN-NNNN
--   whatsapp_jid      → número que a Evolution API reconhece (sem @s.whatsapp.net),
--                       gravado quando a verificação respondeu; é o que o n8n
--                       deve usar no remoteJid (celular antigo pode não ter o 9)
--   whatsapp_digitos  → só dígitos, gerada — para filtrar no n8n/PostgREST
--                       (o filtro não casa valores com parênteses/hífen)
-- Opcional (decisão do desenvolvedor): os usuários atuais ficam sem número.
-- ============================================================================

alter table public.perfis_usuarios
    add column if not exists whatsapp text,
    add column if not exists whatsapp_jid text,
    add column if not exists whatsapp_digitos text
        generated always as (nullif(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), '')) stored;

alter table public.perfis_usuarios
    drop constraint if exists perfis_usuarios_whatsapp_valido;
alter table public.perfis_usuarios
    add constraint perfis_usuarios_whatsapp_valido
    check (whatsapp is null or length(regexp_replace(whatsapp, '\D', '', 'g')) in (10, 11));

-- O próprio usuário grava o seu número (a policy de UPDATE da tabela é só de
-- admin). Vazio apaga. Formata no servidor, então o formato é sempre o mesmo.
create or replace function public.atualizar_meu_whatsapp(p_whatsapp text, p_jid text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_dig text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
    v_fmt text;
    v_jid text := nullif(regexp_replace(coalesce(p_jid, ''), '\D', '', 'g'), '');
begin
    if auth.uid() is null then
        raise exception 'Sessão expirada. Entre novamente.';
    end if;

    if v_dig = '' then
        v_fmt := null;
        v_jid := null;
    elsif length(v_dig) = 11 then
        v_fmt := '(' || substr(v_dig, 1, 2) || ')' || substr(v_dig, 3, 5) || '-' || substr(v_dig, 8);
    elsif length(v_dig) = 10 then
        v_fmt := '(' || substr(v_dig, 1, 2) || ')' || substr(v_dig, 3, 4) || '-' || substr(v_dig, 7);
    else
        raise exception 'Telefone inválido: informe DDD + número (10 ou 11 dígitos).';
    end if;

    update public.perfis_usuarios
       set whatsapp = v_fmt,
           whatsapp_jid = v_jid,
           updated_by = auth.uid()
     where id = auth.uid();

    if not found then
        raise exception 'Perfil não encontrado.';
    end if;

    return v_fmt;
end;
$$;

revoke all on function public.atualizar_meu_whatsapp(text, text) from public, anon;
grant execute on function public.atualizar_meu_whatsapp(text, text) to authenticated;
