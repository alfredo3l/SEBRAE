# CHANGELOG — Monta mensagens

- **Fluxo:** `[Termo URC - Aviso Senha Redefinida]` (id `sXKOKjNsKLyMGp3U`)
- **Nó:** `Monta mensagens` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Mensagem ao usuário com a senha temporária (em bloco monoespaçado, para `*`/`_` da senha não virarem formatação) + uma por gestor restante com WhatsApp. Sem confirmação do banco ou sem ninguém com número → `{ enviar: false, motivo }`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | substituída | Versão inicial. | Envio real conferido em 08/10/2026 (senha temporária recebida pelo usuário de teste). |
| v002 | 2026-10-08 | em produção | Removido o link `https://sebrae-seven.vercel.app/login` do fim da mensagem ao usuário (pedido do desenvolvedor, igual ao fluxo de pedido de senha). | Publicado, `versionId == activeVersionId`; nó `Resumo` inalterado. |
