# Queries — [Termo URC - Envio sem assinar]

> [!NOTE]
> Os nós Supabase deste fluxo (`Get a row`, `Atualiza Banco de Dados`) são declarativos —
> tabela, filtros e campos configurados na interface, sem SQL literal. Não há queries para versionar.
>
> - `Get a row`: `parceiros` filtrado por `telefone`
> - `Atualiza Banco de Dados`: `documentos` filtrado por `id`, gravando `status = enviado` e `data_envio`
