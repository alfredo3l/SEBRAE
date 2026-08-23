# CHANGELOG — Saida_HTML

- **Fluxo:** `[Termo URC - Assinado]` (id `7ITLaIB5rSc7EoTd`)
- **Nó:** `Saida_HTML` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** monta o HTML do **documento aceito** (logo + termo + bloco de evidências do aceite + hash SHA-256) que o Gotenberg converte no PDF assinado.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-23 | arquivada | Cópia do fluxo `[Termo LGPD - Assinado]`: HTML fixo do Termo de Consentimento LGPD, sem evidências do aceite. | Servia apenas ao LGPD. |
| v002 | 2026-08-23 | em produção | Usa `HtmlDocumento` (guardado em `documentos.html_documento`) como corpo e `NomeDocumento` como título; acrescenta o bloco **"Aceite eletrônico registrado"** (nome, CPF, data/hora, canal/telefone, texto exato da resposta, letra do documento e id) e transforma o hash em **assinatura digital do aceite** (inclui id do documento e data/hora). Sem HTML recebido, mantém o corpo do LGPD. | Aplicado na instância em 23/08/2026 15:36. |

## Decisões registradas

**Por que o hash mudou de conteúdo.** Agora combina `documento_id | nome | CPF | nome do documento | data-hora do aceite`, garantindo hashes distintos para termos diferentes do mesmo cliente aceitos no mesmo instante — e amarrando a assinatura ao registro específico em `documentos`.

**Por que o texto da resposta entra no PDF.** É a evidência de que o aceite partiu do cliente (RF09): fica registrado o que ele digitou (`1B`, por exemplo) e por qual canal.

**Fallback do corpo LGPD.** Documentos anteriores à coluna `html_documento` (ou chamadas manuais) ainda geram um termo válido em vez de um PDF vazio.
