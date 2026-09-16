# CHANGELOG — Normaliza telefone

- **Fluxo:** `[Termo URC - Verifica WhatsApp]` (id `De7FxACcl71bzDom`)
- **Nó:** `Normaliza telefone` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** transforma o `telefone` do payload em `numero` (DDI 55 + dígitos) para a consulta à Evolution; sinaliza `valido = false` quando não dá para montar um número.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-09-16 | em produção | Versão inicial. Aceita 10/11 dígitos (acrescenta o 55) ou 12/13 já com 55; qualquer outro tamanho é inválido. | Testado por `curl` no webhook: `6733895349` → `556733895349`; `(67)99245-1961` → `5567992451961`; `123` → inválido sem chamar a Evolution. |

## Decisões registradas

**Tamanho antes do prefixo.** Um número de 10/11 dígitos que comece com `55` é DDD 55 (Rio Grande do Sul), não o DDI — por isso o teste de tamanho vem antes do `startsWith('55')`.

**Não acrescenta nem remove o 9.** Celulares antigos fora de SP/RJ/ES podem estar registrados no WhatsApp sem o nono dígito. Adivinhar geraria número errado; a Evolution devolve o JID real na consulta e é ele que o fluxo de envio usa.
