# CHANGELOG — HTTP Request CPF1

- **Fluxo:** `[Termo LGPD - Assinado]` (id `36Z66pbeI25m2MbJ`)
- **Nó:** `HTTP Request CPF1` (`n8n-nodes-base.httpRequest`, GET com query string)
- **Campo:** `queryParameters.q` (expressão, com `=`)
- **Papel:** Consulta SOQL na API do FOCO/Salesforce (produção) buscando o `Contact` por um CPF informado manualmente no nó `CPF`. Faz parte do ramo administrativo de gatilho manual ("ALTERA STATUS DO TERMO DE ACEITE NO FOCO") usado para reverter `TermoAceiteLGPD__c` para "Não" em um CPF específico.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-22 | em produção | Versão inicial (espelho da instância). | Espelhado do workflow ativo em produção. Ramo acionado apenas manualmente. |
