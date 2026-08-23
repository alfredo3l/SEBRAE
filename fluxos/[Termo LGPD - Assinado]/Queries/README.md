# Queries — `[Termo LGPD - Assinado]`

Artefatos de consultas (SOQL via HTTP Request) do workflow `[Termo LGPD - Assinado]` (id `36Z66pbeI25m2MbJ`).

> [!NOTE]
> Os nós Supabase deste fluxo (`Filtra Cadastro`, `Atualiza Banco de Dados`, `Atualiza Banco de Dados1`) usam operações estruturadas (get/update com filtros), sem campo `query` em SQL — por isso não geram artefato aqui.

| Nó | Linguagem | Campo | Versão em produção | Última atualização |
|---|---|---|---|---|
| `HTTP Request CPF` | SOQL (Salesforce) | `queryParameters.q` | v001 | 2026-08-22 |
| `HTTP Request CPF1` | SOQL (Salesforce) | `queryParameters.q` | v001 | 2026-08-22 |
| `Busca pelo CPF` | SOQL (Salesforce) | `queryParameters.q` | v001 (nó desabilitado) | 2026-08-22 |
