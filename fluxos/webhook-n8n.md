# Webhooks dos Termos URC (n8n)

| Etapa | Webhook | Fluxo |
|---|---|---|
| **Envio** do documento (sistema → cliente) | `POST /webhook/TERMOS-URC` | `[Termo URC - Envio sem assinar]` (`Hqfoa19HyX4QFOqW`) |
| **Resposta** do cliente (WhatsApp → sistema) | `POST /webhook/TERMOS-URC-ASSINADOS` | `[Termo URC - Assinado]` (`7ITLaIB5rSc7EoTd`) |
| **Verificação** do WhatsApp (sistema → Evolution, antes do envio) | `POST /webhook/TERMOS-URC-VERIFICA` | `[Termo URC - Verifica WhatsApp]` (`De7FxACcl71bzDom`) |

> Desde 23/08/2026 a Evolution API aponta para `/webhook/TERMOS-URC-ASSINADOS` e os dois
> fluxos LGPD antigos estão desativados (os endereços antigos respondem 404).

## 1. Envio

```
POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC
```

- **Fluxo**: `[Termo URC - Envio sem assinar]` (id `Hqfoa19HyX4QFOqW`, ativo).
- **Chamado por**: `confirmarEnvioEmLote()` → `enviarDocumentoWebhook()` em `js/documentos.js`.
- **Todos os termos** passam por aqui, inclusive o `termo-lgpd` (o webhook antigo `/fba3c3cd-...` não é mais chamado pelo front).
- Em sucesso: `documentos.status = 'enviado'` + `data_envio`; para o LGPD, também grava `parceiros.data_envio`.

## Payload enviado

Formato híbrido: os campos da **raiz** mantêm compatibilidade com o fluxo atual
(que lê `body.nome_razao_social`, `body.cpf`, `body.telefone`; o parceiro é localizado
no Supabase por `cliente.id` desde 16/09/2026 — antes era por telefone, e diferença de máscara
matava o envio em silêncio); os blocos aninhados trazem o resto para o fluxo usar
conforme for evoluindo.

```jsonc
{
  "nome_razao_social": "ALFREDO ANTONIO DE OLIVEIRA",
  "cpf": "009.852.911-09",
  "telefone": "(67)99245-1961",
  "email": "cliente@exemplo.com",

  "documento": {
    "id": "<uuid do registro em public.documentos>",
    "tipo": "formalizacao",              // slug do catálogo TERMOS_URC
    "nome": "Termo de Responsabilidade — Formalização",
    "codigo": "A",                       // letra da resposta (cliente manda 1A / 2A)
    "html": "<h3>TERMO ...</h3><p>...",  // termo já preenchido, pronto p/ PDF
    "campos": { "nome": "...", "cpf": "...", "observacoes": "...", "...": "..." }
  },

  "cliente": {
    "id": "<uuid em public.parceiros>",
    "nome_razao_social": "...",
    "cpf": "...",
    "cnpj": "...",
    "telefone": "...",
    "whatsapp": "556792451961",         // JID devolvido pela verificação (sem @s.whatsapp.net); null se não verificado
    "email": "...",
    "account_id": "001V2000014Ac3QIAS",   // Account no FOCO
    "contact_id": "003V200000y9CT5IAM"    // Contact no FOCO
  },

  "interacao": {
    "case_id": "500V200001IMvmbIAD",      // Id do Case no FOCO
    "case_number": "31344760"             // nº exibido como "Interação"
  },

  "consultor": "Administrador SEBRAE",
  "enviado_em": "2026-08-23T15:12:00.000Z",

  // Só quando o consultor envia vários termos no mesmo clique — ver abaixo
  "lote": {
    "total": 3,
    "indice": 1,
    "enviar_texto": true,
    "documentos": [
      { "tipo": "termo-lgpd", "nome": "Termo LGPD", "codigo": "A" },
      { "tipo": "parcelamento-mei", "nome": "Parcelamento de Débitos do MEI — Termo de Ciência e Responsabilidade", "codigo": "B" },
      { "tipo": "declaracao-responsabilidade", "nome": "Declaração de Responsabilidade", "codigo": "C" }
    ]
  }
}
```

## Envio em lote (mais de um documento)

Um clique com N documentos dispara **N chamadas** a este webhook — uma por documento, em
sequência. Cada execução gera e envia **um** PDF (a Evolution API manda um anexo por
mensagem). O que muda com o bloco `lote` é a **mensagem de texto**: em vez de N textos
quase iguais, o cliente recebe **um só**, listando todos os documentos e seus códigos.

| Campo | Significado |
|---|---|
| `total` | Quantos documentos este clique está enviando |
| `indice` | Posição deste documento no lote (1-based, para depuração) |
| `enviar_texto` | **Esta** chamada é a responsável pela mensagem de texto |
| `documentos[]` | O lote inteiro (`tipo`, `nome`, `codigo`), na ordem escolhida pelo consultor |

Regras:

- A lista completa vai em **todas** as N chamadas — se a primeira falhar, a seguinte monta
  a mesma mensagem.
- `enviar_texto` é `true` em **exatamente uma** chamada. O sistema só baixa essa flag
  quando o POST é aceito, então uma falha no primeiro documento passa a responsabilidade
  para o próximo.
- Para isso, o sistema reserva **todas** as letras (RPC `preparar_envio_documento`, serial)
  antes de disparar o primeiro POST.
- **Retrocompatível**: sem o bloco `lote`, ou com `total: 1`, o fluxo monta a mensagem
  individual de sempre.

### Verificação do WhatsApp (16/09/2026)

Antes de reservar as letras e disparar o envio, o sistema chama
`POST /webhook/TERMOS-URC-VERIFICA` com `{ "telefone": "..." }` e recebe
`{ ok, exists, jid, whatsapp, numero, motivo }` (detalhes em
[`[Termo URC - Verifica WhatsApp]/README.md`](<[Termo URC - Verifica WhatsApp]/README.md>)).

- `exists: false` → o botão Enviar fica **bloqueado** e nada é gravado (nem letra, nem status).
- `exists: true` → `whatsapp` vai no payload do envio em `cliente.whatsapp`; o fluxo usa esse
  valor como `remoteJid` (celular antigo registrado sem o 9 sai no formato certo).
- `exists: null` (verificação indisponível) → envio liberado com aviso; `cliente.whatsapp`
  vai `null` e o fluxo cai no `'55' + dígitos` de sempre.

O fluxo de envio também passou a gravar `documentos.status = enviado` **depois** do
`Enviar documento` (antes gravava antes do envio).

## Tipos de documento (`documento.tipo`)

`termo-lgpd`, `parcelamento-mei`, `parcelamento-pgfn`, `reenquadramento-mei`,
`formalizacao`, `alteracao`, `declaracao-responsabilidade`.

## 2. Resposta do cliente (aceite/recusa)

```
POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-ASSINADOS
```

Recebe o **evento da Evolution API** (não é o sistema que chama). O fluxo:

1. extrai do `data.key.remoteJid` a **chave** DDD + últimos 8 dígitos (`telefone_chave` da view — casa fixo, celular com 9 e celular registrado sem o 9; desde 16/09/2026);
2. busca os documentos aguardando resposta na view **`vw_documentos_pendentes`**;
3. interpreta a mensagem (`data.message.conversation`) no nó `Identifica Documento`.

**Como o cliente responde** — cada documento enviado tem uma **letra** (`documentos.codigo_resposta`,
atribuída pela RPC `preparar_envio_documento` e enviada em `documento.codigo`):

| Resposta | Efeito |
|---|---|
| `1A` / `1 A` / `A1` / `aceito A` | aceita o documento da letra A |
| `2A` / `2 A` / `A2` / `nao B` | recusa o documento da letra B |
| `1` ou `2` com **um único** pendente | resolve esse documento (compatível com o LGPD) |
| `1` ou `2` com **vários** pendentes | o bot responde listando os documentos e suas letras; nada é gravado |
| letra inexistente (`1Z`), formato errado (`3A`, `11B`) ou texto livre (`bom dia`, emoji) | o bot orienta com a lista e o formato correto; nada é gravado |

Variações de digitação absorvidas automaticamente: minúsculas (`1a`), espaços (`1 a`),
pontuação (`1-a`, `1.A`), asteriscos (`*1A*`) e ordem invertida (`a1`). Frases livres
("quero aceitar o termo") **não** são interpretadas — o cliente recebe a orientação —
porque deduzir intenção de texto livre poderia registrar um aceite indevido.

**Gravações**: `documentos` (`aceito`/`recusado` + datas + `arquivo_path` + `assinatura_digital` +
`resposta_texto` + `whatsapp_message_id`); `parceiros` e FOCO **apenas** quando o documento é o Termo LGPD.

## Próximos ajustes

1. Tirar a anon key e as credenciais do FOCO **hardcoded em nós** da instância, migrando para
   credenciais do n8n.
2. Remover a redundância do `data_envio`, gravado pelo fluxo **e** pelo sistema.

Concluídos: Evolution API reapontada e fluxos LGPD desativados (23/08/2026); upload do PDF
assinado no FOCO com `salvo_foco = true` (23/08/2026); telas passando a ler o LGPD do
registro em `documentos` em vez das flags de `parceiros` (09/09/2026).
