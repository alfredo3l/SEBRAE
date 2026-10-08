-- ============================================================================
-- Avisos de senha pelo WhatsApp (08/10/2026)
-- ============================================================================
-- Dois fluxos n8n (pasta SEBRAE):
--   [Termo URC - Aviso Pedido de Senha]     POST /webhook/TERMOS-URC-SENHA-PEDIDO
--     → avisa os gestores de senhas quando chega um "Esqueci minha senha"
--   [Termo URC - Aviso Senha Redefinida]    POST /webhook/TERMOS-URC-SENHA-REDEFINIDA
--     → manda ao usuário a senha temporária definida pelo gestor e avisa os
--       demais gestores que o pedido foi resolvido
-- Só recebe mensagem quem tem WhatsApp cadastrado (perfis_usuarios.whatsapp).
--
-- Proteções (os webhooks são públicos):
--   * Pedido: 1 aviso por pedido REAL — o fluxo "reivindica" o pedido pendente
--     criado nos últimos 15 min e ainda não avisado (notificado_em). Repetir o
--     pedido ou chamar o webhook à toa não gera mensagem.
--   * Redefinição: a função roda com o token do gestor logado (o fluxo repassa o
--     JWT), exige pode_gerir_senhas(), que o usuário esteja com senha temporária
--     redefinida por ESTE gestor nos últimos 15 min e que a senha recebida seja
--     exatamente a gravada (bcrypt) — ninguém consegue mandar senha falsa.
-- ============================================================================

alter table public.solicitacoes_senha
    add column if not exists notificado_em timestamptz;

-- Gestores de senhas ativos com WhatsApp (mesma regra de pode_gerir_senhas)
create or replace function public._gestores_senhas_whatsapp(p_excluir uuid[] default '{}')
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
               'id', id,
               'nome', nome_completo,
               'whatsapp', whatsapp,
               'remote_jid', coalesce(whatsapp_jid, '55' || whatsapp_digitos)
           ) order by nome_completo), '[]'::jsonb)
      from public.perfis_usuarios
     where role = 'admin'
       and ativo = true
       and (lower(email) = 'admin@sebrae.com.br' or gere_senhas)
       and whatsapp_digitos is not null
       and not (id = any(p_excluir));
$$;

revoke all on function public._gestores_senhas_whatsapp(uuid[]) from public, anon, authenticated;

-- 1. Chamada pelo n8n com a credencial service_role
create or replace function public.n8n_aviso_pedido_senha(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sol   public.solicitacoes_senha%rowtype;
    v_nome  text;
begin
    update public.solicitacoes_senha
       set notificado_em = now()
     where id = (
            select id from public.solicitacoes_senha
             where lower(email) = lower(trim(coalesce(p_email, '')))
               and status = 'pendente'
               and notificado_em is null
               and criado_em > now() - interval '15 minutes'
             order by criado_em desc
             limit 1)
    returning * into v_sol;

    if v_sol.id is null then
        return jsonb_build_object('enviar', false, 'motivo', 'sem pedido novo', 'gestores', '[]'::jsonb);
    end if;

    select nome_completo into v_nome from public.perfis_usuarios where id = v_sol.perfil_id;

    return jsonb_build_object(
        'enviar', true,
        'usuario', jsonb_build_object('nome', v_nome, 'email', v_sol.email),
        'gestores', public._gestores_senhas_whatsapp(array[v_sol.perfil_id])
    );
end;
$$;

revoke all on function public.n8n_aviso_pedido_senha(text) from public, anon, authenticated;
grant execute on function public.n8n_aviso_pedido_senha(text) to service_role;

-- 2. Chamada pelo n8n com o token do gestor que redefiniu a senha
create or replace function public.aviso_senha_redefinida(p_usuario uuid, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
declare
    v_alvo   public.perfis_usuarios%rowtype;
    v_gestor text;
    v_hash   text;
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente um gestor de senhas.';
    end if;

    select * into v_alvo from public.perfis_usuarios where id = p_usuario;
    if v_alvo.id is null
       or not v_alvo.senha_temporaria
       or v_alvo.updated_by is distinct from auth.uid()
       or v_alvo.updated_at < now() - interval '15 minutes' then
        raise exception 'Nenhuma redefinição recente deste usuário feita por você.';
    end if;

    select encrypted_password into v_hash from auth.users where id = p_usuario;
    if v_hash is null or extensions.crypt(coalesce(p_senha, ''), v_hash) <> v_hash then
        raise exception 'A senha informada não confere com a senha temporária gravada.';
    end if;

    select nome_completo into v_gestor from public.perfis_usuarios where id = auth.uid();

    return jsonb_build_object(
        'usuario', jsonb_build_object(
            'nome', v_alvo.nome_completo,
            'email', v_alvo.email,
            'whatsapp', v_alvo.whatsapp,
            'remote_jid', case when v_alvo.whatsapp_digitos is null then null
                               else coalesce(v_alvo.whatsapp_jid, '55' || v_alvo.whatsapp_digitos) end),
        'gestor', jsonb_build_object('nome', v_gestor),
        'outros_gestores', public._gestores_senhas_whatsapp(array[auth.uid(), p_usuario])
    );
end;
$$;

revoke all on function public.aviso_senha_redefinida(uuid, text) from public, anon;
grant execute on function public.aviso_senha_redefinida(uuid, text) to authenticated;
