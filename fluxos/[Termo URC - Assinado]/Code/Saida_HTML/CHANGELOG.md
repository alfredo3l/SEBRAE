# CHANGELOG — Saida_HTML

- **Fluxo:** `[Termo URC - Assinado]` (id `7ITLaIB5rSc7EoTd`)
- **Nó:** `Saida_HTML` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** monta o HTML do **documento aceito** (logo + termo + bloco de evidências do aceite + hash SHA-256) que o Gotenberg converte no PDF assinado.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-23 | arquivada | Cópia do fluxo `[Termo LGPD - Assinado]`: HTML fixo do Termo de Consentimento LGPD, sem evidências do aceite. | Servia apenas ao LGPD. |
| v002 | 2026-08-23 | arquivada | Usa `HtmlDocumento` (guardado em `documentos.html_documento`) como corpo e `NomeDocumento` como título; acrescenta o bloco **"Aceite eletrônico registrado"** (nome, CPF, data/hora, canal/telefone, texto exato da resposta, letra do documento e id) e transforma o hash em **assinatura digital do aceite** (inclui id do documento e data/hora). Sem HTML recebido, mantém o corpo do LGPD. | Aplicado na instância em 23/08/2026 15:36. |
| v003 | 2026-08-23 | em produção | **Regras de paginação do PDF**: `break-inside: avoid` nos blocos que não podem ser partidos (quadro de evidências do aceite, fecho com nota jurídica + assinatura digital, citação legal, assinatura do termo e rodapé), `break-after: avoid` no local/data e nos títulos, `orphans`/`widows` nos parágrafos; classes `bloco-evidencias`, `bloco-fecho` e `doc-rodape` aplicadas aos blocos; `overflow:hidden` removido do container (atrapalha a paginação no Chromium). | Antes: 14 de 24 casos com bloco partido (o quadro de evidências quebrava ao meio). Depois: 0 de 24. Validado renderizando com Chrome headless e conferindo o texto página a página, e no PDF real do Gotenberg. |

## Decisões registradas

**Por que o hash mudou de conteúdo.** Agora combina `documento_id | nome | CPF | nome do documento | data-hora do aceite`, garantindo hashes distintos para termos diferentes do mesmo cliente aceitos no mesmo instante — e amarrando a assinatura ao registro específico em `documentos`.

**Por que o texto da resposta entra no PDF.** É a evidência de que o aceite partiu do cliente (RF09): fica registrado o que ele digitou (`1B`, por exemplo) e por qual canal.

**Fallback do corpo LGPD.** Documentos anteriores à coluna `html_documento` (ou chamadas manuais) ainda geram um termo válido em vez de um PDF vazio.
