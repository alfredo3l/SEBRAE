-- ============================================================
-- vw_documentos_pendentes: coluna telefone_chave (16/09/2026)
--
-- O fluxo de aceite ([Termo URC - Assinado]) localiza os documentos pendentes
-- pelo telefone que responde no WhatsApp. O JID da Evolution pode vir com 10
-- dígitos (celular antigo registrado SEM o 9, ou telefone FIXO com WhatsApp
-- Business) e o cadastro pode ter 11 (celular com o 9) — a comparação por
-- telefone_digitos falhava nesses cruzamentos. O fluxo chegava a "acrescentar
-- um 9" quando sobravam 10 dígitos, o que resolvia o celular antigo mas
-- quebrava o fixo (6733895349 virava 67933895349 e não casava com nada).
--
-- telefone_chave = DDD + últimos 8 dígitos. É igual para o mesmo número escrito
-- com ou sem o 9, e não altera o fixo. O nó "Busca Pendentes" filtra por ela
-- com a mesma regra aplicada ao JID.
--
-- Colunas existentes mantidas na mesma ordem (CREATE OR REPLACE VIEW só aceita
-- acréscimo no fim). security_invoker preservado.
-- ============================================================

create or replace view public.vw_documentos_pendentes
with (security_invoker = true) as
select d.id as documento_id,
       d.parceiro_id,
       p.cpf,
       p.telefone,
       regexp_replace(p.telefone::text, '\D', '', 'g') as telefone_digitos,
       regexp_replace(p.cpf::text, '\D', '', 'g')      as cpf_digitos,
       p.nome_razao_social,
       p.id_salesforce,
       p.id_contato_salesforce,
       d.tipo_documento,
       d.nome_documento,
       d.codigo_resposta,
       d.html_documento,
       d.case_id_salesforce,
       d.case_number,
       d.data_envio,
       d.created_at,
       -- DDD + últimos 8 dígitos: casa fixo, celular com 9 e celular sem 9
       left(regexp_replace(p.telefone::text, '\D', '', 'g'), 2)
         || right(regexp_replace(p.telefone::text, '\D', '', 'g'), 8) as telefone_chave
  from public.documentos d
  join public.parceiros p on p.id = d.parceiro_id
 where d.status = 'enviado';

-- Conferência:
-- select telefone, telefone_digitos, telefone_chave from public.vw_documentos_pendentes;
