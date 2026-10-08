-- ============================================
-- Usuário cujo e-mail já existe no login compartilhado (06/10/2026)
-- O Supabase deste projeto tem UM cadastro de login (auth.users) para vários
-- sistemas (Termos URC, campanha, Indicadores Financeiros, pesagem de gado…):
-- mesmo e-mail = mesma conta = mesma senha. Criar "de novo" falhava com
-- unique violation (users_email_partial_key).
--
-- Decisão do desenvolvedor: VINCULAR a conta existente ao Termos URC e aplicar
-- a senha digitada como temporária — ela passa a valer também no outro
-- sistema, e no 1º acesso o usuário cria a nova senha (que vale para os dois).
-- O front avisa o admin ANTES de salvar (admin_email_em_outro_sistema).
-- ============================================

-- Marca de conta vinculada (compartilhada com outro sistema do login)
alter table public.perfis_usuarios
    add column if not exists conta_compartilhada boolean not null default false;

-- O e-mail já tem conta no login compartilhado, mas não no Termos URC?
create or replace function public.admin_email_em_outro_sistema(p_email text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
    if not public.is_admin() then
        raise exception 'Acesso negado: somente administradores.';
    end if;
    return exists (select 1 from auth.users u where lower(u.email) = lower(trim(p_email)))
       and not exists (select 1 from public.perfis_usuarios p where p.email = lower(trim(p_email)));
end;
$$;

revoke all on function public.admin_email_em_outro_sistema(text) from public, anon;
grant execute on function public.admin_email_em_outro_sistema(text) to authenticated;

-- Usuários do Termos URC cuja conta também acessa outro sistema: vinculados
-- por aqui (conta_compartilhada) ou presentes nas tabelas de perfil conhecidas
-- dos outros sistemas. Usado no aviso do "Redefinir senha" (a nova senha vale
-- para os dois). Tabelas consultadas só se existirem (to_regclass).
create or replace function public.admin_contas_compartilhadas()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_sql text := 'select p.id from public.perfis_usuarios p where p.conta_compartilhada';
begin
    if not public.is_admin() then
        raise exception 'Acesso negado: somente administradores.';
    end if;
    if to_regclass('campanha.profiles') is not null then
        v_sql := v_sql || ' or exists (select 1 from campanha.profiles x where x.id = p.id)';
    end if;
    if to_regclass('"Indicadores_Financeiros".profiles') is not null then
        v_sql := v_sql || ' or exists (select 1 from "Indicadores_Financeiros".profiles x where x.id = p.id)';
    end if;
    if to_regclass('pesagem_gado.usuario') is not null then
        v_sql := v_sql || ' or exists (select 1 from pesagem_gado.usuario x where x.id = p.id)';
    end if;
    return query execute v_sql;
end;
$$;

revoke all on function public.admin_contas_compartilhadas() from public, anon;
grant execute on function public.admin_contas_compartilhadas() to authenticated;

-- admin_criar_usuario: e-mail já existente no login → vincula a conta (aplica a
-- senha digitada como temporária e cria o perfil); senão, cria como antes.
create or replace function public.admin_criar_usuario(p_email text, p_senha text, p_nome_completo text, p_role user_role default 'visualizador'::user_role)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $function$
DECLARE
    v_novo_id UUID;
    v_instance_id UUID;
    v_existente UUID;
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

    IF p_senha IS NULL OR length(p_senha) < 8 THEN
        RAISE EXCEPTION 'A senha deve ter no mínimo 8 caracteres.';
    END IF;

    -- E-mail já tem conta no login compartilhado (outro sistema do projeto):
    -- vincula a conta existente em vez de criar outra
    SELECT id INTO v_existente
    FROM auth.users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
        UPDATE auth.users
           SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
               updated_at         = NOW()
         WHERE id = v_existente;

        INSERT INTO public.perfis_usuarios (
            id, email, nome_completo, role, ativo, created_by, senha_temporaria, conta_compartilhada
        ) VALUES (
            v_existente, lower(p_email), p_nome_completo, p_role, TRUE, auth.uid(), TRUE, TRUE
        );

        RETURN v_existente;
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
