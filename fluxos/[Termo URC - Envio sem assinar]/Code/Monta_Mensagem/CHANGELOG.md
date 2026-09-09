# CHANGELOG — Monta_Mensagem

- **Fluxo:** `[Termo URC - Envio sem assinar]` (id `Hqfoa19HyX4QFOqW`)
- **Nó:** `Monta_Mensagem` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem o `=` de expressão)
- **Papel:** monta o texto que o nó `Enviar texto` envia ao cliente e decide se
  **esta** execução é a responsável pela mensagem — uma só por lote de documentos.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-09-09 | em produção | Versão inicial. Mensagem **consolidada** quando `body.lote.documentos` traz 2+ itens (um bloco 📄 + ✅/❌ por documento); mensagem **individual, idêntica à expressão anterior** do `Enviar texto`, com 1 documento ou payload sem `lote`. A capitalização do primeiro nome sai da expressão inline e vira a função `primeiroNome`. Devolve `mensagem_texto`, `enviar_texto` e `total_lote`. | 23 asserções em Node sobre este arquivo antes de publicar: mensagem de 3 documentos conferida caractere a caractere contra o formato aprovado; **mensagem de 1 documento e de payload sem `lote` comparadas com `assert.strictEqual` contra a renderização da expressão de produção** (idênticas); nome com acento, minúsculo, vazio, nulo e inicial solta; código minúsculo, código nulo, item sem nome; 7 documentos = 1.108 caracteres (limite do WhatsApp é 4.096). Publicado por `PUT /api/v1/workflows/:id` com `jsCode` conferido byte a byte no GET seguinte. |

## Decisões registradas

**Por que quem decide o texto é o front, e não o n8n.** Um clique com N documentos
dispara N execuções independentes e concorrentes deste fluxo; nenhuma delas enxerga as
outras, então não há como combinarem entre si quem manda o texto. Quem tem a visão do
lote é o sistema: ele reserva **todas** as letras (RPC `preparar_envio_documento`) antes
do primeiro POST e marca `lote.enviar_texto = true` em uma única chamada. Se essa falhar,
a flag passa para a próxima — o cliente nunca fica sem a mensagem.

**Por que a lista completa vai em todas as N chamadas.** Custa ~200 bytes e permite que
qualquer execução do lote monte a mesma mensagem consolidada, não só a primeira.

**Por que o item de entrada é preservado.** O nó acrescenta campos ao item que vem do
`If` (a linha do parceiro) em vez de devolver um item novo: mantém o pareamento de itens
e não descarta dados que os nós seguintes possam usar.

**Mudança de comportamento em borda.** A expressão anterior estourava com `Nome` nulo e
produzia "Olá, !" com `Nome` vazio. A função `primeiroNome` degrada para "Olá!" e ignora
inicial solta ("A CARLOS" → "Olá!").

**Emojis.** Só os funcionais previstos na convenção do projeto (📄 documento, ✅ aceite,
❌ recusa). O espaçamento de quatro espaços entre "Aceito" e "❌" é proposital: o WhatsApp
preserva espaços múltiplos no corpo da mensagem e isso separa visualmente as duas opções.

**Títulos com `*` ou `_`.** Nenhum termo do catálogo `TERMOS_URC` tem esses caracteres
hoje. Se algum vier a ter, viraria formatação markdown no WhatsApp e precisará ser
escapado aqui.
