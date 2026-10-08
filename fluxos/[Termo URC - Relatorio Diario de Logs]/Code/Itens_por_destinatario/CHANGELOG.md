# CHANGELOG — Itens por destinatario

- **Fluxo:** `[Termo URC - Relatorio Diario de Logs]` (id `uuoLTg4EksPZpfwi`)
- **Nó:** `Itens por destinatario` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Um item por destinatário ativo: mensagem de apresentação (📄 título, período, nº de eventos) + o mesmo PDF em base64.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Geração do PDF conferida num fluxo temporário isolado (apagado) com os mesmos nós: A4, logo, cabeçalho de tabela repetido, rodapé "Página X de 6", HTML escapado. Envio real pela Evolution pendente. |
