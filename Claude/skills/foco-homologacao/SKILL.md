---
name: foco-homologacao
description: Aponta a integração com o FOCO (Salesforce SEBRAE) para HOMOLOGAÇÃO (hlg-gateway.sebrae.com.br/foco-stg) — app local, n8n e Vercel. Use quando o desenvolvedor pedir para "ir para homologação", "voltar o FOCO para hlg/stg" ou preparar o ambiente de testes do cliente. Supabase e fluxos n8n continuam os mesmos; só o FOCO muda.
---

# FOCO → HOMOLOGAÇÃO

Troca **apenas o FOCO** para a sandbox `sebraecrm--stg` (gateway `https://hlg-gateway.sebrae.com.br/foco-stg`).
Supabase, fluxos n8n, webhooks e WhatsApp **não mudam** (decisão do desenvolvedor, 01/10/2026).

A mecânica do `.env` e do n8n está em `scripts/foco-ambiente.js` — ele lê as credenciais de `.env.homologacao`
(gitignored) e **nunca imprime** client_id, secret ou token. A única exceção é o **Passo Vercel**, que exige passar os valores ao MCP da Vercel do próprio projeto (autorizado explicitamente pelo desenvolvedor em 01/10/2026, ciente de que eles ficam no histórico da sessão) — fora dele, nunca exiba esses valores.

## Pontos que mudam

| # | Onde | O quê | Quem faz |
|---|---|---|---|
| 1 | `.env` local | `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID`, `SEBRAE_CLIENT_SECRET` | script |
| 2 | n8n `[Termo URC - Assinado]` (`7ITLaIB5rSc7EoTd`) | nó `Seta_Credenciais_FOCO`: `Gateway`, `Client Id`, `Client Secret` (os 6 nós HTTP do FOCO leem o gateway dele) | script |
| 3 | Vercel (projeto `sebrae`) | as mesmas 3 variáveis + **redeploy** de produção | você, pelo **MCP da Vercel** (ver "Passo Vercel") |

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
6. Faça o **Passo Vercel** (abaixo) e aguarde o deploy ficar `READY`.
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

## Passo Vercel (MCP `plugin_vercel_vercel`)

Projeto `sebrae` = `prj_W72o8D06Qq1P7Bf39L9tWdwsFKKT`, time `team_kSy4cJd5R8DlFy23pX6NM9LQ`.

1. `filter_project_envs` (sem `decrypt`) → anote o `id` de cada uma das chaves `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID`, `SEBRAE_CLIENT_SECRET` (em 01/10/2026: `uToU1Tn5lZd6SDID`, `1iqqpegzki3efhJm`, `bnCSzr02RWp7O5MT` — **sempre reconfira**, os ids mudam se a variável for recriada).
2. Leia os 3 valores de `.env.homologacao` e, para cada chave, `edit_project_env` com `requestBody: { value }` — **mantendo os `target` atuais** (não altere tipo nem alvo sem o desenvolvedor pedir).
3. `list_deployments` (`target: production`, `state: READY`, `limit: 1`) → `id` do último deploy de produção.
4. `create_deployment` com `requestBody: { name: "sebrae", deploymentId: <id>, target: "production" }` — variáveis só valem após o redeploy.
5. Aguarde `READY` (`list_deployments`) e rode `node scripts/foco-ambiente.js status`: "App publicado (Vercel)" deve mostrar o ambiente novo (header `X-Foco-Ambiente`).

Se uma chamada falhar no meio, **não deixe o app misturado**: ou conclua as 3 variáveis + redeploy, ou volte as já alteradas para o ambiente anterior.

Melhorias pendentes (só com pedido do desenvolvedor): `SEBRAE_CLIENT_SECRET` está como `encrypted` e a Vercel acusa *readable-secret* — o recomendado é `sensitive`; e `SEBRAE_API_BASE` vale só para *Production*, enquanto as credenciais valem para *Production/Preview/Development* (em Preview cairia no default do código).

## Permissões

O modo automático do Claude Code pode bloquear `testar`/`aplicar` (leitura em produção com credenciais,
alteração de fluxo compartilhado). Nesse caso **não contorne**: peça ao desenvolvedor para rodar o comando
ele mesmo no prompt com `! node scripts/foco-ambiente.js ...` e leia a saída.
