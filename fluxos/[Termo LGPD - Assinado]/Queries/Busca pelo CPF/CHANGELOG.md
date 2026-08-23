# CHANGELOG — Busca pelo CPF

- **Fluxo:** `[Termo LGPD - Assinado]` (id `36Z66pbeI25m2MbJ`)
- **Nó:** `Busca pelo CPF` (`n8n-nodes-base.httpRequest`, GET com query string — **nó desabilitado**)
- **Campo:** `queryParameters.q` (expressão, com `=`)
- **Papel:** Consulta SOQL no ambiente de homologação do FOCO/Salesforce (`hlg-gateway.sebrae.com.br/foco-stg`) buscando o `Contact` pelo CPF de `seta_Dados2` (fluxo de recusa). O ramo inteiro está desabilitado — a recusa hoje é registrada apenas no Supabase, pois o FOCO não aceita valor diferente de Sim/Não.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-22 | desabilitado | Versão inicial (espelho da instância). | Espelhado do workflow ativo em produção; nó e ramo de homologação encontram-se desabilitados. |
