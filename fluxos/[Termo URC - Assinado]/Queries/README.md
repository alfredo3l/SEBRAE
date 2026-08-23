# Queries — [Termo URC - Assinado]

> [!NOTE]
> Os nós Supabase deste fluxo são declarativos (tabela/filtros na interface), sem SQL literal:
>
> - `Busca Pendentes`: view **`vw_documentos_pendentes`** filtrada por `telefone`
> - `Atualiza Banco de Dados`: `documentos` por `id` → aceite
> - `Atualiza Banco de Dados1`: `documentos` por `id` → recusa
> - `Atualiza Parceiros LGPD`: `parceiros` por `cpf` (somente Termo LGPD)
>
> A view e a RPC `preparar_envio_documento` são criadas em `supabase_aceite_documentos.sql` (raiz do projeto).
>
> O ramo FOCO usa SOQL sobre `Contact` via HTTP Request (`HTTP Request CPF`), documentado em
> `docs/integracao-foco/README.md`.
