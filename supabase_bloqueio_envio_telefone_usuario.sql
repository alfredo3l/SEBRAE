-- ============================================
-- Bloqueio do envio para telefone de usuário do sistema (14/10/2026)
-- Pedido do SEBRAE: o termo não pode ser enviado quando o celular do cliente é
-- o de quem está atendendo ou o de qualquer usuário cadastrado no sistema
-- (casos reais: termos de clientes enviados ao WhatsApp de consultores).
-- Decisões do desenvolvedor:
--   * quem envia precisa ter o PRÓPRIO WhatsApp cadastrado (Meu Perfil) —
--     sem ele não há como reconhecer o número do consultor;
--   * usuários desativados também contam;
--   * exceção: a conta oculta (desenvolvedor) pode enviar para números de
--     usuários, para os testes com o próprio celular.
-- Comparação por DDD + últimos 8 dígitos (mesma regra da telefone_chave do
-- aceite): casa celular com/sem o 9, com/sem DDI 55, com/sem máscara.
-- O bloqueio vale no banco (preparar_envio_documento), não só na tela.
-- ============================================

-- DDD + últimos 8 dígitos; null se não houver 10 dígitos
create or replace function public._telefone_chave(p_telefone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
    select case when length(d) >= 10 then substr(d, 1, 2) || right(d, 8) end
      from (select case when length(x) in (12, 13) and x like '55%' then substr(x, 3) else x end as d
              from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as x) a) b
$$;

-- Motivo do bloqueio para o usuário p_uid enviar ao telefone p_telefone:
--   'sem_whatsapp_proprio' | 'telefone_proprio' | 'telefone_usuario' | null (liberado)
create or replace function public._motivo_bloqueio_envio(p_uid uuid, p_telefone text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_eu    record;
    v_chave text := public._telefone_chave(p_telefone);
begin
    -- Sem usuário logado = administração do banco / service_role
    if p_uid is null then
        return null;
    end if;

    select u.id, coalesce(u.oculto, false) as oculto, u.whatsapp_digitos, u.whatsapp_jid
      into v_eu
      from public.perfis_usuarios u
     where u.id = p_uid;

    if not found or v_eu.whatsapp_digitos is null then
        return 'sem_whatsapp_proprio';
    end if;

    -- Telefone inválido é barrado por outras validações
    if v_chave is null or v_eu.oculto then
        return null;
    end if;

    if v_chave in (public._telefone_chave(v_eu.whatsapp_digitos), public._telefone_chave(v_eu.whatsapp_jid)) then
        return 'telefone_proprio';
    end if;

    if exists (
        select 1
          from public.perfis_usuarios u
         where u.id <> p_uid
           and v_chave in (public._telefone_chave(u.whatsapp_digitos), public._telefone_chave(u.whatsapp_jid))
    ) then
        return 'telefone_usuario';
    end if;

    return null;
end;
$$;

-- Consulta da tela (etapa de envio): motivo para o usuário logado
create or replace function public.verificar_bloqueio_envio(p_telefone text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
    select public._motivo_bloqueio_envio(auth.uid(), p_telefone)
$$;

revoke all on function public._telefone_chave(text) from public, anon, authenticated;
revoke all on function public._motivo_bloqueio_envio(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_bloqueio_envio(text) from public, anon;
grant execute on function public.verificar_bloqueio_envio(text) to authenticated;

-- preparar_envio_documento: mesma função de antes + a guarda do telefone
create or replace function public.preparar_envio_documento(p_documento_id uuid)
returns table(id uuid, parceiro_id uuid, tipo_documento text, nome_documento text, codigo_resposta text, data_envio timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_parceiro   uuid;
    v_codigo     text;
    v_existente  text;
    v_status     text;
    v_telefone   text;
    v_motivo     text;
begin
    select d.parceiro_id, d.codigo_resposta, d.status
      into v_parceiro, v_existente, v_status
      from public.documentos d
     where d.id = p_documento_id
       for update;

    if v_parceiro is null then
        raise exception 'Documento % não encontrado', p_documento_id;
    end if;

    -- Documento já respondido pelo cliente não volta para a fila de envio
    if v_status in ('aceito', 'recusado', 'nao_aceito') then
        raise exception 'Documento % já foi respondido (status %); gere um novo documento para reenviar',
            p_documento_id, v_status;
    end if;

    -- Telefone do cliente não pode ser de usuário do sistema (14/10/2026)
    select p.telefone into v_telefone from public.parceiros p where p.id = v_parceiro;
    v_motivo := public._motivo_bloqueio_envio(auth.uid(), v_telefone);
    if v_motivo = 'sem_whatsapp_proprio' then
        raise exception 'Cadastre o seu WhatsApp no Meu Perfil para poder enviar termos.';
    elsif v_motivo = 'telefone_proprio' then
        raise exception 'O telefone do cliente é o seu próprio WhatsApp. O termo deve ser enviado ao celular do cliente.';
    elsif v_motivo = 'telefone_usuario' then
        raise exception 'O telefone do cliente pertence a um usuário do sistema. O termo deve ser enviado ao celular do próprio cliente.';
    end if;

    -- Reenvio: mantém a letra já atribuída, se ainda estiver com o documento
    if v_existente is not null then
        v_codigo := v_existente;
    else
        -- Primeira letra livre entre os documentos aguardando resposta
        select ch
          into v_codigo
          from unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z', ',')) as ch
         where not exists (
               select 1
                 from public.documentos d2
                where d2.parceiro_id = v_parceiro
                  and d2.status = 'enviado'
                  and d2.codigo_resposta = ch
                  and d2.id <> p_documento_id
           )
         limit 1;

        if v_codigo is null then
            raise exception 'Cliente já possui 26 documentos aguardando resposta';
        end if;
    end if;

    return query
    update public.documentos d
       set codigo_resposta = v_codigo,
           status          = 'enviado',
           data_envio      = now(),
           updated_at      = now()
     where d.id = p_documento_id
    returning d.id, d.parceiro_id, d.tipo_documento, d.nome_documento, d.codigo_resposta, d.data_envio;
end;
$function$;

-- Grants da preparar_envio_documento mantidos (sem anon/PUBLIC — ver
-- supabase_rpc_preparar_envio_sem_anon.sql); create or replace os preserva.
