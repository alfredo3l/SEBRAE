# [Termo URC - Envio sem assinar]

- **ID:** `Hqfoa19HyX4QFOqW` · **Status:** ativo · **Nós:** 22 · **Criado:** 23/08/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC`
- **Origem:** cópia de `[Termo LGPD - Envio sem assinar]` (`pJecOOv0Sqxippeu`), adaptada em 23/08/2026 para atender **todos os termos URC**.

Envia ao cliente, por WhatsApp, o documento gerado no sistema (ainda sem assinatura), para leitura e aceite.

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC)
  → instancia (Set: instancia = "SEBRAE")
  → seta_Dados (Set: Nome, CPF, Telefone, Email, TipoDocumento, NomeDocumento, DocumentoId, HtmlDocumento)
  → Get a row (Supabase: parceiros por telefone)
  → If (telefone existe?)
       ├─ false → No Operation (encerra em silêncio)
       └─ true  → Download logo (Google Drive) → converte Base 64
                  → Saida_HTML (Code: monta o HTML do documento — dinâmico)
                  → HTML → HTML_Base64 → Convert to File
                  → HTTP Request (Gotenberg: HTML → PDF)
                  → Extract from File
                  → Atualiza Banco de Dados (Supabase: documentos.status = enviado, data_envio)
                  → Enviar texto (Evolution API) → Wait 1s → Enviar documento (PDF)
```

## O que é dinâmico por termo (desde 23/08/2026)

| Nó | Comportamento |
|---|---|
| `seta_Dados` | Lê `documento.tipo`, `documento.nome`, `documento.id` e `documento.html` do payload; sem eles, assume o Termo LGPD |
| `Saida_HTML` | Usa o HTML do termo recebido como corpo do PDF (título = `NomeDocumento`); fallback = texto do LGPD — ver `Code/Saida_HTML/CHANGELOG.md` |
| `HTTP Request` | `Gotenberg-Output-Filename` = nome do documento + data |
| `Enviar texto` | Mensagem cita o nome do documento em vez de fixar "Termo de Consentimento LGPD" |
| `Enviar documento` | Nome do PDF = nome do documento (`.pdf`) |
| `Atualiza Banco de Dados` | Atualiza **`documentos`** (`status = enviado`, `data_envio`) filtrando por `documento.id`; `onError: continueRegularOutput` para nunca impedir o envio |

## Contrato com o sistema

Payload completo documentado em [`fluxos/webhook-n8n.md`](../webhook-n8n.md). Resumo:
`nome_razao_social`, `cpf`, `telefone`, `email` na raiz (compatibilidade) + blocos
`documento` (id, tipo, nome, html, campos), `cliente`, `interacao` e `consultor`.

⚠️ O nó `Get a row` localiza o parceiro **pelo telefone**; o cliente precisa existir em `parceiros`
com o mesmo número enviado.

## Credenciais referenciadas

Google Drive (logo), Supabase "Acto", Evolution API (instância `SEBRAE`). Nenhum valor fica no fluxo.

## Correção de mensagens duplicadas (23/08/2026)

O fluxo enviava **duas mensagens e dois PDFs** por clique. Causa: `seta_Dados` recebia
**duas conexões no mesmo input** (`Webhook → seta_Dados` **e** `Webhook → instancia → seta_Dados`),
então o Set produzia 2 itens e todo o restante do pipeline executava em dobro
(confirmado na execução 41007: `Webhook` output 1 item, `seta_Dados` output **2 itens**).

Correção: cadeia linear — `Webhook → instancia → seta_Dados`. A topologia com duas
entradas veio do fluxo LGPD original, que sofria do mesmo problema.

> Ao editar estes fluxos, verifique se nenhum nó recebe mais de uma conexão no mesmo input:
> no n8n isso multiplica os itens e duplica todo o caminho a jusante.

## Observações

- O nó `HTML` mantém `{{ $json.htmlEmail }}` **sem** o prefixo `=`: é um template do node HTML,
  que resolve a expressão nativamente. O `n8n_validate_workflow` aponta isso como erro — é falso
  positivo herdado do fluxo LGPD, que roda assim em produção.
- `settings` do workflow contém chaves que a API pública rejeita no PUT (`availableInMCP`,
  `timeSavedMode`, `binaryMode`). Ao atualizar por API, envie `settings` só com
  `executionOrder`, `callerPolicy` e `errorWorkflow` — o n8n repõe as demais.
- O aceite/recusa ainda é tratado pelo fluxo `[Termo LGPD - Assinado]`, que só conhece o LGPD
  (grava em `parceiros`). Tratar o aceite por documento é a próxima etapa.
