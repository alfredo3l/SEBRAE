-- ============================================================
-- Relatório diário dos logs SEM as ações do Administrador SEBRAE (16/10/2026)
-- Decisão do desenvolvedor: os registros do admin@sebrae.com.br continuam
-- gravados em logs_sistema (nada é apagado), mas o relatório por WhatsApp
-- (agendado e "Enviar agora") nunca os inclui. Conta como "do administrador"
-- só o que ele FEZ (autor do registro); ações de outros sobre o cadastro dele
-- continuam no relatório.
-- ============================================================

-- Logs do período, sem as ações do administrador principal
create or replace function public._relatorio_logs_periodo(p_ini timestamptz, p_fim timestamptz)
returns setof public.logs_sistema
language sql
stable
security definer
set search_path to 'public'
as $$
    select l.*
      from public.logs_sistema l
     where l.criado_em >= p_ini and l.criado_em < p_fim
       and coalesce(lower(l.usuario_email), '') <> 'admin@sebrae.com.br'
       and (l.usuario_id is null or l.usuario_id not in (
               select p.id from public.perfis_usuarios p where lower(p.email) = 'admin@sebrae.com.br'));
$$;
revoke all on function public._relatorio_logs_periodo(timestamptz, timestamptz) from public, anon, authenticated;

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

    select count(*) into v_total from public._relatorio_logs_periodo(p_ini, p_fim);

    select jsonb_build_object(
        'executar', jsonb_array_length(v_dest) > 0,
        'motivo', case when jsonb_array_length(v_dest) = 0 then 'nenhum destinatário ativo' end,
        'modo', p_modo,
        'periodo_inicio', p_ini,
        'periodo_fim', p_fim,
        'destinatarios', v_dest,
        'totais', jsonb_build_object(
            'eventos', v_total,
            'usuarios', (select count(distinct usuario_id) from public._relatorio_logs_periodo(p_ini, p_fim) where usuario_id is not null and ator <> 'anonimo'),
            'logins', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'login'),
            'telas', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'tela_aberta'),
            'termos_gerados', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'termo_gerado'),
            'termos_enviados', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'termo_enviado'),
            'termos_aceitos', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'termo_aceito'),
            'termos_recusados', (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao = 'termo_recusado'),
            'por_categoria', coalesce((select jsonb_object_agg(categoria, n) from (
                select categoria, count(*) n from public._relatorio_logs_periodo(p_ini, p_fim) group by categoria) c), '{}'::jsonb)),
        'por_usuario', coalesce((select jsonb_agg(u order by (u->>'total')::int desc, u->>'nome') from (
            select jsonb_build_object(
                'nome', coalesce(max(usuario_nome), case max(ator) when 'sistema' then 'Sistema' when 'cliente' then 'Cliente (WhatsApp)' else 'Tela de login' end),
                'email', max(usuario_email),
                'logins', count(*) filter (where acao = 'login'),
                'telas', count(*) filter (where acao = 'tela_aberta'),
                'consultas', count(*) filter (where categoria = 'consulta'),
                'alteracoes', count(*) filter (where acao not in ('login', 'logout', 'tela_aberta') and categoria <> 'consulta'),
                'total', count(*)) u
              from public._relatorio_logs_periodo(p_ini, p_fim)
             -- Pessoa = usuario_id (o pedido de senha "Tela de login" soma na pessoa que pediu);
             -- sem usuário = Sistema / Cliente (WhatsApp)
             group by coalesce(usuario_id::text, ator)) x), '[]'::jsonb),
        'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                'criado_em', criado_em,
                'quem', coalesce(usuario_nome, case ator when 'sistema' then 'Sistema' when 'cliente' then 'Cliente (WhatsApp)' else 'Tela de login' end),
                'ator', ator, 'categoria', categoria, 'acao', acao, 'descricao', descricao) order by criado_em, id)
            from (select * from public._relatorio_logs_periodo(p_ini, p_fim) where acao <> 'tela_aberta'
                   order by criado_em, id limit v_limite) e), '[]'::jsonb),
        'eventos_omitidos', greatest(0, (select count(*) from public._relatorio_logs_periodo(p_ini, p_fim) where acao <> 'tela_aberta') - v_limite)
    ) into v_res;
    return v_res;
end;
$$;
revoke all on function public._relatorio_logs_montar(timestamptz, timestamptz, text) from public, anon, authenticated;
