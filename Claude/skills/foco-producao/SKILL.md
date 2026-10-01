---
name: foco-producao
description: Aponta a integração com o FOCO (Salesforce SEBRAE) para PRODUÇÃO (gateway.sebrae.com.br/foco) — app local, n8n e Vercel. Use quando o desenvolvedor pedir para "ir para produção", "publicar no FOCO de produção" ou quando o cliente SEBRAE validar a homologação. Supabase e fluxos n8n continuam os mesmos; só o FOCO muda.
---

# FOCO → PRODUÇÃO

Troca **apenas o FOCO** para produção (gateway `https://gateway.sebrae.com.br/foco`).
Supabase, fluxos n8n, webhooks e WhatsApp **não mudam** (decisão do desenvolvedor, 01/10/2026).

⚠️ Em produção, "Editar Cliente"/"Salvar contato" alteram `Phone`/`Email` de **contatos reais** e o aceite
anexa PDFs em **Cases reais** e marca `TermoAceiteLGPD__c`. O SEBRAE pediu que produção só seja usada
**depois de validada a homologação** — confirme isso com o desenvolvedor antes de aplicar.

A mecânica do `.env` e do n8n está em `scripts/foco-ambiente.js` — ele lê as credenciais de `.env.producao`
(gitignored) e **nunca imprime** client_id, secret ou token. A única exceção é o **Passo Vercel**, que exige passar os valores ao MCP da Vercel do próprio projeto (autorizado explicitamente pelo desenvolvedor em 01/10/2026, ciente de que eles ficam no histórico da sessão) — fora dele, nunca exiba esses valores.

## Pontos que mudam

| # | Onde | O quê | Quem faz |
|---|---|---|---|
| 1 | `.env` local | `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID`, `SEBRAE_CLIENT_SECRET` | script |
| 2 | n8n `[Termo URC - Assinado]` (`7ITLaIB5rSc7EoTd`) | nó `Seta_Credenciais_FOCO`: `Gateway`, `Client Id`, `Client Secret` (os 6 nós HTTP do FOCO leem o gateway dele) | script |
| 3 | Vercel (projeto `sebrae`) | as mesmas 3 variáveis + **redeploy** de produção | você, pelo **MCP da Vercel** (ver "Passo Vercel") |

## Passo a passo

1. **Confirme com o desenvolvedor** que o cliente validou a homologação e que é para ir a produção agora.
2. Pré-requisito: `.env.producao` na raiz, completo (foi criado em 01/10/2026 como cópia do `.env` de produção da época). Se faltar, pare e peça.
3. Situação atual:
   ```bash
   node scripts/foco-ambiente.js status
   ```
4. Teste as credenciais (token + 1 consulta de leitura; a identidade do token **não** pode vir de `test.salesforce.com`, que é sandbox):
   ```bash
   node scripts/foco-ambiente.js testar producao
   ```
   Falhou → **pare**; nada foi alterado.
5. Aplique (n8n + `.env`; aborta se o fluxo tiver rascunho não publicado):
   ```bash
   node scripts/foco-ambiente.js aplicar producao
   ```
6. Faça o **Passo Vercel** (abaixo) e aguarde o deploy ficar `READY`.
7. Confira — os três devem dizer **PRODUCAO**:
   ```bash
   node scripts/foco-ambiente.js status
   ```
   O app publicado é conferido pelo header `X-Foco-Ambiente` de `/api/sebrae/query`.
8. Se o `npm run dev` estiver rodando, reinicie.
9. Reporte o resultado de cada ponto (não apenas "feito") e atualize o espelho local do fluxo
   (`fluxos/[Termo URC - Assinado]/workflow.json`, gitignored) com um GET.

## Observações

- Os IDs do Salesforce gravados no Supabase durante a homologação (`id_salesforce`, `id_contato_salesforce`, `case_id_salesforce`) são da sandbox e **não existem em produção** — documentos/clientes de teste devem ser revisados antes de uso real.
- Para voltar: `/foco-homologacao`.

## Passo Vercel (MCP `plugin_vercel_vercel`)

Projeto `sebrae` = `prj_W72o8D06Qq1P7Bf39L9tWdwsFKKT`, time `team_kSy4cJd5R8DlFy23pX6NM9LQ`.

1. `filter_project_envs` (sem `decrypt`) → anote o `id` de cada uma das chaves `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID`, `SEBRAE_CLIENT_SECRET` (em 01/10/2026: `uToU1Tn5lZd6SDID`, `1iqqpegzki3efhJm`, `bnCSzr02RWp7O5MT` — **sempre reconfira**, os ids mudam se a variável for recriada).
2. Leia os 3 valores de `.env.producao` e, para cada chave, `edit_project_env` com `requestBody: { value }` — **mantendo os `target` atuais** (não altere tipo nem alvo sem o desenvolvedor pedir).
3. `list_deployments` (`target: production`, `state: READY`, `limit: 1`) → `id` do último deploy de produção.
4. `create_deployment` com `requestBody: { name: "sebrae", deploymentId: <id>, target: "production" }` — variáveis só valem após o redeploy.
5. Aguarde `READY` (`list_deployments`) e rode `node scripts/foco-ambiente.js status`: "App publicado (Vercel)" deve mostrar o ambiente novo (header `X-Foco-Ambiente`).

Se uma chamada falhar no meio, **não deixe o app misturado**: ou conclua as 3 variáveis + redeploy, ou volte as já alteradas para o ambiente anterior.

Melhorias pendentes (só com pedido do desenvolvedor): `SEBRAE_CLIENT_SECRET` está como `encrypted` e a Vercel acusa *readable-secret* — o recomendado é `sensitive`; e `SEBRAE_API_BASE` vale só para *Production*, enquanto as credenciais valem para *Production/Preview/Development* (em Preview cairia no default do código).

## Permissões

O modo automático do Claude Code pode bloquear `testar`/`aplicar` (leitura em produção com credenciais,
alteração de fluxo compartilhado). Nesse caso **não contorne**: peça ao desenvolvedor para rodar o comando
ele mesmo no prompt com `! node scripts/foco-ambiente.js ...` e leia a saída.
