-- ============================================
-- Bloqueio do envio: SÓ o telefone de quem envia (15/10/2026)
-- Substitui a regra de supabase_bloqueio_envio_telefone_usuario.sql (14/10).
-- Pedido do desenvolvedor após o caso do consultor Joacir (cliente Flavio,
-- cujo telefone é o WhatsApp de um usuário do sistema):
--   * bloqueia apenas quando o telefone do cliente é o WhatsApp do PRÓPRIO
--     usuário que está enviando ('telefone_proprio');
--   * sai o bloqueio por telefone de OUTRO usuário ('telefone_usuario');
--   * sai a exigência de ter o próprio WhatsApp cadastrado
--     ('sem_whatsapp_proprio') — sem número cadastrado não há o que comparar,
--     então o envio é liberado;
--   * mantida a exceção da conta oculta (desenvolvedor), para os testes com o
--     próprio celular.
-- _telefone_chave e verificar_bloqueio_envio continuam como estão.
-- ============================================

-- Motivo do bloqueio para o usuário p_uid enviar ao telefone p_telefone:
--   'telefone_proprio' | null (liberado)
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
    if p_uid is null or v_chave is null then
        return null;
    end if;

    select coalesce(u.oculto, false) as oculto, u.whatsapp_digitos, u.whatsapp_jid
      into v_eu
      from public.perfis_usuarios u
     where u.id = p_uid;

    -- Sem cadastro, sem WhatsApp ou conta oculta: nada a comparar / liberado
    if not found or v_eu.oculto then
        return null;
    end if;

    if v_chave in (public._telefone_chave(v_eu.whatsapp_digitos), public._telefone_chave(v_eu.whatsapp_jid)) then
        return 'telefone_proprio';
    end if;

    return null;
end;
$$;

revoke all on function public._motivo_bloqueio_envio(uuid, text) from public, anon, authenticated;

-- preparar_envio_documento: mesma função de 14/10, só com a recusa do telefone próprio
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

    -- Telefone do cliente não pode ser o WhatsApp de quem envia (15/10/2026)
    select p.telefone into v_telefone from public.parceiros p where p.id = v_parceiro;
    if public._motivo_bloqueio_envio(auth.uid(), v_telefone) = 'telefone_proprio' then
        raise exception 'O telefone do cliente é o seu próprio WhatsApp. O termo deve ser enviado ao celular do cliente.';
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
