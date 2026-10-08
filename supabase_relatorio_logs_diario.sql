-- ============================================================================
-- Relatório diário dos logs por WhatsApp (08/10/2026)
-- ============================================================================
-- Fluxo n8n [Termo URC - Relatorio Diario de Logs]: de segunda a sexta às 17:00
-- (horário de MS), exceto feriados nacionais, de MS (11/10) e de Campo Grande
-- (26/08), gera um PDF com os logs e envia aos destinatários cadastrados pelo
-- Administrador SEBRAE na tela Logs do Sistema.
--
-- Decisões do desenvolvedor: período = DESDE O RELATÓRIO ANTERIOR (17:00 do
-- último envio até 17:00 de hoje — o de segunda cobre o fim de semana);
-- conteúdo = resumo + eventos, com "tela aberta" só contada por usuário; dia
-- útil sem movimento também envia (avisando que não houve atividade).
-- ============================================================================

-- Destinatários (não precisam ser usuários do sistema)
create table if not exists public.relatorio_logs_destinatarios (
    id               uuid primary key default gen_random_uuid(),
    nome             text not null check (length(btrim(nome)) between 1 and 120),
    whatsapp         text not null check (length(regexp_replace(whatsapp, '\D', '', 'g')) in (10, 11)),
    whatsapp_jid     text,
    whatsapp_digitos text generated always as (regexp_replace(whatsapp, '\D', '', 'g')) stored,
    ativo            boolean not null default true,
    criado_em        timestamptz not null default now(),
    criado_por       uuid default auth.uid(),
    atualizado_em    timestamptz not null default now()
);
create unique index if not exists relatorio_logs_destinatarios_numero_idx
    on public.relatorio_logs_destinatarios (whatsapp_digitos);

alter table public.relatorio_logs_destinatarios enable row level security;
drop policy if exists pol_relatorio_destinatarios on public.relatorio_logs_destinatarios;
create policy pol_relatorio_destinatarios on public.relatorio_logs_destinatarios
    for all to authenticated using (public.pode_ver_logs()) with check (public.pode_ver_logs());
revoke all on public.relatorio_logs_destinatarios from anon;
grant select, insert, update, delete on public.relatorio_logs_destinatarios to authenticated;

create or replace function public._relatorio_destinatarios_atualizado()
returns trigger language plpgsql as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;
drop trigger if exists trg_relatorio_destinatarios_atualizado on public.relatorio_logs_destinatarios;
create trigger trg_relatorio_destinatarios_atualizado
    before update on public.relatorio_logs_destinatarios
    for each row execute function public._relatorio_destinatarios_atualizado();

-- Mudanças nos destinatários também vão para o log do sistema
create or replace function public._log_relatorio_destinatarios()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_diff jsonb;
begin
    if tg_op = 'INSERT' then
        perform public._log_inserir(auth.uid(), 'usuario', 'relatorio', 'relatorio_destinatario_incluido',
            format('Destinatário do relatório diário incluído: %s (%s)', new.nome, new.whatsapp),
            'relatorio_logs_destinatarios', new.id::text, null);
    elsif tg_op = 'UPDATE' then
        v_diff := public._log_diff(to_jsonb(old), to_jsonb(new), array['atualizado_em', 'whatsapp_digitos']);
        if v_diff = '{}'::jsonb then return new; end if;
        perform public._log_inserir(auth.uid(), 'usuario', 'relatorio',
            case when v_diff ? 'ativo' then case when new.ativo then 'relatorio_destinatario_ativado' else 'relatorio_destinatario_pausado' end
                 else 'relatorio_destinatario_alterado' end,
            format('Destinatário do relatório diário %s: %s (%s)',
                   case when v_diff ? 'ativo' then case when new.ativo then 'reativado' else 'pausado' end else 'alterado' end,
                   new.nome, new.whatsapp),
            'relatorio_logs_destinatarios', new.id::text, jsonb_build_object('alteracoes', v_diff));
    else
        perform public._log_inserir(auth.uid(), 'usuario', 'relatorio', 'relatorio_destinatario_excluido',
            format('Destinatário do relatório diário excluído: %s (%s)', old.nome, old.whatsapp),
            'relatorio_logs_destinatarios', old.id::text, null);
    end if;
    return coalesce(new, old);
end;
$$;
drop trigger if exists trg_log_relatorio_destinatarios on public.relatorio_logs_destinatarios;
create trigger trg_log_relatorio_destinatarios
    after insert or update or delete on public.relatorio_logs_destinatarios
    for each row execute function public._log_relatorio_destinatarios();

-- Histórico de envios (define o início do próximo período)
create table if not exists public.relatorio_logs_envios (
    id             bigint generated always as identity primary key,
    criado_em      timestamptz not null default now(),
    modo           text not null check (modo in ('agendado', 'manual')),
    periodo_inicio timestamptz not null,
    periodo_fim    timestamptz not null,
    total_eventos  integer not null default 0,
    destinatarios  integer not null default 0,
    enviados       integer not null default 0,
    detalhes       jsonb
);
alter table public.relatorio_logs_envios enable row level security;
drop policy if exists pol_relatorio_envios on public.relatorio_logs_envios;
create policy pol_relatorio_envios on public.relatorio_logs_envios
    for select to authenticated using (public.pode_ver_logs());
revoke all on public.relatorio_logs_envios from anon, authenticated;
grant select on public.relatorio_logs_envios to authenticated;

-- ---------------------------------------------------------------------------
-- Calendário: dia útil em MS
-- ---------------------------------------------------------------------------
create or replace function public.pascoa(p_ano integer)
returns date
language plpgsql
immutable
as $$
declare
    a int := p_ano % 19; b int := p_ano / 100; c int := p_ano % 100;
    d int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
    h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
    l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
    mes int := (h + l - 7 * m + 114) / 31; dia int := ((h + l - 7 * m + 114) % 31) + 1;
begin
    return make_date(p_ano, mes, dia);
end;
$$;

create or replace function public.feriado_ms(p_data date)
returns text
language sql
immutable
as $$
    select case
        when to_char(p_data, 'MM-DD') = '01-01' then 'Confraternização Universal'
        when to_char(p_data, 'MM-DD') = '04-21' then 'Tiradentes'
        when to_char(p_data, 'MM-DD') = '05-01' then 'Dia do Trabalho'
        when to_char(p_data, 'MM-DD') = '09-07' then 'Independência do Brasil'
        when to_char(p_data, 'MM-DD') = '10-12' then 'Nossa Senhora Aparecida'
        when to_char(p_data, 'MM-DD') = '11-02' then 'Finados'
        when to_char(p_data, 'MM-DD') = '11-15' then 'Proclamação da República'
        when to_char(p_data, 'MM-DD') = '11-20' then 'Dia Nacional de Zumbi e da Consciência Negra'
        when to_char(p_data, 'MM-DD') = '12-25' then 'Natal'
        when to_char(p_data, 'MM-DD') = '10-11' then 'Criação do Estado de Mato Grosso do Sul'
        when to_char(p_data, 'MM-DD') = '08-26' then 'Aniversário de Campo Grande'
        when p_data = public.pascoa(extract(year from p_data)::int) - 48 then 'Carnaval (segunda-feira)'
        when p_data = public.pascoa(extract(year from p_data)::int) - 47 then 'Carnaval (terça-feira)'
        when p_data = public.pascoa(extract(year from p_data)::int) - 2  then 'Sexta-feira Santa'
        when p_data = public.pascoa(extract(year from p_data)::int) + 60 then 'Corpus Christi'
        else null end;
$$;

create or replace function public.dia_util_ms(p_data date)
returns boolean
language sql
immutable
as $$
    select extract(isodow from p_data) between 1 and 5 and public.feriado_ms(p_data) is null;
$$;

-- ---------------------------------------------------------------------------
-- Montagem dos dados do relatório (resumo + eventos)
-- ---------------------------------------------------------------------------
create or replace function public._relatorio_logs_montar(p_ini timestamptz, p_fim timestamptz, p_modo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_limite constant int := 3000;
    v_dest   jsonb;
    v_total  int;
    v_res    jsonb;
begin
    select coalesce(jsonb_agg(jsonb_build_object(
               'nome', nome,
               'whatsapp', whatsapp,
               'remote_jid', coalesce(whatsapp_jid, '55' || whatsapp_digitos)) order by nome), '[]'::jsonb)
      into v_dest
      from public.relatorio_logs_destinatarios where ativo;

    select count(*) into v_total from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim;

    select jsonb_build_object(
        'executar', jsonb_array_length(v_dest) > 0,
        'motivo', case when jsonb_array_length(v_dest) = 0 then 'nenhum destinatário ativo' end,
        'modo', p_modo,
        'periodo_inicio', p_ini,
        'periodo_fim', p_fim,
        'destinatarios', v_dest,
        'totais', jsonb_build_object(
            'eventos', v_total,
            'usuarios', (select count(distinct usuario_id) from public.logs_sistema
                          where criado_em >= p_ini and criado_em < p_fim and usuario_id is not null and ator <> 'anonimo'),
            'logins', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'login'),
            'telas', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'tela_aberta'),
            'termos_gerados', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'termo_gerado'),
            'termos_enviados', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'termo_enviado'),
            'termos_aceitos', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'termo_aceito'),
            'termos_recusados', (select count(*) from public.logs_sistema where criado_em >= p_ini and criado_em < p_fim and acao = 'termo_recusado'),
            'por_categoria', coalesce((select jsonb_object_agg(categoria, n) from (
                select categoria, count(*) n from public.logs_sistema
                 where criado_em >= p_ini and criado_em < p_fim group by categoria) c), '{}'::jsonb)),
        'por_usuario', coalesce((select jsonb_agg(u order by (u->>'total')::int desc, u->>'nome') from (
            select jsonb_build_object(
                'nome', coalesce(max(usuario_nome), case max(ator) when 'sistema' then 'Sistema' when 'cliente' then 'Cliente (WhatsApp)' else 'Tela de login' end),
                'email', max(usuario_email),
                'logins', count(*) filter (where acao = 'login'),
                'telas', count(*) filter (where acao = 'tela_aberta'),
                'consultas', count(*) filter (where categoria = 'consulta'),
                'alteracoes', count(*) filter (where acao not in ('login', 'logout', 'tela_aberta') and categoria <> 'consulta'),
                'total', count(*)) u
              from public.logs_sistema
             where criado_em >= p_ini and criado_em < p_fim
             -- Pessoa = usuario_id (o pedido de senha "Tela de login" soma na pessoa que pediu);
             -- sem usuário = Sistema / Cliente (WhatsApp)
             group by coalesce(usuario_id::text, ator)) x), '[]'::jsonb),
        'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                'criado_em', criado_em,
                'quem', coalesce(usuario_nome, case ator when 'sistema' then 'Sistema' when 'cliente' then 'Cliente (WhatsApp)' else 'Tela de login' end),
                'ator', ator, 'categoria', categoria, 'acao', acao, 'descricao', descricao) order by criado_em, id)
            from (select * from public.logs_sistema
                   where criado_em >= p_ini and criado_em < p_fim and acao <> 'tela_aberta'
                   order by criado_em, id limit v_limite) e), '[]'::jsonb),
        'eventos_omitidos', greatest(0, (select count(*) from public.logs_sistema
                                          where criado_em >= p_ini and criado_em < p_fim and acao <> 'tela_aberta') - v_limite)
    ) into v_res;
    return v_res;
end;
$$;
revoke all on function public._relatorio_logs_montar(timestamptz, timestamptz, text) from public, anon, authenticated;

-- Agendado (n8n, service_role): só em dia útil; período desde o último envio agendado
create or replace function public.n8n_relatorio_logs_agendado()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_tz    constant text := 'America/Campo_Grande';
    v_hoje  date := (now() at time zone v_tz)::date;
    v_ini   timestamptz;
    v_fim   timestamptz := now();
begin
    if not public.dia_util_ms(v_hoje) then
        return jsonb_build_object('executar', false, 'modo', 'agendado',
            'motivo', 'não é dia útil (' || coalesce(public.feriado_ms(v_hoje), 'fim de semana') || ')');
    end if;
    select max(periodo_fim) into v_ini
      from public.relatorio_logs_envios where modo = 'agendado' and enviados > 0;
    v_ini := coalesce(v_ini, (v_hoje::timestamp) at time zone v_tz);
    return public._relatorio_logs_montar(v_ini, v_fim, 'agendado');
end;
$$;
revoke all on function public.n8n_relatorio_logs_agendado() from public, anon, authenticated;
grant execute on function public.n8n_relatorio_logs_agendado() to service_role;

-- Manual ("Enviar agora" da tela, token do Administrador SEBRAE): hoje 00:00 até agora
create or replace function public.relatorio_logs_manual()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_tz constant text := 'America/Campo_Grande';
begin
    if not public.pode_ver_logs() then
        raise exception 'Acesso negado: somente o Administrador SEBRAE.';
    end if;
    return public._relatorio_logs_montar(((now() at time zone v_tz)::date::timestamp) at time zone v_tz, now(), 'manual');
end;
$$;
revoke all on function public.relatorio_logs_manual() from public, anon;
grant execute on function public.relatorio_logs_manual() to authenticated;

-- Registro do envio (n8n, service_role) + linha no log do sistema
create or replace function public.n8n_registrar_envio_relatorio(
    p_modo text, p_periodo_inicio timestamptz, p_periodo_fim timestamptz,
    p_total_eventos integer, p_destinatarios integer, p_enviados integer, p_detalhes jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if p_modo is null or p_periodo_inicio is null or p_periodo_fim is null then
        return;   -- relatório não executado (fim de semana, feriado, sem destinatários)
    end if;
    insert into public.relatorio_logs_envios
        (modo, periodo_inicio, periodo_fim, total_eventos, destinatarios, enviados, detalhes)
    values (p_modo, p_periodo_inicio, p_periodo_fim, coalesce(p_total_eventos, 0),
            coalesce(p_destinatarios, 0), coalesce(p_enviados, 0), p_detalhes);
    perform public._log_inserir(null, 'sistema', 'relatorio',
        case when coalesce(p_enviados, 0) > 0 then 'relatorio_enviado' else 'relatorio_falha' end,
        format('Relatório %s de logs %s a %s de %s destinatário(s) — período %s a %s, %s evento(s)',
               case when p_modo = 'manual' then 'manual' else 'diário' end,
               case when coalesce(p_enviados, 0) > 0 then 'enviado' else 'NÃO enviado' end,
               coalesce(p_enviados, 0), coalesce(p_destinatarios, 0),
               to_char(p_periodo_inicio at time zone 'America/Campo_Grande', 'DD/MM HH24:MI'),
               to_char(p_periodo_fim at time zone 'America/Campo_Grande', 'DD/MM HH24:MI'),
               coalesce(p_total_eventos, 0)),
        'relatorio_logs_envios', null, p_detalhes, 'n8n');
end;
$$;
revoke all on function public.n8n_registrar_envio_relatorio(text, timestamptz, timestamptz, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.n8n_registrar_envio_relatorio(text, timestamptz, timestamptz, integer, integer, integer, jsonb) to service_role;
