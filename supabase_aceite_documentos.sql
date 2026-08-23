-- ============================================
-- Termos URC — aceite/recusa por documento (WhatsApp)
-- Permite que o cliente tenha VÁRIOS termos aguardando resposta ao mesmo
-- tempo: cada documento enviado recebe uma letra (A, B, C...) e o cliente
-- responde "1A" (aceito) ou "2A" (não aceito).
-- Aplicada em 23/08/2026 via Supabase Management API.
-- ============================================

alter table public.documentos
    add column if not exists codigo_resposta      text,        -- letra da fila: A, B, C...
    add column if not exists html_documento       text,        -- HTML do termo (gera o PDF assinado sem depender do front)
    add column if not exists resposta_texto       text,        -- o que o cliente digitou no WhatsApp
    add column if not exists respondido_em        timestamptz,
    add column if not exists whatsapp_message_id  text,
    add column if not exists assinatura_digital   text;        -- hash SHA-256 do documento aceito

-- Uma letra por vez entre os documentos aguardando resposta do mesmo cliente
create unique index if not exists uq_documentos_codigo_pendente
    on public.documentos (parceiro_id, codigo_resposta)
    where status = 'enviado';

-- ============================================
-- RPC: prepara o envio de um documento
-- Atribui a primeira letra livre (A→Z) entre os documentos "enviado" do
-- parceiro, marca status/data_envio e devolve o registro atualizado.
-- Atômica: evita que dois envios simultâneos peguem a mesma letra.
-- ============================================

create or replace function public.preparar_envio_documento(p_documento_id uuid)
returns table (
    id              uuid,
    parceiro_id     uuid,
    tipo_documento  text,
    nome_documento  text,
    codigo_resposta text,
    data_envio      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_parceiro   uuid;
    v_codigo     text;
    v_existente  text;
    v_status     text;
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
$$;

grant execute on function public.preparar_envio_documento(uuid) to authenticated;

-- ============================================
-- View: documentos aguardando resposta do cliente
-- Usada pelo fluxo n8n de aceite (o nó Supabase não faz join): permite
-- localizar os pendentes pelo telefone que chega do WhatsApp.
-- ============================================

-- drop + create porque a lista de colunas mudou (create or replace não permite)
drop view if exists public.vw_documentos_pendentes;

create view public.vw_documentos_pendentes as
select
    d.id                as documento_id,
    d.parceiro_id,
    p.cpf,
    p.telefone,
    -- Só dígitos: o filtro do n8n/PostgREST não casa valores com parênteses
    -- e hífen (ex.: "(67)99245-1961" retornava vazio). Filtrar por estas.
    regexp_replace(p.telefone, '\D', '', 'g') as telefone_digitos,
    regexp_replace(p.cpf, '\D', '', 'g')      as cpf_digitos,
    p.nome_razao_social,
    p.id_salesforce,
    p.id_contato_salesforce,
    d.tipo_documento,
    d.nome_documento,
    d.codigo_resposta,
    d.html_documento,
    d.case_id_salesforce,
    d.case_number,
    d.data_envio,
    d.created_at
from public.documentos d
join public.parceiros p on p.id = d.parceiro_id
where d.status = 'enviado';

grant select on public.vw_documentos_pendentes to authenticated, anon, service_role;

-- ⚠️ Atualização de 23/08/2026: a view acima passou a security_invoker=true e o
-- SELECT da anon foi revogado — ver supabase_view_pendentes_security_invoker.sql.
