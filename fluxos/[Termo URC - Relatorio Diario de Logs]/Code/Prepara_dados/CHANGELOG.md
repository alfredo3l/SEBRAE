# CHANGELOG — Prepara dados

- **Fluxo:** `[Termo URC - Relatorio Diario de Logs]` (id `uuoLTg4EksPZpfwi`)
- **Nó:** `Prepara dados` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Normaliza as duas entradas (agendada: objeto da RPC; manual: resposta completa `{ statusCode, body }`) em um único formato com `executar`, `modo`, período, destinatários, totais, por usuário e eventos.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Geração do PDF conferida num fluxo temporário isolado (apagado) com os mesmos nós: A4, logo, cabeçalho de tabela repetido, rodapé "Página X de 6", HTML escapado. Envio real pela Evolution pendente. |
