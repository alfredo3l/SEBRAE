-- ============================================
-- Redefinição de senha pelo admin + "Esqueci minha senha" (06/10/2026)
-- Itens 9 e 10 do SEBRAE. Sem e-mail: o Supabase deste projeto não tem SMTP
-- próprio e o login é compartilhado com outros sistemas — nada aqui mexe em
-- configuração de Auth, e-mail ou modelos.
--
--  * admin_redefinir_senha  → admin define senha temporária (só usuários do
--                             Termos URC), encerra as sessões do usuário e
--                             marca perfis_usuarios.senha_temporaria
--  * trocar_senha_temporaria → no 1º acesso o próprio usuário troca a senha
--                             temporária (validado no servidor)
--  * solicitar_redefinicao_senha → "Esqueci minha senha" da tela de login
--                             (sem login; não revela se o e-mail existe)
--  * admin_criar_usuario    → usuário novo também nasce com senha temporária
-- Nada é apagado: as solicitações ficam como histórico.
-- ============================================

-- 1. Marca de senha temporária (só usuários criados/redefinidos daqui em diante)
alter table public.perfis_usuarios
    add column if not exists senha_temporaria boolean not null default false;

-- 2. Solicitações do "Esqueci minha senha" (histórico; só admin lê)
create table if not exists public.solicitacoes_senha (
    id            uuid primary key default gen_random_uuid(),
    perfil_id     uuid references public.perfis_usuarios(id) on delete set null,
    email         text not null,
    status        text not null default 'pendente' check (status in ('pendente', 'atendida')),
    criado_em     timestamptz not null default now(),
    atendida_por  uuid,
    atendida_em   timestamptz
);

-- No máximo uma solicitação pendente por usuário (evita spam pela tela de login)
create unique index if not exists uq_solicitacoes_senha_pendente
    on public.solicitacoes_senha (perfil_id) where status = 'pendente';

alter table public.solicitacoes_senha enable row level security;

drop policy if exists pol_select_solicitacoes_senha on public.solicitacoes_senha;
create policy pol_select_solicitacoes_senha on public.solicitacoes_senha
    for select to authenticated using (public.is_admin());
-- Sem policy de insert/update/delete: só as funções abaixo escrevem.

revoke all on public.solicitacoes_senha from anon;

-- 3. Admin redefine a senha (senha temporária)
create or replace function public.admin_redefinir_senha(p_usuario uuid, p_nova_senha text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
begin
    if not public.is_admin() then
        raise exception 'Acesso negado: somente administradores podem redefinir senhas.';
    end if;

    if p_usuario = auth.uid() then
        raise exception 'Para alterar a sua própria senha, use o "Meu Perfil".';
    end if;

    -- Só usuários do Termos URC (o login é compartilhado com outros sistemas)
    if not exists (select 1 from public.perfis_usuarios where id = p_usuario) then
        raise exception 'Usuário não encontrado neste sistema.';
    end if;

    if p_nova_senha is null or length(p_nova_senha) < 8 then
        raise exception 'A senha temporária deve ter no mínimo 8 caracteres.';
    end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf')),
           updated_at         = now()
     where id = p_usuario;

    -- Encerra as sessões abertas: o usuário precisa entrar com a senha nova
    delete from auth.refresh_tokens where user_id = p_usuario::text;
    delete from auth.sessions       where user_id = p_usuario;

    update public.perfis_usuarios
       set senha_temporaria = true,
           updated_at       = now(),
           updated_by       = auth.uid()
     where id = p_usuario;

    -- Atende o "Esqueci minha senha" pendente desse usuário, se houver
    update public.solicitacoes_senha
       set status       = 'atendida',
           atendida_por = auth.uid(),
           atendida_em  = now()
     where perfil_id = p_usuario
       and status    = 'pendente';
end;
$$;

revoke all on function public.admin_redefinir_senha(uuid, text) from public, anon;
grant execute on function public.admin_redefinir_senha(uuid, text) to authenticated;

-- 4. Primeiro acesso: o próprio usuário troca a senha temporária
create or replace function public.trocar_senha_temporaria(p_nova_senha text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
declare
    v_uid  uuid := auth.uid();
    v_hash text;
begin
    if v_uid is null then
        raise exception 'Sessão inválida. Entre novamente.';
    end if;

    if not exists (select 1 from public.perfis_usuarios where id = v_uid and senha_temporaria) then
        raise exception 'Não há senha temporária a trocar. Para alterar a senha, use o "Meu Perfil".';
    end if;

    if p_nova_senha is null or length(p_nova_senha) < 8 then
        raise exception 'A nova senha deve ter no mínimo 8 caracteres.';
    end if;

    select encrypted_password into v_hash from auth.users where id = v_uid;
    if v_hash is not null and v_hash = extensions.crypt(p_nova_senha, v_hash) then
        raise exception 'A nova senha deve ser diferente da senha temporária.';
    end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf')),
           updated_at         = now()
     where id = v_uid;

    update public.perfis_usuarios
       set senha_temporaria = false,
           updated_at       = now()
     where id = v_uid;
end;
$$;

revoke all on function public.trocar_senha_temporaria(text) from public, anon;
grant execute on function public.trocar_senha_temporaria(text) to authenticated;

-- 5. "Esqueci minha senha" (tela de login, sem sessão)
-- Não revela se o e-mail existe: sempre termina sem erro. Só registra para
-- usuário ATIVO do Termos URC, e no máximo uma pendente por usuário.
create or replace function public.solicitar_redefinicao_senha(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_perfil uuid;
    v_email  text := lower(trim(coalesce(p_email, '')));
begin
    if v_email = '' or length(v_email) > 254 then
        return;
    end if;

    select id into v_perfil
      from public.perfis_usuarios
     where lower(email) = v_email
       and ativo = true;

    if v_perfil is null then
        return;
    end if;

    insert into public.solicitacoes_senha (perfil_id, email)
    values (v_perfil, v_email)
    on conflict (perfil_id) where status = 'pendente' do nothing;
end;
$$;

revoke all on function public.solicitar_redefinicao_senha(text) from public;
grant execute on function public.solicitar_redefinicao_senha(text) to anon, authenticated;

-- 6. Usuário novo nasce com senha temporária (troca obrigatória no 1º acesso).
-- Mesmo corpo da versão anterior; muda só o insert em perfis_usuarios.
create or replace function public.admin_criar_usuario(p_email text, p_senha text, p_nome_completo text, p_role user_role default 'visualizador'::user_role)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $function$
DECLARE
    v_novo_id UUID;
    v_instance_id UUID;
BEGIN
    -- Somente admin pode criar usuários
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: somente administradores podem criar usuários.';
    END IF;

    -- Verifica se o e-mail já existe em perfis_usuarios
    IF EXISTS (
        SELECT 1 FROM public.perfis_usuarios WHERE email = lower(p_email)
    ) THEN
        RAISE EXCEPTION 'Já existe um usuário com o e-mail informado.';
    END IF;

    -- Gera novo UUID para o usuário
    v_novo_id := gen_random_uuid();

    -- Obtém o instance_id do projeto
    SELECT instance_id INTO v_instance_id
    FROM auth.users
    LIMIT 1;

    -- Cria o usuário na tabela auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
    )
    VALUES (
        v_novo_id,
        v_instance_id,
        lower(p_email),
        extensions.crypt(p_senha, extensions.gen_salt('bf')),
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('nome', p_nome_completo),
        'authenticated',
        'authenticated',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    );

    -- Insere na tabela de perfis (senha inicial = temporária: troca no 1º acesso)
    INSERT INTO public.perfis_usuarios (
        id,
        email,
        nome_completo,
        role,
        ativo,
        created_by,
        senha_temporaria
    ) VALUES (
        v_novo_id,
        lower(p_email),
        p_nome_completo,
        p_role,
        TRUE,
        auth.uid(),
        TRUE
    );

    RETURN v_novo_id;
END;
$function$;
