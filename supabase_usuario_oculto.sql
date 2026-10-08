-- ============================================
-- Usuário oculto (08/10/2026)
-- A conta do desenvolvedor (Alfredo Antônio de Oliveira) só aparece para o
-- administrador principal (admin@sebrae.com.br) e para ele mesmo. Para os
-- demais usuários somem: a linha na Gestão de Usuários (e dos contadores),
-- a opção no filtro "Usuário", os termos que ele gerar (lista e
-- Acompanhamento) e a autoria na coluna "Criado por".
-- Decisões do desenvolvedor: ocultação SÓ DE TELA (a RLS segue entregando o
-- cadastro a quem consulta a API direto) e identificação por MARCA no
-- cadastro (não por e-mail fixo no código).
-- A marca só muda pela administração do banco (sem auth.uid()): o gatilho
-- que já protegia a função de cuidar de senhas passa a protegê-la também
-- (a RLS de perfis_usuarios deixa qualquer admin dar UPDATE na tabela).
-- ============================================

alter table public.perfis_usuarios
    add column if not exists oculto boolean not null default false;

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

    if new.oculto is distinct from old.oculto and auth.uid() is not null then
        raise exception 'A marca de usuário oculto só pode ser alterada pela administração do banco.';
    end if;

    return new;
end;
$$;

-- Conta do desenvolvedor
update public.perfis_usuarios
   set oculto = true
 where lower(email) = 'alfredo.oliveira@sanesul.ms.gov.br';
