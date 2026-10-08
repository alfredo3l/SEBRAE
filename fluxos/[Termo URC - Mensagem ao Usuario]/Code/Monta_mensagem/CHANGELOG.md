# CHANGELOG — Monta mensagem

- **Fluxo:** `[Termo URC - Mensagem ao Usuario]` (id `WxjQwFqYofDlbDh1`)
- **Nó:** `Monta mensagem` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Monta o texto final: "Olá, {destinatário}!", o texto do administrador e o rodapé com nome e WhatsApp do administrador ("para responder, fale diretamente com…"). Se o banco recusou (status ≠ 200), devolve `{ enviar: false, motivo }` com a mensagem do banco.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial. | Caminho recusado conferido por chamada real (token inválido → motivo do banco repassado); envio real pendente. |
