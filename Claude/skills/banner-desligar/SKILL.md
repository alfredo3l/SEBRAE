---
name: banner-desligar
description: Desliga a faixa de ambiente do FOCO (produção/homologação) do topo das telas do TERMOS URC. Use quando o desenvolvedor pedir para "desligar/esconder/remover o banner ou a faixa de ambiente", por exemplo após o SEBRAE validar o sistema.
---

# Desligar a faixa de ambiente

Remove das 6 páginas (index, detalhe, documento, acompanhamento, usuarios, login) a linha que carrega
`js/ambiente-banner.js`. O arquivo JS **é mantido** — religar é só `/banner-ligar`. Desligada, as páginas
ficam idênticas a antes da faixa existir.

## Passo a passo

1. Situação atual:
   ```bash
   node scripts/banner-ambiente.js status
   ```
2. Desligar (remove a linha marcada `FAIXA DE AMBIENTE`; idempotente):
   ```bash
   node scripts/banner-ambiente.js desligar
   ```
3. Confira: `status` deve dizer **DESLIGADA em todas as páginas** e `grep -n "ambiente-banner" *.html` não deve listar nada (fora `POC_*.html`/`docs/`).
4. Local: recarregue a página — a faixa some.
5. **Publicar na Vercel exige commit + push** — pergunte ao desenvolvedor antes. Após o deploy, confira em `https://sebrae-seven.vercel.app/login`.
6. Reporte o resultado de cada passo (não apenas "feito").

## Remoção definitiva (só se o desenvolvedor pedir)

Depois de desligar, para apagar de vez: remover `js/ambiente-banner.js`, `scripts/banner-ambiente.js`, as skills
`banner-ligar`/`banner-desligar` (em `Claude/skills/` **e** `.claude/skills/`) e a menção na seção
"Ambientes do FOCO" do `Claude/CLAUDE.md`. O header `X-Foco-Ambiente` dos proxies continua útil para as
skills `/foco-*` — não remover junto.
