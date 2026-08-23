# CHANGELOG — Identifica Documento

- **Fluxo:** `[Termo URC - Assinado]` (id `7ITLaIB5rSc7EoTd`)
- **Nó:** `Identifica Documento` (`n8n-nodes-base.code`, Run Once for All Items)
- **Campo:** `jsCode` (sem `=` de expressão)
- **Papel:** decide **a qual documento** a resposta do cliente se refere. Recebe os documentos pendentes (view `vw_documentos_pendentes`, filtrados pelo telefone) e a mensagem do WhatsApp; devolve a ação para o `Switch`.

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | 2026-08-23 | arquivada | Versão inicial: normaliza o telefone do `remoteJid`, interpreta `1A`/`2A`/`A1`/`1`/`2`/`aceito B`, casa com o pendente pela letra, resolve sem código quando há um único pendente e sinaliza `ambiguo` quando há vários. | 11 casos de teste validados localmente. Problemas: filtrava por telefone formatado (não achava pendentes), não tratava áudio/mídia/reação e não ignorava mensagens do próprio bot. |
| v006 | 2026-08-23 | em produção | Saudação encerrada com **exclamação** — "Olá, [Nome]!" (antes "Olá, [Nome],") — a pedido do desenvolvedor. Única mudança em relação à v005 (linha do `tratamento`). | Trecho conferido na instância após o PUT. |
| v005 | 2026-08-23 | arquivada | Saudação **"Olá, [Nome],"** no lugar de "Prezado(a)" — evita supor o gênero do cliente. Demais textos idênticos à v004. | 16 cenários revalidados. |
| v004 | 2026-08-23 | arquivada | Reintroduz emojis **funcionais** (📄 documento, ✅ aceite, ❌ recusa, ⚠️ atenção), sem emojis emocionais. | — |
| v003 | 2026-08-23 | arquivada | **Tom institucional**: sem emojis e sem saudação informal — tratamento "Prezado(a) [Nome]," (exposto em `tratamento`, reutilizado pelas mensagens de aceite/recusa), redação impessoal. Comportamento idêntico ao da v002. | 16 cenários revalidados após a mudança de redação. |
| v002 | 2026-08-23 | arquivada | Telefone só em **dígitos** (casa com `vw_documentos_pendentes.telefone_digitos`); **ignora `fromMe`** (evita o bot responder a si mesmo) e reações; detecta **áudio**, **mídia** e legendas de imagem; lê respostas de botão/lista; e **monta a mensagem de orientação em linguagem natural** (`mensagem_orientacao`), variando o texto conforme o motivo (áudio, mídia, letra inexistente, faltou a letra, não entendi) e usando o primeiro nome do cliente. Ações reduzidas a `aceite` / `recusa` / `orientar` / `ignorar`. | 16 cenários testados localmente, incluindo áudio, figurinha, reação, emoji, teclado esbarrado, imagem com legenda `1B`, mensagem do próprio bot e um único pendente. |

## Ações retornadas

| `acao` | Quando | Destino no Switch |
|---|---|---|
| `aceite` | resposta 1 + documento identificado | ramo de aceite (gera PDF assinado) |
| `recusa` | resposta 2 + documento identificado | ramo de recusa |
| `orientar` | não deu para agir com segurança — o motivo vai em `motivo`: `falta_codigo` (só "1"/"2" com vários pendentes), `codigo_invalido` (letra inexistente), `audio`, `midia`, `nao_entendi` (texto aleatório, emoji, teclado esbarrado) | `Enviar orientacao` (mensagem pronta em `mensagem_orientacao`) |
| `ignorar` | mensagem do próprio SEBRAE (`fromMe`), reação/curtida, ou cliente **sem** documentos aguardando | fallback (NoOp — silêncio proposital) |

## Variações aceitas (validadas em teste)

A limpeza `toUpperCase()` + remoção de espaços e caracteres não alfanuméricos absorve as variações
mais comuns de digitação:

| Digitado | Interpretado |
|---|---|
| `1a`, `1 A`, `1-a`, `1.A`, `*1A*`, ` 1a ` | aceite do documento A |
| `2c`, `2 C`, `c2`, `C 2` | recusa do documento C |
| `aceito b`, `ACEITO B`, `sim b` | aceite do documento B |
| `nao c`, `recuso c` | recusa do documento C |
| `1`, `2` (com um único pendente) | aceite/recusa desse documento |
| `1z` (letra inexistente), `3A`, `11B`, `1AB`, `bom dia`, emoji | **não interpreta** → orientação |

## Decisões registradas

**Por que resolver sem código quando há um único pendente.** Mantém o comportamento histórico do Termo LGPD (cliente responde só "1") e evita atrito no caso mais comum — só exige a letra quando existe ambiguidade real.

**Por que nunca adivinhar.** Com vários pendentes e resposta sem letra, nada é gravado: o fluxo devolve a lista de documentos com suas letras. Registrar aceite no termo errado teria consequência jurídica.

**Por que frases livres não são interpretadas.** "Quero aceitar o termo" e "não quero aceitar" compartilham as mesmas palavras-chave; tentar deduzir a intenção correria o risco de registrar um aceite que o cliente não deu. O fluxo prefere orientar o cliente a responder no formato `1A`/`2A`.

**Tom das mensagens (definido pelo desenvolvedor).** Linguagem profissional e fluida, adequada ao SEBRAE: saudação **"Olá, [Nome]!"** (nunca "Prezado(a)", que expõe a incerteza sobre o gênero, nem "Oi"/"Prontinho"); frases impessoais na voz da instituição ("Recebemos sua mensagem de áudio…"); emojis apenas **funcionais** — 📄 para documento, ✅ para aceite, ❌ para recusa, ⚠️ para atenção — nunca emojis emocionais.

**Por que ignorar `fromMe`.** O evento `messages.upsert` da Evolution também chega para as mensagens que o próprio SEBRAE envia. Sem essa guarda, o fluxo processaria as próprias mensagens (risco de laço de respostas).

**Por que a mensagem é montada no Code.** O texto de orientação muda conforme o motivo (áudio, mídia, letra inexistente, falta a letra, não entendi), usa o primeiro nome do cliente e ajusta o plural quando há um único documento. Montar tudo em JavaScript deixa a redação legível e versionada aqui, em vez de espalhada em expressões dentro do nó do WhatsApp.

**Por que resposta não reconhecida recebe orientação (e não silêncio).** Na primeira versão, `invalido` caía no NoOp e o cliente ficava sem retorno após digitar algo errado. Agora `ambiguo`, `codigo_invalido` e `invalido` compartilham a saída `Orientacao`. O silêncio ficou apenas para `sem_pendentes`, evitando que o bot responda a mensagens comuns de quem não tem documento aguardando.

**Normalização do telefone.** Reaproveita exatamente a regra do fluxo LGPD (remove `@s.whatsapp.net`, tira o DDI 55, injeta o 9º dígito e formata `(DD)XXXXX-XXXX`) porque é assim que o número está gravado em `parceiros.telefone`.
