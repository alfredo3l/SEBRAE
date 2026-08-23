# Queries — `[Termo LGPD - Envio sem assinar]`

> [!NOTE]
> Este fluxo não possui nós com query SQL/SOQL literal. As duas operações de banco (`Get a row` e `Atualiza Banco de Dados`, ambas `n8n-nodes-base.supabase`) usam o modo declarativo do nó Supabase (tabela `parceiros` + filtros por campo), sem campo `query` — portanto não há artefato `.sql` a versionar. O nó `HTTP Request` chama o Gotenberg (conversão HTML→PDF), sem query.
