# CHANGELOG — Monta HTML

- **Fluxo:** `[Termo URC - Relatorio Diario de Logs]` (id `uuoLTg4EksPZpfwi`)
- **Nó:** `Monta HTML` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** HTML do PDF (A4 retrato): cabeçalho azul com o logo branco, período, 8 indicadores, eventos por categoria (barras), atividade por usuário e a lista de eventos (sem "tela aberta", que só é contada). Sem movimento → quadro "Nenhuma atividade registrada no período". Entrega `html_base64` (o Convert to File espera base64). "Gerado em" usa o fim do período (horário do banco).

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Geração do PDF conferida num fluxo temporário isolado (apagado) com os mesmos nós: A4, logo, cabeçalho de tabela repetido, rodapé "Página X de 6", HTML escapado. Envio real pela Evolution pendente. |
