-- ============================================
-- Gestores de senhas delegados (08/10/2026)
-- Até aqui só o administrador principal (admin@sebrae.com.br) cuidava de
-- senhas. Agora ele pode delegar a função a outros ADMINISTRADORES (marca
-- perfis_usuarios.gere_senhas). Decisões do desenvolvedor:
--   * só administradores recebem a função (perde-a ao deixar de ser admin
--     ativo — pode_gerir_senhas() exige role admin + ativo);
--   * qualquer gestor de senhas (principal ou delegado) concede e retira a
--     função de outros administradores (definir_gestor_senhas);
--   * ninguém redefine pela tela a senha do PRINCIPAL — só o desenvolvedor,
--     pelo banco (evita que um delegado assuma a conta principal).
-- A marca só muda pela função: um gatilho barra a alteração direta (a RLS
-- de perfis_usuarios deixa qualquer admin dar UPDATE na tabela).
-- ============================================

alter table public.perfis_usuarios
    add column if not exists gere_senhas     boolean not null default false,
    add column if not exists gere_senhas_por uuid,
    add column if not exists gere_senhas_em  timestamptz;

-- Principal OU administrador ativo com a marca
create or replace function public.pode_gerir_senhas()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1
          from public.perfis_usuarios
         where id = auth.uid()
           and role = 'admin'
           and ativo = true
           and (lower(email) = 'admin@sebrae.com.br' or gere_senhas)
    );
$$;

-- A marca só muda por definir_gestor_senhas (que liga app.definir_gestor_senhas
-- na transação). Sem usuário logado (administração do banco) passa.
create or replace function public.perfis_proteger_gere_senhas()
returns trigger
language plpgsql
as $$
begin
    if (new.gere_senhas, new.gere_senhas_por, new.gere_senhas_em)
       is distinct from (old.gere_senhas, old.gere_senhas_por, old.gere_senhas_em)
       and auth.uid() is not null
       and coalesce(current_setting('app.definir_gestor_senhas', true), '') <> 'on' then
        raise exception 'A função "cuidar de senhas" só pode ser alterada por um gestor de senhas.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_perfis_proteger_gere_senhas on public.perfis_usuarios;
create trigger trg_perfis_proteger_gere_senhas
    before update on public.perfis_usuarios
    for each row execute function public.perfis_proteger_gere_senhas();

-- Conceder / retirar a função (qualquer gestor de senhas)
create or replace function public.definir_gestor_senhas(p_usuario uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_alvo public.perfis_usuarios%rowtype;
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente um gestor de senhas pode conceder ou retirar esta função.';
    end if;

    select * into v_alvo from public.perfis_usuarios where id = p_usuario;
    if not found then
        raise exception 'Usuário não encontrado neste sistema.';
    end if;

    if lower(v_alvo.email) = 'admin@sebrae.com.br' then
        raise exception 'O administrador principal sempre cuida de senhas; a função dele não pode ser alterada.';
    end if;

    if coalesce(p_valor, false) and not (v_alvo.role = 'admin' and v_alvo.ativo) then
        raise exception 'Somente administradores ativos podem receber a função de cuidar de senhas.';
    end if;

    perform set_config('app.definir_gestor_senhas', 'on', true);
    update public.perfis_usuarios
       set gere_senhas     = coalesce(p_valor, false),
           gere_senhas_por = auth.uid(),
           gere_senhas_em  = now(),
           updated_at      = now(),
           updated_by      = auth.uid()
     where id = p_usuario;
    perform set_config('app.definir_gestor_senhas', '', true);
end;
$$;

revoke all on function public.definir_gestor_senhas(uuid, boolean) from public, anon;
grant execute on function public.definir_gestor_senhas(uuid, boolean) to authenticated;

-- Redefinir senha: qualquer gestor; a do PRINCIPAL só pelo banco
create or replace function public.admin_redefinir_senha(p_usuario uuid, p_nova_senha text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente um gestor de senhas pode redefinir senhas.';
    end if;

    if p_usuario = auth.uid() then
        raise exception 'Para alterar a sua própria senha, use o "Meu Perfil".';
    end if;

    -- Só usuários do Termos URC (o login é compartilhado com outros sistemas)
    if not exists (select 1 from public.perfis_usuarios where id = p_usuario) then
        raise exception 'Usuário não encontrado neste sistema.';
    end if;

    if exists (select 1 from public.perfis_usuarios where id = p_usuario and lower(email) = 'admin@sebrae.com.br') then
        raise exception 'A senha do administrador principal só pode ser redefinida pelo suporte técnico.';
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

-- admin_criar_usuario: mesma versão de supabase_gestor_senhas.sql (o vínculo já
-- exige pode_gerir_senhas(), que agora inclui os delegados); muda só a mensagem.
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
    -- vincula a conta existente em vez de criar outra — só o gestor de senhas
    SELECT id INTO v_existente
    FROM auth.users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
        IF NOT public.pode_gerir_senhas() THEN
            RAISE EXCEPTION 'Este e-mail já tem acesso a outro sistema; somente um gestor de senhas pode vincular essa conta.';
        END IF;

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
