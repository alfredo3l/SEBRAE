# CHANGELOG — Resumo

- **Fluxo:** `[Termo URC - Mensagem ao Usuario]` (id `WxjQwFqYofDlbDh1`)
- **Nó:** `Resumo` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Devolve `{ ok, enviado, motivo }` ao front. Fan-in proposital (If-false ou depois do registro do resultado): só um roda por execução.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Caminho recusado conferido por chamada real (token inválido → motivo do banco repassado); envio real pendente. |
