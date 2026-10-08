# CHANGELOG — Monta rodape PDF

- **Fluxo:** `[Termo URC - Relatorio Diario de Logs]` (id `uuoLTg4EksPZpfwi`)
- **Nó:** `Monta rodape PDF` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Acrescenta o binário `footer.html` ("TERMOS URC · Relatório de logs" + "Página X de Y") sem sobrescrever o `data`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Geração do PDF conferida num fluxo temporário isolado (apagado) com os mesmos nós: A4, logo, cabeçalho de tabela repetido, rodapé "Página X de 6", HTML escapado. Envio real pela Evolution pendente. |
