# [Termo LGPD - Assinado]

- **Workflow n8n:** `[Termo LGPD - Assinado]` — id `36Z66pbeI25m2MbJ`
- **Status:** ativo (em produção) · 58 nós
- **Espelho local:** `workflow.json` (gitignorado — contém dados sensíveis; segredos literais foram redigidos com `<<<REDACTED-...>>>`)

## O que dispara o fluxo

| Gatilho | Detalhe |
|---|---|
| **Webhook (produção)** | `POST /webhook/ec9aeb71-8170-40bb-b802-dbbca8fb5163` — recebe eventos de mensagem do WhatsApp via Evolution API (payload `body.data.key.remoteJid`, `body.data.message.conversation`). É a **resposta do parceiro** ("1" = aceito, "2" = não aceito) ao termo enviado pelo app SEBRAE. |
| **Manual Trigger** | Nó "ALTERA STATUS DO TERMO DE ACEITE NO FOCO" — ramo administrativo, executado manualmente para reverter o termo de aceite de um CPF específico no FOCO para "Não". |

Observação sobre o contrato com o front-end: o payload com `nome_razao_social`, `cpf`, `telefone` chega a este fluxo pelo registro previamente gravado na tabela `parceiros` do Supabase (o fluxo localiza o cadastro pelo telefone extraído do `remoteJid`). Existe também a URL do "webhook de aceite" (`.../webhook/cfcef43b-...`) referenciada no nó `HTML_Base64`, apontando para o fluxo que envia o termo.

## Pipeline resumido (nó a nó, por etapa)

1. **Recepção e identificação** — `Webhook` recebe a mensagem; `insntancia` fixa a instância Evolution ("SEBRAE"); `Filtra Cadastro` (Supabase, tabela `parceiros`) localiza o parceiro pelo telefone normalizado do `remoteJid` (remove `@s.whatsapp.net`, DDI 55, força o 9º dígito, formata `(DD)XXXXX-XXXX`).
2. **Validação de aceite prévio** — `If` checa `termo_aceito`: se já `true`, `Enviar texto2` avisa via WhatsApp que o consentimento já está registrado e encerra (`No Operation 2`).
3. **Roteamento da resposta** — `Switch` sobre `message.conversation`: `"1"` → ramo Aceito; `"2"` → ramo Não Aceito; qualquer outra coisa → `No Operation 1` (ignora).
4. **Ramo Aceito — geração do termo** — `seta_Dados` (Nome/CPF/Telefone do cadastro) → `Download logo` (Google Drive, `Logo_Sebrae.png`) → `converte Base 64` → `Saida_HTML` (nó Code: monta o HTML do termo com CPF/telefone formatados, data/hora em America/Campo_Grande e hash SHA-256 como assinatura digital) → `HTML` → `HTML_Base64` → `Convert to File` → `HTTP Request` (Gotenberg `http://gotenberg:3000` converte HTML em PDF).
5. **Ramo Aceito — persistência e envio** — o PDF segue em paralelo para: (a) `Envio Documento Supabase` — `PUT` no Storage do Supabase, bucket `TermosAceite`, objeto `TermosAceite_<CPF_sem_pontuacao>.pdf` (com `x-upsert: true`); e (b) `Extract from File` → `Atualiza Banco de Dados` (Supabase `parceiros`: `termo_aceito = true`, `data_aceite = $now`, filtrado por CPF) → `Enviar texto` (confirmação via WhatsApp) → `Wait` (1s) → `Enviar documento` (envia o PDF "Termo Assinado.pdf" ao parceiro via Evolution API).
6. **Ramo Aceito — sincronização com o FOCO (Salesforce)** — `Seta_Credenciais_FOCO` → `Obter_Token` (OAuth2 client_credentials em `gateway.sebrae.com.br/foco`) → `seta_token` → `HTTP Request CPF` (SOQL: `Contact` por `CPF__c`) → `seta_Dados_Cliente` → `Atualiza Status Termo Aceite FOCO` (`PATCH Contact.TermoAceiteLGPD__c = "Sim"`) → `Status_Code_Requicao`.
7. **Ramo Não Aceito** — `Enviar texto1` (mensagem de respeito à recusa via WhatsApp) → `seta_Dados2` → `Atualiza Banco de Dados1` (Supabase `parceiros`: `recusado = true`, `data_recusa = $now`). A recusa **não** é propagada ao FOCO (o campo só aceita Sim/Não); há um ramo de homologação para isso (`Seta_Credenciais_` → `Obter_Token_FOCO` → ... → `Status_Code_Requicao2`) totalmente **desabilitado**.
8. **Ramo administrativo (manual)** — Manual Trigger → `CPF` (CPF fixo) → `Seta_Credenciais_FOCO1` → `Obter_Token1` → `HTTP Request CPF1` → `seta_Dados_Cliente1` → `Atualiza Status Termo Aceite FOCO1` (`TermoAceiteLGPD__c = "Não"`) → `Status_Code_Requicao1`.

Em caso de erro, o fluxo aciona o error workflow `ebJk0Lh3HwAysN53`.

## Integrações usadas

| Integração | Uso |
|---|---|
| **WhatsApp / Evolution API** (`n8n-nodes-evolution-api`, instância "SEBRAE") | Recebe a resposta (via webhook) e envia mensagens de confirmação/recusa/já-cadastrado e o PDF do termo. |
| **Supabase (Postgres)** — tabela `parceiros` | Consulta cadastro por telefone; grava `termo_aceito`/`data_aceite` (aceite) e `recusado`/`data_recusa` (recusa), filtrando por `cpf`. |
| **Supabase Storage** — bucket `TermosAceite` | Upload do PDF como `TermosAceite_<CPF_sem_pontuacao>.pdf` (upsert), projeto `qvjpnucpwdrtxfjqicsu`. |
| **Gotenberg** (`http://gotenberg:3000`) | Conversão HTML → PDF (Chromium). |
| **Google Drive** | Download do logo `Logo_Sebrae.png` para embutir no HTML. |
| **FOCO / Salesforce** (`gateway.sebrae.com.br/foco`) | OAuth2 client_credentials; SOQL em `Contact` por `CPF__c`; PATCH de `TermoAceiteLGPD__c` (Sim/Não). Ambiente de homologação (`hlg-gateway.../foco-stg`) presente porém desabilitado. |

## Contrato com o app SEBRAE

- O front-end SEBRAE envia o parceiro (payload `nome_razao_social`, `cpf`, `telefone`) para o fluxo de envio do termo; o parceiro responde **"1" (aceito)** ou **"2" (não aceito)** pelo WhatsApp, e a resposta chega a este fluxo via webhook da Evolution API.
- O aceite/recusa é gravado pelo n8n direto na tabela `parceiros` do Supabase: `termo_aceito` + `data_aceite` no aceite; `recusado` + `data_recusa` na recusa. A "assinatura digital" (hash SHA-256) é gerada no nó `Saida_HTML` e fica registrada **dentro do PDF** do termo (o fluxo não grava campo `assinatura_digital` na tabela — confirmar no fluxo de envio se essa gravação ocorre lá).
- O PDF do termo aceito é publicado no bucket `TermosAceite` como `TermosAceite_<CPF_sem_pontuacao>.pdf` e também enviado ao parceiro pelo WhatsApp como "Termo Assinado.pdf".
- O status LGPD é espelhado no CRM FOCO (Salesforce): `Contact.TermoAceiteLGPD__c = "Sim"` no aceite (a recusa não altera o FOCO pelo caminho automático).

## Credenciais referenciadas (apenas nome/tipo — nunca valores)

| Credencial (n8n) | Tipo | Usada em |
|---|---|---|
| `Google Drive account` | `googleDriveOAuth2Api` | Download logo |
| `Evolution API` | `evolutionApi` | Enviar texto / texto1 / texto2 / documento |
| `Acto` | `supabaseApi` | Filtra Cadastro, Atualiza Banco de Dados, Atualiza Banco de Dados1 |
| FOCO produção (Client Id/Secret) | par client_credentials **hardcoded em nós Set** (`Seta_Credenciais_FOCO`, `Seta_Credenciais_FOCO1`) — valores redigidos no espelho local | Obter_Token / Obter_Token1 |
| FOCO homologação (Client Id/Secret) | par client_credentials hardcoded em nó Set desabilitado (`Seta_Credenciais_`) — valores redigidos | Obter_Token_FOCO (desabilitado) |
| Supabase anon key (JWT) | header `Authorization`/`apikey` **hardcoded no nó HTTP** `Envio Documento Supabase` — valor redigido | Upload do PDF no Storage |

> [!WARNING]
> Os segredos do FOCO e a anon key do Supabase estão hardcoded no workflow da instância (não em credenciais n8n). No espelho local eles foram substituídos por `<<<REDACTED-...>>>`. Recomenda-se migrá-los para credenciais do n8n.

## Artefatos versionados

- `Code/Saida_HTML/` — geração do HTML do termo (JS).
- `Queries/HTTP Request CPF/`, `Queries/HTTP Request CPF1/`, `Queries/Busca pelo CPF/` — consultas SOQL ao FOCO.
- `Prompts/` — vazio (fluxo não usa LLM).
