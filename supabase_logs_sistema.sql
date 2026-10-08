-- ============================================================================
-- Logs do sistema (08/10/2026)
-- ============================================================================
-- Registro detalhado, por usuário, de acessos, consultas e alterações. Só o
-- Administrador SEBRAE (admin@sebrae.com.br) lê — tela logs.html.
--
-- Decisões do desenvolvedor: acessos = login, logout e cada tela aberta;
-- consultas = buscas no FOCO e PDFs abertos; guardar PARA SEMPRE; ações
-- automáticas do n8n entram como "Sistema"/"Cliente". O registro é IMUTÁVEL
-- (ninguém edita nem apaga — nem o Administrador SEBRAE).
--
-- Fontes:
--   * GATILHOS (origem 'banco') em parceiros, documentos, perfis_usuarios,
--     solicitacoes_senha e mensagens_whatsapp_usuarios — nada escapa, venha a
--     alteração da tela, do n8n ou de outro lugar. Guardam o "antes → depois".
--   * registrar_log_tela() (origem 'tela') — login, logout, tela aberta, busca
--     no FOCO, PDF aberto, troca de senha no Meu Perfil, sincronização de
--     contato com o FOCO. Só ações da lista branca, sempre em nome de quem chama.
--   * n8n_registrar_log() (origem 'n8n', só service_role) — avisos de senha
--     enviados pelo WhatsApp.
-- Senhas NUNCA são gravadas.
-- ============================================================================

create table if not exists public.logs_sistema (
    id            bigint generated always as identity primary key,
    criado_em     timestamptz not null default now(),
    usuario_id    uuid,
    usuario_nome  text,
    usuario_email text,
    ator          text not null default 'usuario'
                  check (ator in ('usuario', 'sistema', 'cliente', 'anonimo')),
    categoria     text not null,
    acao          text not null,
    descricao     text not null,
    entidade      text,
    entidade_id   text,
    dados         jsonb,
    origem        text not null default 'banco' check (origem in ('tela', 'banco', 'n8n')),
    ip            text,
    user_agent    text
);

create index if not exists logs_sistema_criado_em_idx  on public.logs_sistema (criado_em desc);
create index if not exists logs_sistema_usuario_idx    on public.logs_sistema (usuario_id, criado_em desc);
create index if not exists logs_sistema_categoria_idx  on public.logs_sistema (categoria, criado_em desc);
create index if not exists logs_sistema_entidade_idx   on public.logs_sistema (entidade, entidade_id);

-- Quem lê: só o Administrador SEBRAE ativo
create or replace function public.pode_ver_logs()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1 from public.perfis_usuarios
         where id = auth.uid()
           and role = 'admin'
           and ativo = true
           and lower(email) = 'admin@sebrae.com.br');
$$;

alter table public.logs_sistema enable row level security;
drop policy if exists pol_select_logs on public.logs_sistema;
create policy pol_select_logs on public.logs_sistema
    for select to authenticated using (public.pode_ver_logs());
revoke all on public.logs_sistema from anon, authenticated;
grant select on public.logs_sistema to authenticated;

-- Imutável
create or replace function public._logs_imutaveis()
returns trigger
language plpgsql
as $$
begin
    raise exception 'O log do sistema não pode ser alterado nem apagado.';
end;
$$;

drop trigger if exists trg_logs_imutaveis on public.logs_sistema;
create trigger trg_logs_imutaveis
    before update or delete on public.logs_sistema
    for each row execute function public._logs_imutaveis();

drop trigger if exists trg_logs_sem_truncate on public.logs_sistema;
create trigger trg_logs_sem_truncate
    before truncate on public.logs_sistema
    for each statement execute function public._logs_imutaveis();

-- ---------------------------------------------------------------------------
-- Núcleo: grava uma linha (nome/e-mail do usuário + IP/navegador da requisição)
-- ---------------------------------------------------------------------------
create or replace function public._log_inserir(
    p_usuario_id uuid, p_ator text, p_categoria text, p_acao text, p_descricao text,
    p_entidade text default null, p_entidade_id text default null,
    p_dados jsonb default null, p_origem text default 'banco')
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_nome    text;
    v_email   text;
    v_headers jsonb;
begin
    if p_usuario_id is not null then
        select nome_completo, email into v_nome, v_email
          from public.perfis_usuarios where id = p_usuario_id;
    end if;
    begin
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        v_headers := null;
    end;

    insert into public.logs_sistema
        (usuario_id, usuario_nome, usuario_email, ator, categoria, acao, descricao,
         entidade, entidade_id, dados, origem, ip, user_agent)
    values
        (p_usuario_id, v_nome, v_email, p_ator, p_categoria, p_acao, left(p_descricao, 1000),
         p_entidade, p_entidade_id, p_dados, p_origem,
         nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), ''),
         left(v_headers->>'user-agent', 300));
end;
$$;

revoke all on function public._log_inserir(uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;

-- "Antes → depois" só dos campos que mudaram, menos os ignorados
create or replace function public._log_diff(p_antes jsonb, p_depois jsonb, p_ignorar text[])
returns jsonb
language sql
immutable
as $$
    select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', p_antes -> k, 'depois', p_depois -> k)), '{}'::jsonb)
      from (select jsonb_object_keys(coalesce(p_antes, '{}'::jsonb) || coalesce(p_depois, '{}'::jsonb)) k) c
     where not (k = any(p_ignorar))
       and (p_antes -> k) is distinct from (p_depois -> k);
$$;

-- ---------------------------------------------------------------------------
-- Gatilho: parceiros (clientes)
-- ---------------------------------------------------------------------------
create or replace function public._log_parceiros()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_uid  uuid := auth.uid();
    v_ator text := case when auth.uid() is null then 'sistema' else 'usuario' end;
    v_diff jsonb;
    v_quem text := case when auth.uid() is null then ' pelo sistema' else '' end;
begin
    if tg_op = 'INSERT' then
        perform public._log_inserir(v_uid, v_ator, 'cliente', 'cliente_criado',
            format('Cliente cadastrado: %s (CPF %s)%s', new.nome_razao_social, new.cpf, v_quem),
            'parceiros', new.id::text, jsonb_build_object('registro', to_jsonb(new) - 'assinatura_digital'));
    elsif tg_op = 'UPDATE' then
        v_diff := public._log_diff(to_jsonb(old), to_jsonb(new), array['updated_at']);
        if v_diff = '{}'::jsonb then return new; end if;
        perform public._log_inserir(v_uid, v_ator, 'cliente', 'cliente_alterado',
            format('Cliente alterado: %s (CPF %s)%s — %s', new.nome_razao_social, new.cpf, v_quem,
                   (select string_agg(k, ', ') from jsonb_object_keys(v_diff) k)),
            'parceiros', new.id::text, jsonb_build_object('alteracoes', v_diff));
    else
        perform public._log_inserir(v_uid, v_ator, 'cliente', 'cliente_excluido',
            format('Cliente EXCLUÍDO: %s (CPF %s)%s', old.nome_razao_social, old.cpf, v_quem),
            'parceiros', old.id::text, jsonb_build_object('registro', to_jsonb(old) - 'assinatura_digital'));
    end if;
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_parceiros on public.parceiros;
create trigger trg_log_parceiros
    after insert or update or delete on public.parceiros
    for each row execute function public._log_parceiros();

-- ---------------------------------------------------------------------------
-- Gatilho: documentos (termos)
-- ---------------------------------------------------------------------------
create or replace function public._log_documentos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_uid     uuid := auth.uid();
    v_cliente text;
    v_diff    jsonb;
    v_chaves  text[];
    v_acao    text;
    v_cat     text := 'termo';
    v_ator    text := case when auth.uid() is null then 'sistema' else 'usuario' end;
    v_desc    text;
    v_doc     public.documentos%rowtype := coalesce(new, old);
begin
    select nome_razao_social into v_cliente from public.parceiros where id = v_doc.parceiro_id;
    v_cliente := coalesce(v_cliente, 'cliente removido');

    if tg_op = 'INSERT' then
        perform public._log_inserir(v_uid, v_ator, 'termo', 'termo_gerado',
            format('Termo gerado: %s — cliente %s', new.nome_documento, v_cliente),
            'documentos', new.id::text,
            jsonb_build_object('parceiro_id', new.parceiro_id, 'tipo', new.tipo_documento,
                               'status', new.status, 'dados_formulario', new.dados_formulario));
        return new;
    end if;

    if tg_op = 'DELETE' then
        perform public._log_inserir(v_uid, v_ator, 'termo', 'termo_excluido',
            format('Termo EXCLUÍDO: %s (status %s) — cliente %s', old.nome_documento, old.status, v_cliente),
            'documentos', old.id::text,
            jsonb_build_object('parceiro_id', old.parceiro_id, 'registro', to_jsonb(old) - 'html_documento'));
        return old;
    end if;

    -- UPDATE
    v_diff := public._log_diff(to_jsonb(old) - 'html_documento', to_jsonb(new) - 'html_documento', array['updated_at']);
    if old.html_documento is distinct from new.html_documento then
        v_diff := v_diff || jsonb_build_object('html_documento', jsonb_build_object('antes', '(texto anterior)', 'depois', '(texto novo)'));
    end if;
    if v_diff = '{}'::jsonb then return new; end if;
    select array_agg(k) into v_chaves from jsonb_object_keys(v_diff) k;

    if new.status is distinct from old.status then
        if new.status = 'enviado' then
            v_acao := 'termo_enviado';
            v_desc := format('Termo enviado ao cliente: %s — cliente %s (resposta %s)', new.nome_documento, v_cliente, coalesce(new.codigo_resposta, '—'));
        elsif new.status = 'aceito' then
            v_acao := 'termo_aceito';
            if v_uid is null then v_ator := 'cliente'; end if;
            v_desc := format('Cliente ACEITOU o termo: %s — cliente %s (resposta "%s")', new.nome_documento, v_cliente, coalesce(new.resposta_texto, '—'));
        elsif new.status in ('nao_aceito', 'recusado') then
            v_acao := 'termo_recusado';
            if v_uid is null then v_ator := 'cliente'; end if;
            v_desc := format('Cliente RECUSOU o termo: %s — cliente %s (resposta "%s")', new.nome_documento, v_cliente, coalesce(new.resposta_texto, '—'));
        else
            v_acao := 'termo_alterado';
            v_desc := format('Termo voltou para "%s": %s — cliente %s', new.status, new.nome_documento, v_cliente);
        end if;
    elsif new.salvo_foco is distinct from old.salvo_foco and new.salvo_foco then
        v_acao := 'termo_anexado_foco';
        v_cat  := 'foco';
        v_desc := format('PDF do termo anexado no FOCO: %s — cliente %s', new.nome_documento, v_cliente);
    elsif v_chaves <@ array['data_envio', 'codigo_resposta', 'whatsapp_message_id'] then
        if v_uid is not null then return new; end if;   -- carimbo da própria tela logo após o envio
        v_acao := 'termo_whatsapp_enviado';
        v_cat  := 'whatsapp';
        v_desc := format('PDF do termo enviado ao WhatsApp do cliente: %s — cliente %s', new.nome_documento, v_cliente);
    else
        v_acao := 'termo_alterado';
        v_desc := format('Termo alterado: %s — cliente %s — %s', new.nome_documento, v_cliente, array_to_string(v_chaves, ', '));
    end if;

    if v_ator = 'sistema' and v_acao in ('termo_alterado') then
        v_desc := v_desc || ' (pelo sistema)';
    end if;

    perform public._log_inserir(v_uid, v_ator, v_cat, v_acao, v_desc, 'documentos', new.id::text,
        jsonb_build_object('parceiro_id', new.parceiro_id, 'alteracoes', v_diff));
    return new;
end;
$$;

drop trigger if exists trg_log_documentos on public.documentos;
create trigger trg_log_documentos
    after insert or update or delete on public.documentos
    for each row execute function public._log_documentos();

-- ---------------------------------------------------------------------------
-- Gatilho: perfis_usuarios (usuários do sistema)
-- ---------------------------------------------------------------------------
create or replace function public._log_perfis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_uid    uuid := auth.uid();
    v_ator   text := case when auth.uid() is null then 'sistema' else 'usuario' end;
    v_diff   jsonb;
    v_chaves text[];
    v_acao   text;
    v_cat    text := 'usuario';
    v_desc   text;
begin
    if tg_op = 'INSERT' then
        perform public._log_inserir(v_uid, v_ator, 'usuario', 'usuario_criado',
            format('Usuário criado: %s (%s, perfil %s)', new.nome_completo, new.email, new.role),
            'perfis_usuarios', new.id::text,
            jsonb_build_object('registro', to_jsonb(new) - 'ultimo_acesso'));
        return new;
    end if;
    if tg_op = 'DELETE' then
        perform public._log_inserir(v_uid, v_ator, 'usuario', 'usuario_excluido',
            format('Usuário EXCLUÍDO: %s (%s)', old.nome_completo, old.email),
            'perfis_usuarios', old.id::text, jsonb_build_object('registro', to_jsonb(old)));
        return old;
    end if;

    -- O "último acesso" muda a cada tela: não é alteração de cadastro
    v_diff := public._log_diff(to_jsonb(old), to_jsonb(new),
        array['updated_at', 'updated_by', 'ultimo_acesso', 'whatsapp_digitos']);
    if v_diff = '{}'::jsonb then return new; end if;
    select array_agg(k) into v_chaves from jsonb_object_keys(v_diff) k;

    if 'senha_temporaria' = any(v_chaves) and new.senha_temporaria and v_uid is distinct from new.id then
        v_acao := 'senha_redefinida'; v_cat := 'senha';
        v_desc := format('Senha de %s (%s) redefinida — senha temporária, troca obrigatória no próximo acesso', new.nome_completo, new.email);
    elsif 'senha_temporaria' = any(v_chaves) and not new.senha_temporaria then
        v_acao := 'senha_temporaria_trocada'; v_cat := 'senha';
        v_desc := format('%s criou a senha pessoal (troca da senha temporária)', new.nome_completo);
    elsif 'ativo' = any(v_chaves) then
        v_acao := case when new.ativo then 'usuario_ativado' else 'usuario_desativado' end;
        v_desc := format('Usuário %s: %s (%s)%s', case when new.ativo then 'ATIVADO' else 'DESATIVADO' end,
                         new.nome_completo, new.email,
                         case when not new.ativo and new.motivo_desativacao is not null then ' — motivo: ' || new.motivo_desativacao else '' end);
    elsif 'role' = any(v_chaves) then
        v_acao := 'usuario_perfil_alterado';
        v_desc := format('Perfil de acesso de %s alterado: %s → %s', new.nome_completo, old.role, new.role);
    elsif 'gere_senhas' = any(v_chaves) then
        v_acao := 'usuario_gestor_senhas'; v_cat := 'senha';
        v_desc := format('%s %s a função "cuidar de senhas"', new.nome_completo, case when new.gere_senhas then 'recebeu' else 'perdeu' end);
    elsif 'whatsapp' = any(v_chaves) then
        v_acao := 'usuario_whatsapp_alterado';
        v_desc := format('WhatsApp de %s alterado: %s → %s', new.nome_completo, coalesce(old.whatsapp, '(vazio)'), coalesce(new.whatsapp, '(vazio)'));
    elsif 'foto_url' = any(v_chaves) then
        v_acao := 'usuario_foto_alterada';
        v_desc := format('Foto de %s alterada', new.nome_completo);
    else
        v_acao := 'usuario_alterado';
        v_desc := format('Usuário alterado: %s — %s', new.nome_completo, array_to_string(v_chaves, ', '));
    end if;

    perform public._log_inserir(v_uid, v_ator, v_cat, v_acao, v_desc, 'perfis_usuarios', new.id::text,
        jsonb_build_object('alteracoes', v_diff));
    return new;
end;
$$;

drop trigger if exists trg_log_perfis on public.perfis_usuarios;
create trigger trg_log_perfis
    after insert or update or delete on public.perfis_usuarios
    for each row execute function public._log_perfis();

-- ---------------------------------------------------------------------------
-- Gatilho: solicitacoes_senha ("Esqueci minha senha")
-- ---------------------------------------------------------------------------
create or replace function public._log_solicitacoes_senha()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_nome text;
begin
    select nome_completo into v_nome from public.perfis_usuarios where id = new.perfil_id;
    if tg_op = 'INSERT' then
        -- Pedido feito na tela de login, sem sessão: registrado em nome de quem pediu
        perform public._log_inserir(new.perfil_id, 'anonimo', 'senha', 'senha_pedido',
            format('%s (%s) pediu redefinição de senha ("Esqueci minha senha")', coalesce(v_nome, '?'), new.email),
            'solicitacoes_senha', new.id::text, null);
    end if;
    return new;
end;
$$;

drop trigger if exists trg_log_solicitacoes_senha on public.solicitacoes_senha;
create trigger trg_log_solicitacoes_senha
    after insert on public.solicitacoes_senha
    for each row execute function public._log_solicitacoes_senha();

-- ---------------------------------------------------------------------------
-- Gatilho: mensagens_whatsapp_usuarios (admin → usuário)
-- ---------------------------------------------------------------------------
create or replace function public._log_mensagens_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if new.status is distinct from old.status and new.status in ('enviada', 'falha') then
        perform public._log_inserir(new.remetente_id, 'usuario', 'whatsapp',
            case when new.status = 'enviada' then 'whatsapp_mensagem_enviada' else 'whatsapp_mensagem_falha' end,
            format('%s mensagem pelo WhatsApp para %s (%s)',
                   case when new.status = 'enviada' then 'Enviou' else 'FALHA ao enviar' end,
                   new.destinatario_nome, new.destinatario_whatsapp),
            'mensagens_whatsapp_usuarios', new.id::text,
            jsonb_build_object('destinatario_id', new.destinatario_id, 'texto', new.texto, 'erro', new.erro));
    end if;
    return new;
end;
$$;

drop trigger if exists trg_log_mensagens_whatsapp on public.mensagens_whatsapp_usuarios;
create trigger trg_log_mensagens_whatsapp
    after update on public.mensagens_whatsapp_usuarios
    for each row execute function public._log_mensagens_whatsapp();

-- ---------------------------------------------------------------------------
-- Eventos da tela (login, logout, tela aberta, consultas...)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_log_tela(
    p_acao text, p_descricao text,
    p_entidade text default null, p_entidade_id text default null, p_dados jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_uid  uuid := auth.uid();
    v_cat  text;
    v_desc text := left(btrim(coalesce(p_descricao, '')), 500);
    v_nome text;
    v_path text;
begin
    -- Só usuários do Termos URC (o login é compartilhado com outros sistemas)
    if v_uid is null or not exists (select 1 from public.perfis_usuarios where id = v_uid) then
        return;
    end if;

    v_cat := case p_acao
        when 'login'                   then 'acesso'
        when 'logout'                  then 'acesso'
        when 'tela_aberta'             then 'acesso'
        when 'busca_foco'              then 'consulta'
        when 'pdf_aberto'              then 'consulta'
        when 'senha_alterada'          then 'senha'
        when 'foco_contato_atualizado' then 'foco'
        when 'foco_contato_falha'      then 'foco'
        else null end;
    if v_cat is null then
        raise exception 'Ação de log não permitida: %', p_acao;
    end if;

    -- Completa a descrição com o nome do cliente / termo (o front manda só o id)
    if p_entidade = 'parceiros' and p_entidade_id ~ '^[0-9a-f-]{36}$' then
        select nome_razao_social into v_nome from public.parceiros where id = p_entidade_id::uuid;
        if v_nome is not null then v_desc := v_desc || ' — cliente ' || v_nome; end if;
    end if;
    if p_acao = 'pdf_aberto' then
        v_path := p_dados->>'path';
        select d.nome_documento || ' — cliente ' || p.nome_razao_social into v_nome
          from public.documentos d join public.parceiros p on p.id = d.parceiro_id
         where d.arquivo_path = v_path
         limit 1;
        if v_nome is not null then v_desc := v_desc || ': ' || v_nome; end if;
    end if;

    perform public._log_inserir(v_uid, 'usuario', v_cat, p_acao, coalesce(nullif(v_desc, ''), p_acao),
        p_entidade, p_entidade_id, p_dados, 'tela');
end;
$$;

revoke all on function public.registrar_log_tela(text, text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_log_tela(text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Eventos do n8n (avisos de senha pelo WhatsApp) — só service_role
-- ---------------------------------------------------------------------------
create or replace function public.n8n_registrar_log(
    p_acao text, p_descricao text, p_usuario_id uuid default null,
    p_entidade text default null, p_entidade_id text default null, p_dados jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if nullif(btrim(coalesce(p_descricao, '')), '') is null then
        return;   -- nada a registrar (ex.: webhook chamado sem pedido real)
    end if;
    perform public._log_inserir(p_usuario_id, case when p_usuario_id is null then 'sistema' else 'usuario' end,
        'whatsapp', coalesce(p_acao, 'whatsapp_aviso'), p_descricao, p_entidade, p_entidade_id, p_dados, 'n8n');
end;
$$;

revoke all on function public.n8n_registrar_log(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.n8n_registrar_log(text, text, uuid, text, text, jsonb) to service_role;

-- aviso_senha_redefinida passa a devolver também o id do gestor (para o log do n8n)
create or replace function public.aviso_senha_redefinida(p_usuario uuid, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
declare
    v_alvo   public.perfis_usuarios%rowtype;
    v_gestor text;
    v_hash   text;
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente um gestor de senhas.';
    end if;

    select * into v_alvo from public.perfis_usuarios where id = p_usuario;
    if v_alvo.id is null
       or not v_alvo.senha_temporaria
       or v_alvo.updated_by is distinct from auth.uid()
       or v_alvo.updated_at < now() - interval '15 minutes' then
        raise exception 'Nenhuma redefinição recente deste usuário feita por você.';
    end if;

    select encrypted_password into v_hash from auth.users where id = p_usuario;
    if v_hash is null or extensions.crypt(coalesce(p_senha, ''), v_hash) <> v_hash then
        raise exception 'A senha informada não confere com a senha temporária gravada.';
    end if;

    select nome_completo into v_gestor from public.perfis_usuarios where id = auth.uid();

    return jsonb_build_object(
        'usuario', jsonb_build_object(
            'id', v_alvo.id,
            'nome', v_alvo.nome_completo,
            'email', v_alvo.email,
            'whatsapp', v_alvo.whatsapp,
            'remote_jid', case when v_alvo.whatsapp_digitos is null then null
                               else coalesce(v_alvo.whatsapp_jid, '55' || v_alvo.whatsapp_digitos) end),
        'gestor', jsonb_build_object('id', auth.uid(), 'nome', v_gestor),
        'outros_gestores', public._gestores_senhas_whatsapp(array[auth.uid(), p_usuario])
    );
end;
$$;

-- n8n_aviso_pedido_senha passa a devolver o id do usuário (para o log do n8n)
create or replace function public.n8n_aviso_pedido_senha(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sol   public.solicitacoes_senha%rowtype;
    v_nome  text;
begin
    update public.solicitacoes_senha
       set notificado_em = now()
     where id = (
            select id from public.solicitacoes_senha
             where lower(email) = lower(trim(coalesce(p_email, '')))
               and status = 'pendente'
               and notificado_em is null
               and criado_em > now() - interval '15 minutes'
             order by criado_em desc
             limit 1)
    returning * into v_sol;

    if v_sol.id is null then
        return jsonb_build_object('enviar', false, 'motivo', 'sem pedido novo', 'gestores', '[]'::jsonb);
    end if;

    select nome_completo into v_nome from public.perfis_usuarios where id = v_sol.perfil_id;

    return jsonb_build_object(
        'enviar', true,
        'usuario', jsonb_build_object('id', v_sol.perfil_id, 'nome', v_nome, 'email', v_sol.email),
        'gestores', public._gestores_senhas_whatsapp(array[v_sol.perfil_id])
    );
end;
$$;
