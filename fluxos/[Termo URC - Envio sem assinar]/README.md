# [Termo URC - Envio sem assinar]

- **ID:** `Hqfoa19HyX4QFOqW` · **Status:** ativo · **Nós:** 25 · **Criado:** 23/08/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC`
- **Origem:** cópia de `[Termo LGPD - Envio sem assinar]` (`pJecOOv0Sqxippeu`), adaptada em 23/08/2026 para atender **todos os termos URC**.

Envia ao cliente, por WhatsApp, o documento gerado no sistema (ainda sem assinatura), para leitura e aceite.

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC)
  → instancia (Set: instancia = "SEBRAE")
  → seta_Dados (Set: Nome, CPF, Telefone, Email, TipoDocumento, NomeDocumento, DocumentoId, HtmlDocumento)
  → Get a row (Supabase: parceiros por id = cliente.id do payload)
  → If (telefone existe?)
       ├─ false → No Operation (encerra em silêncio)
       └─ true  → Monta_Mensagem (Code: monta o texto do WhatsApp e decide se ESTA execução o envia)
                  → Enviar texto? (If: lote.enviar_texto)
                       ├─ true  → Enviar texto (Evolution API) ─┐
                       └─ false ──────────────────────────────┤
                                                               ↓
                  → Download logo (Google Drive) → converte Base 64
                  → Saida_HTML (Code: monta o HTML do documento — dinâmico)
                  → HTML → HTML_Base64 → Convert to File
                  → Monta rodape PDF (Code: binário footer.html, "Página X de Y")
                  → HTTP Request (Gotenberg: HTML → PDF A4)
                  → Extract from File
                  → Wait 1s → Enviar documento (PDF)
                  → Atualiza Banco de Dados (Supabase: documentos.status = enviado, data_envio)
```

O `Enviar texto` roda **antes** da geração do PDF: assim a mensagem sai em ~1 s e os PDFs
em ~6 s, o que garante a ordem mesmo com as N execuções de um lote correndo em paralelo.

## O que é dinâmico por termo (desde 23/08/2026)

| Nó | Comportamento |
|---|---|
| `seta_Dados` | Lê `documento.tipo`, `documento.nome`, `documento.id` e `documento.html` do payload; sem eles, assume o Termo LGPD |
| `Saida_HTML` | Usa o HTML do termo recebido como corpo do PDF (título = `NomeDocumento`); fallback = texto do LGPD — ver `Code/Saida_HTML/CHANGELOG.md` |
| `HTTP Request` | `Gotenberg-Output-Filename` = nome do documento + data |
| `Monta_Mensagem` | Monta o texto do WhatsApp: consolidado quando o lote tem 2+ documentos, individual quando tem 1 — ver `Code/Monta_Mensagem/CHANGELOG.md` |
| `Enviar texto` | `messageText` = `{{ $('Monta_Mensagem').first().json.mensagem_texto }}`; a mensagem cita o(s) documento(s) e seus códigos |
| `Enviar documento` | Nome do PDF = nome do documento (`.pdf`) |
| `Enviar texto` / `Enviar documento` | `remoteJid` = `cliente.whatsapp` do payload (JID devolvido pela verificação) ou, sem ele, `'55' + dígitos do telefone` |
| `Atualiza Banco de Dados` | Atualiza **`documentos`** (`status = enviado`, `data_envio`) filtrando por `documento.id`, **depois** do `Enviar documento` (desde 16/09/2026); `onError: continueRegularOutput` |

## Contrato com o sistema

Payload completo documentado em [`fluxos/webhook-n8n.md`](../webhook-n8n.md). Resumo:
`nome_razao_social`, `cpf`, `telefone`, `email` na raiz (compatibilidade) + blocos
`documento` (id, tipo, nome, html, campos), `cliente`, `interacao` e `consultor`.

O nó `Get a row` localiza o parceiro pelo **`cliente.id`** (uuid) do payload. ⚠️ Até 16/09/2026 era
por **igualdade exata de `telefone`**: qualquer diferença de máscara entre o formulário e o cadastro
(`(67)992451961` × `(67)99245-1961`) devolvia vazio, o `If` caía no ramo vazio e **nada era enviado** —
com a execução terminando em "success" e o front recebendo 200 (execução 42721). Ver também
"Verificação do WhatsApp e ordem da gravação".

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
- O aceite/recusa é tratado por documento no fluxo `[Termo URC - Assinado]` (`7ITLaIB5rSc7EoTd`),
  que identifica o termo pela letra da resposta (`1A`/`2A`).

## Paginação do PDF (23/08/2026)

O HTML enviado ao Gotenberg vinha de um template de **e-mail** e não tinha nenhuma regra de
paginação: o Chromium quebrava a página em qualquer ponto e chegou a **partir ao meio o quadro
"ACEITE ELETRÔNICO REGISTRADO"** — nome/CPF/data numa página, resposta do cliente e assinatura
digital na outra.

**No `Saida_HTML` (v003):**

| Regra | Efeito |
|---|---|
| `break-inside: avoid` em `.bloco-evidencias`, `.bloco-fecho`, `.doc-citacao`, `.doc-assinatura`, `.doc-rodape` | esses blocos nunca são partidos: se não couberem no resto da folha, vão inteiros para a próxima |
| `break-after: avoid` em `.doc-assinatura-espaco` e nos títulos | local/data não se separa da linha de assinatura; título não fica sozinho no pé da página |
| `orphans: 3; widows: 3` | nenhuma linha solta de parágrafo no começo/fim da página |
| `overflow:hidden` removido do container | resquício do template de e-mail, atrapalha a paginação no Chromium |

As classes `doc-*` são as mesmas que o sistema grava em `documentos.html_documento`, então
**documentos antigos também saem paginados corretamente**, sem precisar regerar nada.

**No nó do Gotenberg (`HTTP Request`):** `paperWidth=8.27` / `paperHeight=11.69` (**A4**),
`marginTop=0.4`, `marginBottom=0.6` (folga do rodapé), `marginLeft/Right=0.3` e
**`printBackground=true`** — sem este último o fundo verde do quadro de evidências some do PDF.
Não usar `@page` no CSS: as margens do Gotenberg somariam com as do CSS.

**Rodapé numerado:** o nó `Monta rodape PDF` acrescenta o binário `footer` (`footer.html`) com
"Página X de Y", impresso pelo Gotenberg em todas as páginas. Cadeia:
`Convert to File → Monta rodape PDF → HTTP Request`.

**Como foi verificado.** Antes de publicar, o código real do nó foi executado localmente com o
`html_documento` de termos reais, renderizado em PDF pelo Chrome headless e conferido página a
página (texto extraído do PDF): **14 de 24 casos partiam blocos antes, 0 depois** no fluxo de
aceite e 8 → 0 no de envio. Os parâmetros do Gotenberg foram testados num workflow temporário
isolado — nunca nos fluxos de produção — e o PDF final saiu em A4 com o rodapé correto.

## Mensagem única por lote (09/09/2026)

Com a seleção múltipla de termos, um clique com 3 documentos disparava 3 execuções deste
fluxo e o cliente recebia **3 mensagens de texto quase idênticas** antes dos 3 PDFs.

Agora o cliente recebe **uma única mensagem** listando todos os documentos com seus códigos,
seguida dos PDFs (que continuam separados — a Evolution API envia um anexo por mensagem).

Como funciona, já que as execuções são independentes e não se enxergam: **quem decide é o
sistema**. Ele reserva todas as letras (RPC `preparar_envio_documento`) antes do primeiro
POST e envia, em todas as N chamadas, o bloco `lote` com a lista completa — marcando
`enviar_texto: true` em **uma só**. Se essa chamada falhar, a flag passa para a próxima.

Dois nós novos: **`Monta_Mensagem`** (Code) monta o texto e repassa o `enviar_texto`;
**`Enviar texto?`** (If) deixa passar apenas a execução responsável pela mensagem.

⚠️ **Fan-in em `Download logo`.** Ele passou a receber duas conexões no mesmo input
(`Enviar texto` e o ramo *false* do `Enviar texto?`). Isso **não** repete o problema de
23/08 (mensagens duplicadas), porque lá as duas conexões traziam itens na mesma execução;
aqui o If roteia o item para exatamente uma saída, `alwaysOutputData` fica desligado e a
cadeia inteira trafega 1 item. Ao mexer no fluxo, conferir na execução que **todo nó sai
com 1 item** e que o `Enviar texto` aparece como não executado nas chamadas 2..N.

Com **um único documento** — ou com um payload antigo, sem o bloco `lote` — a mensagem é
byte a byte a mesma de antes (verificado com `assert.strictEqual` contra a renderização da
expressão anterior).

## Verificação do WhatsApp e ordem da gravação (16/09/2026)

Um lote de 3 documentos para um cliente com telefone **fixo** (`6733895349`) mostrou dois
pontos cegos: (1) o fluxo não sabia se o número tinha WhatsApp — a Evolution aceita a mensagem
e devolve `status: PENDING` mesmo para número inexistente, e as 3 execuções terminaram com
sucesso; (2) `Atualiza Banco de Dados` gravava `enviado` **antes** do `Enviar documento`.

- A verificação ficou num fluxo próprio, **`[Termo URC - Verifica WhatsApp]`**
  (`De7FxACcl71bzDom`, webhook `/webhook/TERMOS-URC-VERIFICA`), chamado pelo sistema **antes**
  de reservar as letras — sem WhatsApp, nada é enviado nem gravado. Este fluxo não verifica
  de novo (decisão de 16/09/2026: verificação só no front).
- O `remoteJid` dos dois nós da Evolution passou a usar `body.cliente.whatsapp` (JID devolvido
  pela verificação, que resolve celulares registrados sem o 9) com fallback no
  `'55' + dígitos` de sempre.
- Cadeia final reordenada: `Extract from File → Wait → Enviar documento → Atualiza Banco de Dados`.
  Obs.: o sistema já marca `enviado` pela RPC `preparar_envio_documento` antes do POST, então o
  efeito prático da reordenação é só o `data_envio` do fluxo refletir o envio real.
- Publicado por `n8n_update_partial_workflow` (12 operações) — a ferramenta agora contorna o
  problema do `settings` desta instância (deixa `timeSavedMode` de fora e avisa); conferido
  `versionId == activeVersionId` (`84b6facd…`) no GET seguinte.
