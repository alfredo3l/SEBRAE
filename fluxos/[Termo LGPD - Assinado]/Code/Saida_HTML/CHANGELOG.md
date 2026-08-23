# CHANGELOG — Saida_HTML

- **Fluxo:** `[Termo LGPD - Assinado]` (id `36Z66pbeI25m2MbJ`)
- **Nó:** `Saida_HTML` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Gera o HTML do Termo de Consentimento LGPD com os dados do parceiro (nome, CPF e telefone vindos do nó `seta_Dados`), embute o logo do SEBRAE em base64, formata CPF/telefone, registra data/hora do aceite no fuso America/Campo_Grande e calcula um hash SHA-256 (implementação em JS puro) como assinatura digital do documento.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-22 | em produção | Versão inicial (espelho da instância). | Espelhado do workflow ativo em produção. |
