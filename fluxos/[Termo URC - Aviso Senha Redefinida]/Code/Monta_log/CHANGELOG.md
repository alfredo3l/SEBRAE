# CHANGELOG — Monta log

- **Fluxo:** `[Termo URC - Aviso Senha Redefinida]` (id `sXKOKjNsKLyMGp3U`)
- **Nó:** `Monta log` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Registra no log do sistema o resultado do aviso (usuário recebeu a senha? quantos gestores avisados?), em nome do gestor que redefiniu. **Nunca inclui a senha.** Sem redefinição confirmada pelo banco, descrição vazia (nada gravado). Seguido de `Registra log` (HTTP Request, RPC `n8n_registrar_log`, credencial `Acto`, `onError: continueRegularOutput`); o `Responde` passou a usar `$('Resumo').first().json`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-10-08 | em produção | Versão inicial (logs do sistema — `supabase_logs_sistema.sql`). | Chamada real sem pedido/redefinição → resposta inalterada e nenhum registro gravado; caminho com descrição conferido na RPC (ator `sistema`/`usuario`, origem `n8n`). |
