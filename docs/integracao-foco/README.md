# Integração com o FOCO (Salesforce SEBRAE)

Esta pasta concentra a documentação e os materiais das APIs de integração com o **FOCO**, o CRM Salesforce do SEBRAE. O documento abaixo descreve como a integração funciona **hoje** neste projeto; novos endpoints, payloads de exemplo, collections e especificações devem ser adicionados aqui.

## Visão geral

O front-end nunca fala diretamente com o Salesforce. Toda chamada passa por um **proxy próprio**, que evita CORS e mantém as credenciais fora do navegador:

- **Produção (Vercel)**: serverless functions em [`api/sebrae/query.js`](../../api/sebrae/query.js) e [`api/sebrae/contact/[id].js`](../../api/sebrae/contact/%5Bid%5D.js).
- **Local**: o servidor [`dev.js`](../../dev.js) implementa as mesmas rotas inline (além de servir os estáticos).

> **Regra do projeto**: qualquer mudança de comportamento da API deve ser replicada nos **dois** lugares (`api/sebrae/*` **e** `dev.js`).

O cliente do proxy no front é [`js/sebrae-api.js`](../../js/sebrae-api.js), que usa URLs relativas (`/api/sebrae/...`) — funcionam igual em local e na Vercel.

## Autenticação

OAuth2 `client_credentials` contra o gateway do SEBRAE:

```
POST {SEBRAE_API_BASE}/services/oauth2/token
     ?grant_type=client_credentials
     &client_id={SEBRAE_CLIENT_ID}
     &client_secret={SEBRAE_CLIENT_SECRET}
```

O token (`access_token`) é cacheado **em memória** no proxy e renovado quando faltar 60s para expirar (`expires_in - 60`). Em serverless o cache vale enquanto a instância estiver ativa.

## Ambientes e variáveis

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SEBRAE_API_BASE` | Não | Base do gateway. Default: homologação `https://hlg-gateway.sebrae.com.br/foco-stg` |
| `SEBRAE_CLIENT_ID` | Sim | Client ID do OAuth (não commitar) |
| `SEBRAE_CLIENT_SECRET` | Sim | Client Secret do OAuth (não commitar) |

Local: arquivo `.env` (copie de `.env.example`). Produção: painel de env vars da Vercel.

## Endpoints do proxy

### `GET /api/sebrae/query?q=<SOQL>`

Executa uma consulta SOQL. Repassa para `GET {SEBRAE_API_BASE}/services/data/v64.0/query?q=...` e devolve o JSON do Salesforce como veio (`{ totalSize, done, records: [...] }`).

- `q` é obrigatório (400 se ausente).

### `PATCH /api/sebrae/contact/:id`

Atualiza `Phone` e/ou `Email` de um Contact. Body (ao menos um dos campos):

```json
{ "Phone": "(67)99999-9999", "Email": "cliente@exemplo.com" }
```

Repassa para `PATCH {SEBRAE_API_BASE}/services/data/v64.0/sobjects/Contact/{id}` e responde **204 No Content** em sucesso.

- Body sem `Phone` e sem `Email` → 400 (`Informe "Phone" e/ou "Email" no body.`); outros métodos retornam 405.
- Cliente no front: `atualizarContatoSebrae(contactId, { Phone, Email })` em `js/sebrae-api.js` (o antigo `atualizarTelefoneContactSebrae` virou atalho).
- Usado pelo modal "Editar Cliente" (detalhe) e pelo botão "Salvar contato do cliente" dentro do formulário de cada termo.

### Formato de erro

Ambos os endpoints respondem erros com um campo `etapa` indicando onde falhou:

| `etapa` | Significado |
|---|---|
| `config` | `SEBRAE_CLIENT_ID`/`SEBRAE_CLIENT_SECRET` não configurados (500) |
| `token` | Falha ao obter o token OAuth (500) |
| `query` | Erro na consulta SOQL (status repassado do Salesforce, com `body`) |
| `patch` | Erro no PATCH do Contact (status repassado do Salesforce, com `body`) |

## Consultas SOQL usadas pelo app

Todas sobre o objeto `Contact` (ver `js/sebrae-api.js`):

- **Busca FOCO** (`buscarContatosSebrae`) — `SELECT FIELDS(ALL) FROM Contact WHERE ... LIMIT n`, com o `WHERE` decidido pelo termo digitado:
  - parece CPF → `CPF__c = '000.000.000-00'` (CPF formatado com pontuação, LIMIT 200)
  - parece telefone → `Phone LIKE '%<nums>%' OR MobilePhone LIKE '%<nums>%'` (LIMIT 50)
  - caso contrário → `Name LIKE '%<termo>%'` (LIMIT 50)
- **Descoberta de Contact Id** (`buscarContactIdSalesforce`), usada antes de sincronizar telefone quando o parceiro não tem `id_contato_salesforce`:
  1. `SELECT Id FROM Contact WHERE AccountId = '<id_salesforce>' LIMIT 1`
  2. fallback: `SELECT Id FROM Contact WHERE CPF__c = '<cpf formatado>' LIMIT 1`

Campos relevantes do `Contact`: `Id`, `AccountId`, `Name`, `CPF__c`, `Phone`, `MobilePhone`, `Email`, além de campos de LGPD/termo detectados dinamicamente pelo nome (`LGPD`/`TERMO`/`ACEITE`). O campo oficial do aceite LGPD é **`TermoAceiteLGPD__c`** (valores "Sim"/"Não").

### Termos URC (fase 1 — página de detalhe)

Adicionadas em 22/08/2026, baseadas no fluxo de exemplo `fluxos/Exemplo-API/API_Exemplo_FLUXO_N8N.md`:

- **Dados pessoais do Contact** (`buscarContatosFocoPorCPF`, desde 02/09/2026 no plural):
  `SELECT Id, Name, CPF__c, Phone, MobilePhone, Email, AccountId, Account.Name, Account.CNPJ__c FROM Contact WHERE CPF__c = '<cpf formatado>' ORDER BY LastModifiedDate DESC LIMIT 50`
  ⚠️ O **CNPJ fica na conta** (`Account.CNPJ__c`), não no contato — o `Contact` não possui campo de CNPJ. Vem com máscara (`00.514.820/0011-73`) e costuma estar vazio para pessoa física. Outros campos úteis da `Account`: `CPF__c`, `InscricaoEstadual__c`, `Phone`, endereço de cobrança (`Billing*`).
  ⚠️ **Um mesmo CPF pode ter mais de um Contact/Account** (logo, mais de um CNPJ). Por isso a consulta deixou de usar `LIMIT 1` — sem `ORDER BY`, o registro devolvido era arbitrário e podia ser justamente o sem CNPJ. Helpers: `escolherContatoFoco(registros, accountPreferido)` escolhe um registro de forma determinística (conta do cliente → primeira com CNPJ → primeira) e `cnpjsDosContatos(registros)` devolve a lista de CNPJs sem repetição. `buscarContatoFocoPorCPF(cpf, accountPreferido)` continua existindo como atalho para um único registro.
- **Última interação/atendimento** (`buscarUltimaInteracaoFoco`) — o objeto de interação no FOCO é o **`Case`** (padrão Salesforce), ligado ao cliente por `ContactId`:
  `SELECT Id, CaseNumber, Status, CreatedDate FROM Case WHERE ContactId = '<id>' ORDER BY CreatedDate DESC LIMIT 1`
  (fallback sem ContactId: `WHERE ContactId IN (SELECT Id FROM Contact WHERE CPF__c = '<cpf>')`).
  O `CaseNumber` é exibido como "Interação nº" na tela de detalhe. Outros campos conhecidos do `Case` (via collection Postman): `HoraInicio__c`, `HoraFinal__c`, `Description`, `cpf__c`, `CPFAtendente__c`, `Sebrae__c`.

### Upload de anexo em interação (referência para fase futura)

A collection `docs/ACTO_Exemplo_UpAnexo.postman_collection.json` documenta o fluxo de anexar um PDF a um `Case` (API v67.0): `POST /sobjects/ContentVersion` (PDF em base64) → query do `ContentDocumentId` → `POST /sobjects/ContentDocumentLink` (`LinkedEntityId` = Id do Case). Exigirá novas rotas no proxy (replicar em `api/sebrae/*` **e** `dev.js`).

## Materiais nesta pasta

- `Documentação de Integração - Consultoria V1.9.pdf` — documentação oficial de integração fornecida pelo SEBRAE.

## Materiais relacionados fora desta pasta

- `fluxos/Exemplo-API/API_Exemplo_FLUXO_N8N.md` — fluxo n8n de exemplo (token → Contact por CPF → Case/interação). Credenciais redigidas.
- `docs/ACTO_Exemplo_UpAnexo.postman_collection.json` — collection Postman do fluxo de anexo em interação (Case).
