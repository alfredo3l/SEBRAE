# [Termo URC - Verifica WhatsApp]

- **ID:** `De7FxACcl71bzDom` · **Status:** ativo · **Nós:** 7 (+1 sticky) · **Criado:** 16/09/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-VERIFICA`
- **Origem:** criado em 16/09/2026 para a validação do número de WhatsApp antes do envio dos termos.

Responde ao sistema se um telefone **tem WhatsApp** e qual é o **JID real** que a Evolution API usa
para ele. Não envia nada ao cliente — é só consulta (`POST /chat/whatsappNumbers/{instância}`).

## Por que existe

O lote de 3 documentos para um cliente com telefone **fixo** (`6733895349`) revelou que o fluxo de
envio não sabia se o número tinha WhatsApp: a Evolution aceita a mensagem e devolve `status: PENDING`
mesmo para número inexistente, o fluxo termina com sucesso e o documento fica `enviado` sem o cliente
ter recebido nada. (Naquele caso específico, a consulta mostrou depois que o fixo **tem** WhatsApp
Business — mas o sistema não tinha como saber.)

Além disso, celulares antigos fora de SP/RJ/ES podem estar registrados no WhatsApp **sem o 9**
(`(67) 99245-1961` → JID `556792451961`). Montar o `remoteJid` como `'55' + dígitos` funciona porque a
Evolution resolve, mas o JID devolvido pela consulta é o formato canônico.

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC-VERIFICA, responde pelo nó "Responde")
  → instancia (Set: instancia = "SEBRAE")
  → Normaliza telefone (Code: dígitos → "55" + DDD + número; valido = true/false)
  → Telefone valido? (If)
       ├─ true  → Consulta Evolution (HTTP Request: POST /chat/whatsappNumbers/SEBRAE, credencial "Evolution API") ─┐
       └─ false ─────────────────────────────────────────────────────────────────────────────────────────────┤
                                                                                                             ↓
  → Monta resposta (Code: { ok, exists, jid, whatsapp, motivo })
  → Responde (Respond to Webhook: JSON)
```

## Contrato com o sistema

**Requisição:** `{ "telefone": "(67) 3389-5349" }` — qualquer formatação; só os dígitos são usados.

**Resposta (sempre HTTP 200):**

| Campo | Significado |
|---|---|
| `ok` | `false` quando a consulta à Evolution falhou (`exists` vem `null`) |
| `exists` | `true` tem WhatsApp · `false` não tem (ou telefone inválido) · `null` não foi possível verificar |
| `jid` | JID completo (`556733895349@s.whatsapp.net`) quando existe |
| `whatsapp` | JID sem o sufixo — é o que o fluxo de envio usa em `remoteJid` |
| `numero` | número normalizado enviado à Evolution |
| `motivo` | texto curto quando `exists` não é `true` |

Como o front usa (`js/documentos.js`, etapa "Enviar via WhatsApp"): badge **"Telefone com WhatsApp"**;
`exists: false` **bloqueia** o botão Enviar com aviso; `exists: null` libera com aviso amarelo; o
`whatsapp` vai no payload do envio como `cliente.whatsapp`.

## Credenciais referenciadas

Evolution API (`evolutionApi`, instância `SEBRAE`) via *predefined credential type* no HTTP Request —
a apikey não fica no fluxo. Servidor: `https://evo.alfredooliveira.com.br` (no `url` do nó).

## Verificação (16/09/2026)

Chamadas reais pelo webhook: `6733895349` → `exists: true` (fixo com WhatsApp Business);
`(67)99245-1961` → `exists: true`, JID `556792451961` (sem o 9); `6730000000` e `67900000000` →
`exists: false`; `123` → inválido, sem chamar a Evolution. Cabeçalhos CORS presentes
(`access-control-allow-origin` ecoando a origem) — o front chama direto do navegador.
