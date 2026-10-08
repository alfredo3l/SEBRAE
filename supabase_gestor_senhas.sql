-- ============================================
-- Gestor de senhas = só o Administrador SEBRAE (06/10/2026)
-- Decisão do desenvolvedor: apenas admin@sebrae.com.br (o "admin principal",
-- já tratado assim no front: coroa, não pode ser desativado) redefine senhas,
-- lê os pedidos do "Esqueci minha senha" e vincula conta existente de outro
-- sistema (que também troca a senha). Os demais admins mantêm todo o resto.
-- Se ELE esquecer a senha: o pedido fica registrado e o desenvolvedor
-- redefine direto no banco (Management API) — não há outro gestor.
-- ============================================

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
           and lower(email) = 'admin@sebrae.com.br'
           and role = 'admin'
           and ativo = true
    );
$$;

revoke all on function public.pode_gerir_senhas() from public, anon;
grant execute on function public.pode_gerir_senhas() to authenticated;

-- Pedidos do "Esqueci minha senha": só o gestor lê
drop policy if exists pol_select_solicitacoes_senha on public.solicitacoes_senha;
create policy pol_select_solicitacoes_senha on public.solicitacoes_senha
    for select to authenticated using (public.pode_gerir_senhas());

-- Redefinir senha: só o gestor (antes: qualquer admin)
create or replace function public.admin_redefinir_senha(p_usuario uuid, p_nova_senha text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente o Administrador SEBRAE pode redefinir senhas.';
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

-- Criar usuário: qualquer admin cria com e-mail novo; VINCULAR conta existente
-- (que troca a senha dela, também no outro sistema) só o gestor
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
            RAISE EXCEPTION 'Este e-mail já tem acesso a outro sistema; somente o Administrador SEBRAE pode vincular essa conta.';
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
