# CHANGELOG — Monta rodape PDF

- **Fluxo:** `[Termo URC - Envio sem assinar]` (id `Hqfoa19HyX4QFOqW`)
- **Nó:** `Monta rodape PDF` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** acrescenta ao item o binário `footer` (`footer.html`) que o Gotenberg imprime como rodapé de **todas** as páginas do PDF, com "Página X de Y".

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-23 | em produção | Cria o `footer.html` com `<span class="pageNumber">` / `<span class="totalPages">` e o anexa em `item.binary.footer`, preservando o `data` (index.html). | Validado em fluxo temporário isolado antes de publicar: PDF saiu em A4 (596×842 pt) com "Página 1 de 3" … "Página 3 de 3". |

## Decisões registradas

**Por que um nó Code e não um segundo `Convert to File`.** O `Convert to File` grava o binário de saída no item e sobrescreveria o `data` (index.html) montado antes. O nó Code apenas **acrescenta** a segunda propriedade binária.

**Por que o nome do arquivo importa.** O Gotenberg identifica o rodapé pelo nome `footer.html` dentro do multipart, não pelo nome do campo — por isso os dois binários são enviados no mesmo campo `files`.

**Margem inferior.** O rodapé só aparece se houver espaço reservado: o nó do Gotenberg envia `marginBottom = 0.6` in (~15 mm).
