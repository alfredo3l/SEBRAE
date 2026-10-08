# CHANGELOG — Monta mensagens

- **Fluxo:** `[Termo URC - Aviso Pedido de Senha]` (id `fNRWBRfKLd1fbiEz`)
- **Nó:** `Monta mensagens` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Monta uma mensagem por gestor de senhas com WhatsApp; sem pedido novo ou sem gestor com número, devolve 1 item `{ enviar: false, motivo }` (o If desvia para a resposta).

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | substituída | Versão inicial. | Envio real conferido em 08/10/2026 (mensagem chegou ao Administrador SEBRAE). |
| v002 | 2026-10-08 | em produção | Removido o link `https://sebrae-seven.vercel.app/usuarios` do fim da mensagem (pedido do desenvolvedor: o WhatsApp gerava a prévia do site). | Publicado, `versionId == activeVersionId`; nó `Resumo` inalterado. |
