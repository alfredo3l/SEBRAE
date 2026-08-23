-- ============================================
-- Termos URC — Fase 2: tabela public.documentos
-- Múltiplos termos/documentos por parceiro (1 linha por documento).
-- parceiros permanece como cadastro do cliente (1 linha por CPF).
-- Aplicada em 23/08/2026 via Supabase Management API.
-- ============================================

create table if not exists public.documentos (
    id                    uuid primary key default gen_random_uuid(),
    parceiro_id           uuid not null references public.parceiros(id) on delete cascade,
    tipo_documento        text not null,   -- slug do catálogo TERMOS_URC (termo-lgpd, parcelamento-mei, ...)
    nome_documento        text not null,   -- título exibido (ex.: "Termo LGPD")
    status                text not null default 'gerado'
                          check (status in ('gerado','enviado','aceito','nao_aceito','recusado')),
    salvo_foco            boolean not null default false,   -- documento anexado no FOCO (RF19)
    arquivo_path          text,            -- caminho do PDF no bucket TermosAceite
    case_id_salesforce    text,            -- Id do Case (interação) vinculado
    case_number           text,            -- CaseNumber exibido como "Interação nº"
    content_document_id   text,            -- ContentDocumentId no FOCO após upload (fase futura)
    dados_formulario      jsonb,           -- campos preenchidos pelo consultor na geração
    data_envio            timestamptz,
    data_aceite           timestamptz,
    data_recusa           timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

-- Sem UNIQUE (parceiro_id, tipo_documento): a mesma pessoa pode repetir um
-- termo em atendimentos diferentes.

create index if not exists idx_documentos_parceiro on public.documentos(parceiro_id);
create index if not exists idx_documentos_tipo on public.documentos(tipo_documento);
create index if not exists idx_documentos_status on public.documentos(status);

-- RLS espelhando public.parceiros
alter table public.documentos enable row level security;

drop policy if exists pol_select_documentos on public.documentos;
create policy pol_select_documentos on public.documentos
    for select to authenticated using (true);

drop policy if exists pol_insert_documentos on public.documentos;
create policy pol_insert_documentos on public.documentos
    for insert to authenticated with check (true);

drop policy if exists pol_update_documentos on public.documentos;
create policy pol_update_documentos on public.documentos
    for update to authenticated using (pode_editar_parceiros());

drop policy if exists pol_delete_documentos on public.documentos;
create policy pol_delete_documentos on public.documentos
    for delete to authenticated using (pode_editar_parceiros());

-- ============================================
-- Backfill: 1 registro "Termo LGPD" para cada parceiro com histórico
-- (aceito, recusado ou enviado). Status derivado das flags atuais.
-- Idempotente: não duplica se já existir termo-lgpd para o parceiro.
-- ============================================

insert into public.documentos
    (parceiro_id, tipo_documento, nome_documento, status, salvo_foco,
     arquivo_path, data_envio, data_aceite, data_recusa)
select
    p.id,
    'termo-lgpd',
    'Termo LGPD',
    case
        when p.termo_aceito then 'aceito'
        when p.recusado then 'recusado'
        when p.data_envio is not null then 'enviado'
    end,
    p.termo_aceito_foco,
    case when p.termo_aceito
         then 'TermosAceite_' || regexp_replace(p.cpf, '\D', '', 'g') || '.pdf'
    end,
    p.data_envio,
    p.data_aceite,
    p.data_recusa
from public.parceiros p
where (p.termo_aceito or coalesce(p.recusado, false) or p.data_envio is not null)
  and not exists (
      select 1 from public.documentos d
      where d.parceiro_id = p.id and d.tipo_documento = 'termo-lgpd'
  );
