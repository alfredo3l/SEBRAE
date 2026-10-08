-- ============================================
-- Autoria dos documentos (06/10/2026 — item 3 do SEBRAE)
-- Registro estilo log de QUEM gerou cada termo: preenchido pelo próprio banco
-- no INSERT (auth.uid() + snapshot de nome/e-mail do perfil) e imutável depois.
-- `consultor` (nome) continua existindo, mas é sobrescrito quando outro
-- usuário regera o documento — por isso não serve como log.
-- ============================================

alter table public.documentos
    add column if not exists criado_por        uuid,
    add column if not exists criado_por_nome   text,
    add column if not exists criado_por_email  text;

create index if not exists idx_documentos_criado_por on public.documentos (criado_por);

-- Preenche no INSERT a partir do usuário logado (front). Sem usuário
-- (service_role / n8n / Management API) mantém o que vier no registro.
create or replace function public.documentos_definir_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is not null then
        new.criado_por := v_uid;
        select u.nome_completo, u.email
          into new.criado_por_nome, new.criado_por_email
          from public.perfis_usuarios u
         where u.id = v_uid;
    end if;
    return new;
end;
$$;

-- Imutável: uma vez gravado, ninguém altera. O usuário logado também não
-- consegue "assumir" um registro antigo sem autor — só a administração do
-- banco (sem auth.uid(), ex.: o backfill abaixo) preenche autor vazio.
create or replace function public.documentos_preservar_autor()
returns trigger
language plpgsql
as $$
begin
    if old.criado_por is not null or auth.uid() is not null then
        new.criado_por       := old.criado_por;
        new.criado_por_nome  := old.criado_por_nome;
        new.criado_por_email := old.criado_por_email;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_documentos_definir_autor on public.documentos;
create trigger trg_documentos_definir_autor
    before insert on public.documentos
    for each row execute function public.documentos_definir_autor();

drop trigger if exists trg_documentos_preservar_autor on public.documentos;
create trigger trg_documentos_preservar_autor
    before update on public.documentos
    for each row execute function public.documentos_preservar_autor();

-- Backfill: documentos anteriores têm só o nome em `consultor`. Casa pelo
-- nome do perfil apenas quando ele é único (há homônimos em perfis_usuarios).
-- Os LGPD do backfill de 23/08 (consultor vazio) ficam sem autor.
update public.documentos d
   set criado_por       = u.id,
       criado_por_nome  = u.nome_completo,
       criado_por_email = u.email
  from public.perfis_usuarios u
 where d.criado_por is null
   and d.consultor = u.nome_completo
   and (select count(*) from public.perfis_usuarios u2 where u2.nome_completo = u.nome_completo) = 1;
