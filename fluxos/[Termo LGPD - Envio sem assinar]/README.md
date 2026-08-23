# [Termo LGPD - Envio sem assinar]

- **Workflow n8n:** `[Termo LGPD - Envio sem assinar]` — id `pJecOOv0Sqxippeu`
- **Status:** ativo em produção (versão publicada = draft, versionCounter 126)
- **Error workflow:** `ebJk0Lh3HwAysN53`
- **Espelhado em:** 2026-08-22

## O que o fluxo faz

Recebe do front-end SEBRAE os dados de um parceiro, gera o **Termo de Consentimento LGPD** em HTML personalizado (nome, CPF, hash SHA-256, data/hora em `America/Campo_Grande`), converte para PDF via Gotenberg e envia ao parceiro **via WhatsApp** (Evolution API, instância `SEBRAE`): primeiro uma mensagem de texto pedindo que responda `1 - Aceito` / `2 - Não Aceito`, depois o PDF `Termo Aceite LGPD.pdf`. Antes do envio do texto, o próprio fluxo grava `data_envio = now()` na tabela `parceiros` do Supabase (filtro `cpf eq`). Este é o fluxo de **envio sem assinatura** — a resposta de aceite é tratada em outro webhook/fluxo.

## Trigger (contrato com o app SEBRAE)

- **Método/Path:** `POST /webhook/fba3c3cd-5196-4b1b-be0f-9f47e2705258`
- **URL de produção:** `https://n8n.alfredooliveira.com.br/webhook/fba3c3cd-5196-4b1b-be0f-9f47e2705258`
- **Payload esperado (JSON, body):**

```json
{
  "nome_razao_social": "NOME DO PARCEIRO",
  "cpf": "000.000.000-00",
  "telefone": "(67)99999-9999"
}
```

- **Origem observada (pinData):** `https://sebrae-seven.vercel.app` (chamada CORS do front).
- **Resposta:** o Webhook usa o modo padrão (`onReceived`) — responde `200` imediatamente ao receber, sem esperar o pipeline terminar. O front não recebe o resultado do envio.
- **Observação sobre `data_envio`:** diferente da suposição de que o front gravaria `data_envio`, **é o próprio fluxo** que atualiza `parceiros.data_envio = {{ $now }}` (nó `Atualiza Banco de Dados`, filtro `cpf eq CPF recebido`). O update ocorre **antes** do envio das mensagens de WhatsApp.
- O telefone usado no WhatsApp é `'55' + telefone.replace(/\D/g, '')` (vem cru do body do webhook).

## Pipeline nó a nó

1. **Webhook** (`n8n-nodes-base.webhook`) — POST no path acima; dispara dois ramos: `instancia` e `seta_Dados`.
2. **instancia** (`set`) — define `instancia = "SEBRAE"` (nome da instância Evolution API).
3. **seta_Dados** (`set`) — mapeia `body.nome_razao_social → Nome`, `body.cpf → CPF`, `body.telefone → Telefone`.
4. **Get a row** (`supabase`) — busca em `parceiros` por `telefone = {{ $json.Telefone }}` (credencial `Acto`).
5. **If** (`if`, alwaysOutputData) — testa se `{{ $json.telefone }}` existe no registro retornado. **True →** segue o pipeline; **False →** `No Operation, do nothing` (fluxo termina em silêncio se o parceiro não está no banco).
6. **Download logo** (`googleDrive`) — baixa `Logo_Sebrae.png` do Google Drive.
7. **converte Base 64** (`extractFromFile`, binaryToPropery) — logo binário → Base64.
8. **Saida_HTML** (`code`) — gera o HTML do termo (ver `Code/Saida_HTML/v001.js`).
9. **HTML** (`html`) — renderiza `{{ $json.htmlEmail }}`.
10. **HTML_Base64** (`set`) — `htmlEmail` = HTML em Base64; define também `webhook de aceite` = `https://n8n.alfredooliveira.com.br/webhook/cfcef43b-4c9b-41ff-b0b7-37bb0067e611` (webhook do fluxo de aceite; setado mas não interpolado no HTML nesta versão).
11. **Convert to File** (`convertToFile`) — Base64 → arquivo `index.html`.
12. **HTTP Request** (`httpRequest`) — `POST http://gotenberg:3000/forms/chromium/convert/html` (multipart, campo `files`) → PDF. Header `Gotenberg-Output-Filename` ainda com valor herdado "Relatorio Horas Extras {{$now.format('dd/MM/yyyy')}}".
13. **Extract from File** (`extractFromFile`) — PDF binário → Base64.
14. **Atualiza Banco de Dados** (`supabase`) — `update parceiros set data_envio = {{ $now }} where cpf eq {{ CPF }}`.
15. **Enviar texto** (`evolutionApi`, messages-api) — mensagem WhatsApp pedindo aceite (1/2) para `55 + telefone limpo`.
16. **Wait** (`wait`, 1s) — pausa entre texto e documento.
17. **Enviar documento** (`evolutionApi`, send-document) — envia o PDF `Termo Aceite LGPD.pdf`.

Nós auxiliares: `No Operation, do nothing` (ramo false do If) e 4 Sticky Notes de documentação.

## Integrações

| Serviço | Uso | Nó(s) |
|---|---|---|
| Supabase (tabela `parceiros`) | Consulta por telefone; update de `data_envio` por CPF | `Get a row`, `Atualiza Banco de Dados` |
| Google Drive | Download do logo SEBRAE (PNG) | `Download logo` |
| Gotenberg (interno, `http://gotenberg:3000`) | Conversão HTML → PDF | `HTTP Request` |
| Evolution API (WhatsApp, instância `SEBRAE`) | Envio de texto e do PDF do termo | `Enviar texto`, `Enviar documento` |

## Credenciais referenciadas (apenas nome/tipo — valores ficam só no n8n)

| Nome | Tipo | Usada em |
|---|---|---|
| `Google Drive account` | `googleDriveOAuth2Api` | Download logo |
| `Acto` | `supabaseApi` | Get a row, Atualiza Banco de Dados |
| `Evolution API` | `evolutionApi` | Enviar texto, Enviar documento |

## Estrutura desta pasta

- `workflow.json` — espelho completo do workflow (ignorado pelo git — contém pinData com dados pessoais de teste).
- `Code/` — código dos nós Code, versionado.
- `Queries/` — sem artefatos (nós Supabase são declarativos, sem SQL literal).
- `Prompts/` — sem artefatos (fluxo sem nós de LLM).
