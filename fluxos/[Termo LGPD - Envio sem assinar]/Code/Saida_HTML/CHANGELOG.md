# CHANGELOG — Saida_HTML

- **Fluxo:** `[Termo LGPD - Envio sem assinar]` (id `pJecOOv0Sqxippeu`)
- **Nó:** `Saida_HTML` (`n8n-nodes-base.code`, Run Once for All Items — padrão)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** Gera o HTML completo do Termo de Consentimento LGPD do SEBRAE. Lê o logo em Base64 do nó anterior (`converte Base 64`) e os dados do parceiro do nó `seta_Dados` (Nome, CPF, Telefone), formata CPF/telefone, calcula um hash SHA-256 (implementação em JS puro, sem módulo `crypto`) sobre `nome|cpf|dataEnvio|timestamp` e monta o documento com data/hora no fuso `America/Campo_Grande`. Retorna `{ erro, nome, cpf, telefone, dataEnvioTermo, hash, dataGeracao, htmlEmail }`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-22 | em produção | Versão inicial (espelho da instância). | Espelhado do workflow ativo em produção. |
