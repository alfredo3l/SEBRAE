# Fluxos n8n — SEBRAE Aceite LGPD

Espelho local e controle de desenvolvimento dos fluxos n8n do projeto SEBRAE. Convenção herdada do projeto `E:\Fluxos_N8N`.

> **A fonte de verdade é a instância n8n, não este repositório.** Aqui ficam o espelho (`workflow.json`, gitignored), a documentação e o histórico versionado dos artefatos (prompts, queries, código).

- **Instância:** `https://n8n.alfredooliveira.com.br`
- **Repositório:** `https://github.com/alfredo3l/SEBRAE.git` (público — ver regras de segredos abaixo)

## Fluxos espelhados

| Fluxo | ID | Status | Papel |
|---|---|---|---|
| **`[Termo URC - Envio sem assinar]`** | `Hqfoa19HyX4QFOqW` | ativo | **Fluxo atual de envio** (webhook `/webhook/TERMOS-URC`): recebe qualquer termo do sistema com o HTML já montado, gera o PDF (Gotenberg), grava `documentos.status = enviado` e envia texto + PDF via WhatsApp |
| **`[Termo URC - Assinado]`** | `7ITLaIB5rSc7EoTd` | ativo | **Fluxo atual de aceite** (webhook `/webhook/TERMOS-URC-ASSINADOS`): identifica o documento pela letra (`1A`/`2A`), gera o PDF assinado com evidências, grava `documentos` e, se for LGPD, `parceiros` + FOCO. ⚠️ Evolution ainda não aponta para ele |
| `[Termo LGPD - Envio sem assinar]` | `pJecOOv0Sqxippeu` | **inativo** | Legado — desativado em 23/08/2026, substituído pelos fluxos URC |
| `[Termo LGPD - Assinado]` | `36Z66pbeI25m2MbJ` | **inativo** | Legado — desativado em 23/08/2026; a Evolution API foi reapontada para `/webhook/TERMOS-URC-ASSINADOS` |
| `[Termo LGPD - Assinado]` | `36Z66pbeI25m2MbJ` | ativo | Processa a resposta do parceiro no WhatsApp ("1"=aceito, "2"=recusado): gera PDF assinado (hash SHA-256), grava no bucket `TermosAceite`, atualiza `parceiros` e sincroniza o FOCO (`TermoAceiteLGPD__c`) |

Relacionados, ainda **não espelhados** (inativos/arquivados): `[FOCO]` (`JE3yYItcMclY8PxJ`), `CRIA PDF` (`fT2WM9G0DuTK4jWf`), `[Automação Termo LGPD] copy`, `webhook de aceite`, `PDF` (arquivados).

> [!NOTE]
> O fluxo `termo de aceite - web site` (`pVpGmhVfQ1obuyOQ`, ativo na instância) **não pertence ao projeto SEBRAE** apesar do nome — é uma página de proposta comercial da Ped.Ai (outro cliente) e foi removido deste espelho em 22/08/2026. Atenção: a página dele aponta para o webhook do `[Termo LGPD - Envio sem assinar]` (`/webhook/fba3c3cd-...`).

## Anatomia de cada pasta de fluxo

```
fluxos/<Nome exato do fluxo no n8n>/
├── .gitignore        # ignora workflow.json (export pode conter segredos)
├── workflow.json     # export da instância — GITIGNORED, nunca commitar
├── README.md         # trigger, pipeline, contrato com o app, credenciais (só nomes)
├── Prompts/          # prompts de LLM por nó (vNNN.md + CHANGELOG.md)
├── Queries/          # queries por nó (vNNN.sql + CHANGELOG.md)
└── Code/             # código de nós Code por nó (vNNN.js + CHANGELOG.md)
```

Convenção completa de versionamento: [`versionamento-artefatos.md`](versionamento-artefatos.md).

## MCPs utilizados

| Servidor | Tipo | Papel |
|---|---|---|
| **`n8n-mcp`** | stdio (`npx -y n8n-mcp`) | **Principal** — construir, editar, validar, exportar: `get_node`, `validate_node`, `n8n_get_workflow`, `n8n_update_partial_workflow`, `n8n_validate_workflow`, `n8n_executions`, `n8n_test_workflow` etc. |
| `n8n` (nativo da instância) | http (`{base}/mcp-server/http`) | Somente disparar e consultar (`search_workflows`, `get_workflow_details`, `execute_workflow`) — não serve para construir |

As credenciais dos MCPs (duas audiences de JWT distintas: `public-api` para o `n8n-mcp`, `mcp-server-api` para o nativo) vivem no `.env` do projeto `E:\Fluxos_N8N` — **não** duplicar aqui.

## Ordem canônica de trabalho (obrigatória)

1. **`get_node` antes de configurar qualquer nó** — schema vivo, nunca de memória.
2. Editar preferindo **`n8n_update_partial_workflow`** (ops incrementais: `updateNode`, `patchNodeField`, `addConnection`...).
3. **`n8n_validate_workflow` antes de ativar** e **`n8n_get_workflow` depois** para inspecionar `connections` (a validação não pega fio perdido nem error output desligado).
4. Criar/atualizar a versão `vNNN` local **no mesmo ato** da edição na instância (sincronia local ↔ live, nas duas direções).
5. **Segredo só em credencial do n8n** — nunca em campo de texto de nó, nunca em arquivo versionado. No repositório, segredo nenhum: `workflow.json` é gitignored e os artefatos `vNNN.*` não podem conter tokens.

## Armadilhas conhecidas (herdadas do Fluxos_N8N, custaram incidentes reais)

- **Rascunho × publicado:** o corpo do workflow é rascunho; o que roda é o snapshot `activeVersion`. `PUT /api/v1/workflows/:id` **publica o rascunho inteiro** — cheque `versionId != activeVersionId` antes. Nunca use desativar/reativar para "publicar".
- **`onError: continueRegularOutput` transforma falha em dado silencioso** — o nó emite `{error}` como item válido; escreva a detecção a jusante no mesmo ato.
- **O Grep tool do Claude Code (ripgrep) respeita `.gitignore`** → não enxerga os `workflow.json`. Para varrer segredos neles, use PowerShell `Select-String` (ou `rg --no-ignore`).
- Mensagens de erro de nó Code **sem `:`** (o n8n trunca no último `:`); respostas de erro de webhook com **4xx, nunca 5xx** (o proxy troca o corpo por `error code: 502`).
- Nome de nó é **contrato** (expressões `$('Nó')` e pastas locais dependem dele) — renomear nó exige atualizar referências e a pasta local.

## Antes de commit/push

Varredura obrigatória nos arquivos versionáveis de `fluxos/`: nenhum `eyJ`, `sk-`, `AIza`, `client_secret`/senha com valor literal; `git check-ignore -q` em cada `workflow.json`; conferir `git status` (nenhum `workflow.json` listado).
