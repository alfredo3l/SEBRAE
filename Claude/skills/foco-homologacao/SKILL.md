---
name: foco-homologacao
description: Aponta a integração com o FOCO (Salesforce SEBRAE) para HOMOLOGAÇÃO (hlg-gateway.sebrae.com.br/foco-stg) — app local, n8n e Vercel. Use quando o desenvolvedor pedir para "ir para homologação", "voltar o FOCO para hlg/stg" ou preparar o ambiente de testes do cliente. Supabase e fluxos n8n continuam os mesmos; só o FOCO muda.
---

# FOCO → HOMOLOGAÇÃO

Troca **apenas o FOCO** para a sandbox `sebraecrm--stg` (gateway `https://hlg-gateway.sebrae.com.br/foco-stg`).
Supabase, fluxos n8n, webhooks e WhatsApp **não mudam** (decisão do desenvolvedor, 01/10/2026).

Toda a mecânica está em `scripts/foco-ambiente.js` — ele lê as credenciais de `.env.homologacao`
(gitignored) e **nunca imprime** client_id, secret ou token. Nunca leia nem exiba esses valores na conversa.

## Pontos que mudam

| # | Onde | O quê | Quem faz |
|---|---|---|---|
| 1 | `.env` local | `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID`, `SEBRAE_CLIENT_SECRET` | script |
| 2 | n8n `[Termo URC - Assinado]` (`7ITLaIB5rSc7EoTd`) | nó `Seta_Credenciais_FOCO`: `Gateway`, `Client Id`, `Client Secret` (os 6 nós HTTP do FOCO leem o gateway dele) | script |
| 3 | Vercel → Settings → Environment Variables → **Production** | as mesmas 3 variáveis + **Redeploy** | **desenvolvedor** (manual) |

## Passo a passo

1. **Confirme com o desenvolvedor** que quer trocar para homologação agora — a troca afeta o app publicado e o aceite em andamento no n8n.
2. Pré-requisito: `.env.homologacao` na raiz com `SEBRAE_CLIENT_ID` e `SEBRAE_CLIENT_SECRET` do foco-stg preenchidos **pelo desenvolvedor** (você não digita credenciais). Se faltar, pare e peça.
3. Situação atual:
   ```bash
   node scripts/foco-ambiente.js status
   ```
4. Teste as credenciais (token + 1 consulta de leitura; em sandbox a identidade do token vem de `test.salesforce.com`, conforme o PDF oficial de integração):
   ```bash
   node scripts/foco-ambiente.js testar homologacao
   ```
   Falhou → **pare**; nada foi alterado.
5. Aplique (n8n + `.env`; aborta se o fluxo tiver rascunho não publicado):
   ```bash
   node scripts/foco-ambiente.js aplicar homologacao
   ```
6. Peça ao desenvolvedor o passo **Vercel** (o script imprime as instruções) e aguarde o redeploy.
7. Confira — os três devem dizer **HOMOLOGACAO**:
   ```bash
   node scripts/foco-ambiente.js status
   ```
   O app publicado é conferido pelo header `X-Foco-Ambiente` de `/api/sebrae/query`.
8. Se o `npm run dev` estiver rodando, reinicie (ele lê o `.env` na subida e mostra o ambiente no console).
9. Reporte o resultado de cada ponto (não apenas "feito") e atualize o espelho local do fluxo
   (`fluxos/[Termo URC - Assinado]/workflow.json`, gitignored) com um GET.

## Atenção em homologação

- Clientes, Contacts, Accounts e Cases da sandbox **não são os de produção**: `id_salesforce`, `id_contato_salesforce` e `case_id_salesforce` gravados no Supabase em produção **não existem** na sandbox (e vice-versa). Como o Supabase é compartilhado, teste com clientes buscados pelo "Buscar Cliente" **já em homologação**.
- O gateway de homologação pode ficar fora do ar ou ter dados renovados (refresh da sandbox) sem aviso.
- Para voltar: `/foco-producao`.

## Permissões

O modo automático do Claude Code pode bloquear `testar`/`aplicar` (leitura em produção com credenciais,
alteração de fluxo compartilhado). Nesse caso **não contorne**: peça ao desenvolvedor para rodar o comando
ele mesmo no prompt com `! node scripts/foco-ambiente.js ...` e leia a saída.
