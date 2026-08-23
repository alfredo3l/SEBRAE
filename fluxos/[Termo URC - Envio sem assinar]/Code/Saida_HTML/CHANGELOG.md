# CHANGELOG — Saida_HTML

- **Fluxo:** `[Termo URC - Envio sem assinar]` (id `Hqfoa19HyX4QFOqW`)
- **Nó:** `Saida_HTML` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** monta o HTML final do documento (logo SEBRAE + título + corpo + hash SHA-256 + rodapé) que o Gotenberg converte em PDF.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-23 | arquivada | Cópia do fluxo `[Termo LGPD - Envio sem assinar]` — HTML fixo do Termo de Consentimento LGPD. Código idêntico ao versionado em `fluxos/[Termo LGPD - Envio sem assinar]/Code/Saida_HTML/v001.js`. | Só servia ao LGPD: qualquer termo enviado saía com o texto da LGPD. |
| v002 | 2026-08-23 | arquivada | **Documento dinâmico**: usa `HtmlDocumento` (vindo de `documento.html` no webhook) como corpo e `NomeDocumento` como título; remove o `<h3>` duplicado do fragmento; adiciona `<style>` para as classes dos termos (`doc-lacuna`, `doc-citacao`, `doc-assinatura*`); inclui o nome do documento no conteúdo do hash; retorna também `tipo_documento`, `nome_documento` e `documento_id`. Sem HTML recebido, mantém o corpo do LGPD (compatibilidade). | Aplicado na instância em 23/08/2026 15:08. |
| v003 | 2026-08-23 | em produção | **Regras de paginação do PDF**: mesmas do fluxo de aceite — `break-inside: avoid` no fecho (nota jurídica + hash), na citação legal, na assinatura e no rodapé; local/data colado à assinatura; `orphans`/`widows`; classes `bloco-fecho` e `doc-rodape`; `overflow:hidden` removido. | Antes: 8 blocos partidos em 24 casos. Depois: 0. |

## Decisões registradas

**Por que o corpo do LGPD continua no código.** O payload do sistema sempre envia `documento.html`, mas o fallback garante que uma chamada antiga (ou um teste manual sem o bloco `documento`) ainda gere um termo válido em vez de um PDF vazio.

**Por que o `<h3>` do fragmento é removido.** O HTML gerado pelo front (`TERMOS_URC[tipo].template()`) começa com o título em `<h3>`; o layout do PDF já imprime o título no cabeçalho, então manter os dois duplicaria o nome do termo.

**Hash SHA-256.** Continua sendo a assinatura digital do documento; agora o nome do documento entra no conteúdo do hash, de modo que dois termos diferentes do mesmo cliente, no mesmo instante, gerem hashes distintos.
