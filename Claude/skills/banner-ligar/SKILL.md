---
name: banner-ligar
description: Liga a faixa de ambiente do FOCO no topo de todas as telas do TERMOS URC (vermelha "AMBIENTE DE PRODUÇÃO" ou âmbar "AMBIENTE DE HOMOLOGAÇÃO"). Use quando o desenvolvedor pedir para "ligar/mostrar/ativar o banner ou a faixa de ambiente".
---

# Ligar a faixa de ambiente

A faixa (`js/ambiente-banner.js`) mostra no topo das 6 páginas (index, detalhe, documento, acompanhamento,
usuarios, login) em qual FOCO o sistema está ligado, lendo o header `X-Foco-Ambiente` do proxy. Ela troca
sozinha quando o ambiente muda (`/foco-homologacao`, `/foco-producao`) — esta skill só a liga/desliga.

## Passo a passo

1. Situação atual:
   ```bash
   node scripts/banner-ambiente.js status
   ```
2. Ligar (insere a linha marcada `FAIXA DE AMBIENTE` antes de `js/supabase-config.js` em cada página; idempotente):
   ```bash
   node scripts/banner-ambiente.js ligar
   ```
   Se acusar `js/ambiente-banner.js` ausente, recupere-o do git (`git log --all -- js/ambiente-banner.js`) — **pergunte antes**.
3. Confira: `status` deve dizer **LIGADA em todas as páginas** e `grep -n "ambiente-banner" *.html` deve listar 6 linhas (sem contar `POC_*.html`/`docs/`).
4. Local: com o `npm run dev` rodando, recarregue a página — a faixa aparece no topo (o servidor local é estático, não precisa reiniciar).
5. **Publicar na Vercel exige commit + push** — pergunte ao desenvolvedor antes (o repositório é público). Após o deploy, confira em `https://sebrae-seven.vercel.app/login`.
6. Reporte o resultado de cada passo (não apenas "feito").

Para desligar: `/banner-desligar`.
