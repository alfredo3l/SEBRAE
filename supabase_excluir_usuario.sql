-- ============================================
-- Excluir usuário (08/10/2026)
-- Só gestores de senhas (principal ou admin delegado) excluem. Decisões do
-- desenvolvedor:
--   * apaga SÓ o cadastro do Termos URC (perfis_usuarios) — a conta de login
--     (auth.users) é compartilhada com outros sistemas e fica intacta;
--   * quem não tem cadastro é barrado ao entrar no Termos URC (na tela,
--     js/auth.js) — sem isso o excluído ainda entraria;
--   * confirmação na tela exige digitar o e-mail do usuário.
-- Não podem ser excluídos: o administrador principal e o próprio usuário.
-- Histórico preservado: termos (autoria é snapshot em documentos), pedidos de
-- senha e mensagens de WhatsApp (guardam nome/número) perdem só o vínculo.
-- A exclusão fica registrada pelo log do sistema (gatilho trg_log_perfis,
-- ação "usuario_excluido", com o registro completo).
-- ============================================

-- Mensagens de WhatsApp a usuários: o vínculo com o cadastro vira opcional e
-- é zerado na exclusão (nome e número continuam gravados na própria mensagem)
alter table public.mensagens_whatsapp_usuarios
    alter column remetente_id    drop not null,
    alter column destinatario_id drop not null;

do $$
declare c record;
begin
    for c in
        select conname, pg_get_constraintdef(oid) def
          from pg_constraint
         where conrelid = 'public.mensagens_whatsapp_usuarios'::regclass
           and contype = 'f'
           and confrelid = 'public.perfis_usuarios'::regclass
    loop
        execute format('alter table public.mensagens_whatsapp_usuarios drop constraint %I', c.conname);
        execute format('alter table public.mensagens_whatsapp_usuarios add constraint %I %s on delete set null',
                       c.conname, c.def);
    end loop;
end $$;

create or replace function public.admin_excluir_usuario(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_alvo public.perfis_usuarios%rowtype;
begin
    if not public.pode_gerir_senhas() then
        raise exception 'Acesso negado: somente um gestor de senhas pode excluir usuários.';
    end if;

    if p_usuario = auth.uid() then
        raise exception 'Você não pode excluir o seu próprio usuário.';
    end if;

    select * into v_alvo from public.perfis_usuarios where id = p_usuario;
    if not found then
        raise exception 'Usuário não encontrado neste sistema.';
    end if;

    if lower(v_alvo.email) = 'admin@sebrae.com.br' then
        raise exception 'O administrador principal não pode ser excluído.';
    end if;

    -- Só o cadastro do Termos URC; a conta de login (compartilhada) fica
    delete from public.perfis_usuarios where id = p_usuario;
end;
$$;

revoke all on function public.admin_excluir_usuario(uuid) from public, anon;
grant execute on function public.admin_excluir_usuario(uuid) to authenticated;
