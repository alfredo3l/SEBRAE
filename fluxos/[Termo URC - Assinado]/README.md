# [Termo URC - Assinado]

- **ID:** `7ITLaIB5rSc7EoTd` · **Status:** ativo · **Nós:** 43 · **Criado:** 23/08/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-ASSINADOS`
- **Origem:** cópia de `[Termo LGPD - Assinado]` (`36Z66pbeI25m2MbJ`), reconstruída em 23/08/2026 para tratar o aceite/recusa de **qualquer termo**, com desambiguação por letra.

Recebe a resposta do cliente no WhatsApp, identifica **qual documento** está sendo respondido, gera o PDF assinado com as evidências e registra o aceite/recusa.

> **Ativo desde 23/08/2026**: os fluxos LGPD antigos foram **desativados** e a Evolution API
> (instância `SEBRAE`) foi reapontada para `/webhook/TERMOS-URC-ASSINADOS`.
> A cadeia de entrada é linear (`Webhook → insntancia → Busca Pendentes`) — ver nota sobre
> duplicação no fim deste documento.

## Como o cliente responde

Cada documento enviado recebe uma **letra** (A, B, C…) atribuída pela RPC `preparar_envio_documento`. A mensagem de envio instrui:

```
✅ *1A* - Aceito     ❌ *2A* - Não Aceito
```

O fluxo aceita variações: `1A`, `1 A`, `1-a`, `*1A*`, `A1`, `aceito B`, e ainda `1`/`2` sozinhos
**quando há um único documento pendente**. Com vários pendentes e resposta sem letra, responde
pedindo o código — nunca adivinha.

**Tom das mensagens**: institucional, sem emojis e sem saudação informal ("Prezado(a) [Nome],").
Toda a redação da orientação é montada no nó `Identifica Documento` (ver `Code/Identifica_Documento/`),
variando conforme o motivo: áudio, arquivo/mídia, letra inexistente, falta a letra ou resposta
não reconhecida.

**Situações tratadas** (testadas): texto em minúsculas, com espaços ou pontuação; áudio; imagem,
vídeo, figurinha e documento; legenda de imagem; emoji; teclado esbarrado; texto livre; resposta de
botão/lista; reação (ignorada); e mensagem enviada pelo próprio SEBRAE (`fromMe`, ignorada para não
processar as próprias mensagens).

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC-ASSINADOS)
  → insntancia (Set: instancia = "SEBRAE")
  → Busca Pendentes (Supabase: view vw_documentos_pendentes, telefone eq <normalizado do remoteJid>)
  → Identifica Documento (Code — ver Code/Identifica_Documento/)
  → Switch (acao)
      ├─ Aceito     → seta_Dados → Download logo → converte Base 64 → Saida_HTML
      │                → HTML → HTML_Base64 → Convert to File → HTTP Request (Gotenberg)
      │                ├→ Envio Documento Supabase (PUT no bucket TermosAceite)
      │                └→ Extract from File → Atualiza Banco de Dados (documentos: aceito)
      │                     → Enviar texto → Wait 1s → Enviar documento (PDF assinado)
      │                     → E LGPD? ─ true → Atualiza Parceiros LGPD → [ramo FOCO]
      │                                └ false → No Operation (demais termos não vão ao FOCO)
      ├─ Nao Aceito → Enviar texto1 → seta_Dados2 → Atualiza Banco de Dados1 (documentos: recusado)
      ├─ Orientacao → Enviar orientacao (ambíguo, letra inexistente ou texto não reconhecido:
      │                lista os documentos com suas letras e ensina o formato 1A/2A)
      └─ fallback   → No Operation (só quando não há documento aguardando resposta)
```

Ramo FOCO (todo aceite passa por aqui):

```
Enviar documento → Seta_Credenciais_FOCO → Obter_Token → seta_token
  → Upload Anexo FOCO         (POST /sobjects/ContentVersion — PDF em base64)
  → Busca ContentDocumentId   (GET  /query — Select ContentDocumentId from ContentVersion)
  → Vincula Anexo Interacao   (POST /sobjects/ContentDocumentLink — LinkedEntityId = Case, ou Account se não houver Case)
  → Marca FOCO Integrado      (Supabase: documentos.salvo_foco = true + content_document_id)
  → E LGPD? ─ true → Atualiza Parceiros LGPD → HTTP Request CPF → seta_Dados_Cliente
    │                → Atualiza Status Termo Aceite FOCO (Contact.TermoAceiteLGPD__c = "Sim") → Status_Code_Requicao
    └ false → No Operation (demais termos só sobem o anexo)
```

O upload segue a collection `docs/ACTO_Exemplo_UpAnexo.postman_collection.json`. Todos os quatro nós usam
`onError: continueRegularOutput` — falha no FOCO não impede o cliente de receber o documento nem o
registro do aceite; apenas `salvo_foco` permanece `false` (a coluna **FOCO** na lista mostra "—").

## O que grava

| Onde | Quando | Campos |
|---|---|---|
| `documentos` | aceite | `status='aceito'`, `data_aceite`, `arquivo_path`, `assinatura_digital` (hash), `resposta_texto`, `respondido_em`, `whatsapp_message_id` |
| `documentos` | recusa | `status='recusado'`, `data_recusa`, `resposta_texto`, `respondido_em`, `whatsapp_message_id` |
| `parceiros` | aceite **do LGPD apenas** | `termo_aceito=true`, `data_aceite` (a lista do sistema deriva o status do LGPD daqui) |
| Storage `TermosAceite` | aceite | `TermosAceite_<cpf>_<tipo>_<8 chars do id>.pdf` — **um arquivo por documento** (antes era só por CPF e um termo sobrescrevia o outro) |
| FOCO (anexo) | **todo aceite** | PDF assinado anexado à interação (`ContentVersion` + `ContentDocumentLink`); grava `documentos.salvo_foco = true` e `content_document_id` |
| FOCO (campo) | aceite **do LGPD apenas** | `Contact.TermoAceiteLGPD__c = "Sim"` |

## Diferenças em relação ao fluxo LGPD original

1. Identificação por documento (view + nó Code) no lugar do `Switch` que comparava só `"1"`/`"2"`.
2. **Removido o `If termo_aceito == true`**, que impedia qualquer aceite posterior de quem já tinha aceitado o LGPD.
3. Removidos os nós `Filtra Cadastro`, `If` e `Enviar texto2` (a view já traz os dados do cliente).
4. PDF com nome único por documento; `arquivo_path` gravado em `documentos`.
5. FOCO e `parceiros` só são tocados quando o documento é o Termo LGPD (nó `E LGPD?`).
6. Mensagens citam o nome do documento respondido.

## Credenciais referenciadas

Supabase "Acto", Evolution API (instância `SEBRAE`), Google Drive (logo). ⚠️ Débito herdado: o nó `Envio Documento Supabase` traz a **anon key do Supabase hardcoded** nos headers — migrar para credencial do n8n.

## Ativação (concluída em 23/08/2026)

1. `[Termo LGPD - Assinado]` (`36Z66pbeI25m2MbJ`) e `[Termo LGPD - Envio sem assinar]` (`pJecOOv0Sqxippeu`) foram **desativados** — os endereços antigos respondem 404.
2. A Evolution API (instância `SEBRAE`) foi reapontada para `https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-ASSINADOS`.

## Nome dos arquivos PDF (23/08/2026)

A limpeza antiga (`replace(/[^a-zA-Z0-9 ]/g, "")`) **apagava as letras acentuadas**, e o cliente
recebia "Parcelamento de Dbitos do MEI Termo de Cincia". A expressão correta translitera antes de
remover:

```js
nome.normalize("NFD").replace(/[̀-ͯ]/g,"")   // é → e, ç → c
    .replace(/[—–]/g,"-")                              // travessão vira hífen
    .replace(/[^a-zA-Z0-9 -]/g," ").replace(/\s+/g," ").trim()
```

Resultado: `Parcelamento de Debitos do MEI - Termo de Ciencia e Responsabilidade - Assinado.pdf`.
Usada no nome do PDF enviado, no `Gotenberg-Output-Filename` e no `PathOnClient` do FOCO. O **Title**
do anexo no FOCO **mantém os acentos** — é texto exibido, não nome de arquivo.

## Armadilha: filtro por telefone com parênteses (23/08/2026)

Na primeira versão, `Busca Pendentes` filtrava a view por `telefone eq (67)99245-1961` e
**retornava sempre vazio** — o fluxo concluía "sem pendentes" e ficava em silêncio
(execução 41009: resposta "Banana", telefone extraído corretamente, `quantidade_pendentes: 0`
mesmo havendo 3 documentos aguardando).

Causa: valores com **parênteses e hífen** não casam no filtro do nó Supabase/PostgREST.

Correção: a view expõe **`telefone_digitos`** (e `cpf_digitos`) — apenas números — e o nó filtra
por ela, com a expressão extraindo só dígitos do `remoteJid` (com o ajuste do 9º dígito).
Use sempre essas colunas ao filtrar por telefone/CPF em nós do n8n.

## Cuidado com duplicação de itens

A cadeia de entrada precisa ser **linear**: `Webhook → insntancia → Busca Pendentes`.
Na primeira versão, `Busca Pendentes` recebia duas conexões no mesmo input
(`Webhook → Busca Pendentes` **e** `Webhook → insntancia → Busca Pendentes`), o que no n8n
**multiplica os itens** e faria o fluxo responder duas vezes ao cliente — o mesmo defeito que
duplicava as mensagens no fluxo de envio (herdado da topologia do fluxo LGPD original).

## Guarda da integração no FOCO (23/08/2026)

Descoberta em teste com cliente cadastrado só no sistema (não existente no FOCO): a tela mostrava
**"FOCO Integrado ✓"** para um documento que **não foi anexado a lugar nenhum**.

O que acontecia (execução real 41027):

1. `Upload Anexo FOCO` criava o `ContentVersion` — **sucesso**;
2. `Vincula Anexo Interacao` recebia **400 `REQUIRED_FIELD_MISSING: [LinkedEntityId]`**, porque o
   cliente não tem Case nem Account no FOCO;
3. como todos os nós têm `onError: continueRegularOutput` (correto — falha no FOCO não pode
   impedir o aceite do cliente), o fluxo seguia e `Marca FOCO Integrado` gravava
   `salvo_foco = true` **sem olhar se o vínculo deu certo**.

O PDF ficava solto na biblioteca do usuário da integração: o único `ContentDocumentLink` era com
`005V200000JysXGIAZ` (prefixo `005` = **User**, `rpa@ms.sebrae.com.br`), que é o vínculo automático
criado pelo Salesforce para quem sobe o arquivo — não um vínculo com o cliente.

**Correção — dois nós IF na cadeia da integração:**

```
seta_token → [Tem vinculo FOCO?] ──não──→ E LGPD?          (não sobe nada, não marca)
                    │sim
                    ↓
       Upload Anexo FOCO → Busca ContentDocumentId → Vincula Anexo Interacao
                    ↓
            [Vinculou no FOCO?] ──não──→ E LGPD?           (não marca)
                    │sim
                    ↓
            Marca FOCO Integrado → E LGPD?
```

- **`Tem vinculo FOCO?`** — `{{ $('Identifica Documento').first().json.case_id_salesforce || ...id_salesforce || "" }}`
  não vazio. Sem Case e sem Account, nem faz o upload: evita acumular arquivos órfãos no FOCO.
- **`Vinculou no FOCO?`** — `{{ $json.success === true && !$json.error }}`, lendo a resposta do POST
  de `ContentDocumentLink`. Só aí `salvo_foco` vira `true`.

Assim a coluna FOCO da lista passa a significar o que promete: documento anexado ao atendimento.
