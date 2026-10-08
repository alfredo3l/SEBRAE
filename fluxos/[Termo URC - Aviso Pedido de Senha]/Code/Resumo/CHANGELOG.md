# CHANGELOG — Resumo

- **Fluxo:** `[Termo URC - Aviso Pedido de Senha]` (id `fNRWBRfKLd1fbiEz`)
- **Nó:** `Resumo` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Conta os envios sem erro e devolve `{ ok, avisados, motivo }`. Fan-in proposital (If-false ou envio): só um roda por execução.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Caminho sem mensagem conferido por chamada real ao webhook; envio real pendente. |
