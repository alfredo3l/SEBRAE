-- ============================================================================
-- Mensagem do administrador para o WhatsApp de um usuário (08/10/2026)
-- ============================================================================
-- Na Gestão de Usuários, o administrador clica no número de WhatsApp de um
-- usuário e escreve uma mensagem; o fluxo n8n [Termo URC - Mensagem ao Usuario]
-- (POST /webhook/TERMOS-URC-MENSAGEM-USUARIO) envia pela instância SEBRAE, com
-- o nome e o WhatsApp do administrador no rodapé, para o usuário continuar a
-- conversa direto com ele.
--
-- Decisões do desenvolvedor: só administrador ativo envia; o administrador
-- precisa ter o PRÓPRIO WhatsApp cadastrado; só para usuário ativo com número;
-- texto de até 1.000 caracteres; histórico gravado (auditoria).
--
-- Segurança: o fluxo chama preparar_mensagem_usuario com o JWT de quem envia
-- (repassado pelo front) — é o banco que confere o perfil, fornece os números e
-- grava o texto; o fluxo envia exatamente o que foi registrado. Depois, com a
-- credencial service_role, registra o resultado (n8n_resultado_mensagem_usuario).
-- ============================================================================

create table if not exists public.mensagens_whatsapp_usuarios (
    id                     uuid primary key default gen_random_uuid(),
    remetente_id           uuid not null references public.perfis_usuarios(id),
    remetente_nome         text not null,
    remetente_whatsapp     text not null,
    destinatario_id        uuid not null references public.perfis_usuarios(id),
    destinatario_nome      text not null,
    destinatario_whatsapp  text not null,
    texto                  text not null check (length(texto) between 1 and 1000),
    status                 text not null default 'pendente' check (status in ('pendente', 'enviada', 'falha')),
    erro                   text,
    criado_em              timestamptz not null default now(),
    enviado_em             timestamptz
);

create index if not exists mensagens_whatsapp_usuarios_destinatario_idx
    on public.mensagens_whatsapp_usuarios (destinatario_id, criado_em desc);

alter table public.mensagens_whatsapp_usuarios enable row level security;

drop policy if exists pol_select_mensagens_whatsapp on public.mensagens_whatsapp_usuarios;
create policy pol_select_mensagens_whatsapp on public.mensagens_whatsapp_usuarios
    for select to authenticated using (public.is_admin());
-- Sem policy de escrita: só pelas funções abaixo.
revoke all on public.mensagens_whatsapp_usuarios from anon;

-- 1. Chamada pelo n8n com o token do administrador que envia
create or replace function public.preparar_mensagem_usuario(p_destinatario uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_rem   public.perfis_usuarios%rowtype;
    v_dest  public.perfis_usuarios%rowtype;
    v_texto text := btrim(coalesce(p_texto, ''));
    v_id    uuid;
begin
    if not public.is_admin() then
        raise exception 'Acesso negado: somente administradores enviam mensagens.';
    end if;

    select * into v_rem from public.perfis_usuarios where id = auth.uid();
    if v_rem.whatsapp_digitos is null then
        raise exception 'Cadastre o seu WhatsApp no Meu Perfil para enviar mensagens.';
    end if;

    select * into v_dest from public.perfis_usuarios where id = p_destinatario;
    if v_dest.id is null then
        raise exception 'Usuário não encontrado.';
    end if;
    if v_dest.id = v_rem.id then
        raise exception 'Não é possível enviar mensagem para você mesmo.';
    end if;
    if not v_dest.ativo then
        raise exception 'Usuário inativo: não é possível enviar mensagem.';
    end if;
    if v_dest.whatsapp_digitos is null then
        raise exception 'Este usuário não tem WhatsApp cadastrado.';
    end if;

    if v_texto = '' then
        raise exception 'Escreva a mensagem.';
    end if;
    if length(v_texto) > 1000 then
        raise exception 'A mensagem passa de 1.000 caracteres.';
    end if;

    -- Freio contra envio em massa: no máximo 20 mensagens por administrador em 10 min
    if (select count(*) from public.mensagens_whatsapp_usuarios
         where remetente_id = v_rem.id and criado_em > now() - interval '10 minutes') >= 20 then
        raise exception 'Muitas mensagens em pouco tempo. Aguarde alguns minutos.';
    end if;

    insert into public.mensagens_whatsapp_usuarios
        (remetente_id, remetente_nome, remetente_whatsapp,
         destinatario_id, destinatario_nome, destinatario_whatsapp, texto)
    values
        (v_rem.id, v_rem.nome_completo, v_rem.whatsapp,
         v_dest.id, v_dest.nome_completo, v_dest.whatsapp, v_texto)
    returning id into v_id;

    return jsonb_build_object(
        'id', v_id,
        'texto', v_texto,
        'remetente', jsonb_build_object('nome', v_rem.nome_completo, 'whatsapp', v_rem.whatsapp),
        'destinatario', jsonb_build_object(
            'nome', v_dest.nome_completo,
            'whatsapp', v_dest.whatsapp,
            'remote_jid', coalesce(v_dest.whatsapp_jid, '55' || v_dest.whatsapp_digitos))
    );
end;
$$;

revoke all on function public.preparar_mensagem_usuario(uuid, text) from public, anon;
grant execute on function public.preparar_mensagem_usuario(uuid, text) to authenticated;

-- 2. Chamada pelo n8n com a credencial service_role, depois do envio
create or replace function public.n8n_resultado_mensagem_usuario(p_id uuid, p_ok boolean, p_erro text default null)
returns void
language sql
security definer
set search_path to 'public'
as $$
    update public.mensagens_whatsapp_usuarios
       set status     = case when p_ok then 'enviada' else 'falha' end,
           enviado_em = case when p_ok then now() else null end,
           erro       = case when p_ok then null else left(coalesce(p_erro, 'falha no envio'), 500) end
     where id = p_id
       and status = 'pendente';
$$;

revoke all on function public.n8n_resultado_mensagem_usuario(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.n8n_resultado_mensagem_usuario(uuid, boolean, text) to service_role;
