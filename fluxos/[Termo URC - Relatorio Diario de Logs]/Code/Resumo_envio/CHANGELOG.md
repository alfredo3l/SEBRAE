# CHANGELOG — Resumo envio

- **Fluxo:** `[Termo URC - Relatorio Diario de Logs]` (id `uuoLTg4EksPZpfwi`)
- **Nó:** `Resumo envio` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Conta os PDFs entregues e monta o registro do envio (`p_*` da RPC `n8n_registrar_envio_relatorio`; `p_modo` nulo quando não executou = nada gravado) e a resposta do botão "Enviar agora".

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Geração do PDF conferida num fluxo temporário isolado (apagado) com os mesmos nós: A4, logo, cabeçalho de tabela repetido, rodapé "Página X de 6", HTML escapado. Envio real pela Evolution pendente. |
