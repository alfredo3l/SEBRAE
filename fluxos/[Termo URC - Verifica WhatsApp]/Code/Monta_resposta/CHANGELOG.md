# CHANGELOG — Monta resposta

- **Fluxo:** `[Termo URC - Verifica WhatsApp]` (id `De7FxACcl71bzDom`)
- **Nó:** `Monta resposta` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** consolida em um único JSON o que o front precisa saber: se o número tem WhatsApp (`exists`), o JID real (`jid`/`whatsapp`) e o motivo quando não tem ou quando a consulta falhou (`ok: false`, `exists: null`).

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-09-16 | em produção | Versão inicial. Trata os três desfechos: telefone inválido, erro da Evolution (`onError: continueRegularOutput` do nó anterior) e resposta normal. | `556733895349` (fixo com WhatsApp Business) → `exists: true`; `(67)99245-1961` → `jid 556792451961@s.whatsapp.net` (registrado **sem o 9**); `6730000000` → `exists: false`. |

## Decisões registradas

**Três desfechos, um contrato.** `exists: true` libera o envio; `exists: false` bloqueia; `exists: null` (com `ok: false`) significa "não deu para verificar" e o front **não bloqueia**, só avisa — a Evolution é a mesma que faria o envio, então indisponibilidade dela precisa aparecer para o consultor, mas não pode prendê-lo numa verificação.

**Fan-in proposital.** O nó recebe conexão do `Telefone valido?` (saída *false*) e do `Consulta Evolution`; só um dos dois produz item por execução, então não há multiplicação de itens (ver armadilha de 23/08/2026 no fluxo de envio).

**`whatsapp` = JID sem `@s.whatsapp.net`.** É o formato que o nó Evolution do n8n espera em `remoteJid` no fluxo de envio.
