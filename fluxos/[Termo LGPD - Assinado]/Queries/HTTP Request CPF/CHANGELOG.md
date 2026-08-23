# CHANGELOG — HTTP Request CPF

- **Fluxo:** `[Termo LGPD - Assinado]` (id `36Z66pbeI25m2MbJ`)
- **Nó:** `HTTP Request CPF` (`n8n-nodes-base.httpRequest`, GET com query string)
- **Campo:** `queryParameters.q` (expressão, com `=`)
- **Papel:** Consulta SOQL na API do FOCO/Salesforce (produção — `gateway.sebrae.com.br/foco`) buscando o `Contact` pelo CPF do parceiro que aceitou o termo (`{{ $('seta_Dados').item.json.CPF }}`), para obter o `Id` usado no PATCH de `TermoAceiteLGPD__c = "Sim"`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-22 | em produção | Versão inicial (espelho da instância). | Espelhado do workflow ativo em produção. |
