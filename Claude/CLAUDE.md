# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Práticas de trabalho (exigidas pelo desenvolvedor)

1. **Sempre conferir o próprio trabalho ao final de cada entrega**: reler os pontos alterados, rodar `node --check` nos JS tocados, testar as rotas/queries afetadas (página respondendo, query PostgREST válida, SQL aplicado conferido com SELECT) e caçar referências órfãs (grep por ids/funções renomeados). Reportar o resultado da conferência, não apenas "feito".
2. **Na dúvida, perguntar ao desenvolvedor antes de agir** — nunca implementar por suposição o que não estiver claro no pedido.

## Sobre o projeto

**SEBRAE - TERMOS URC** (originalmente "Aceite LGPD"): sistema de gestão de **termos e declarações URC** para clientes do SEBRAE/MS. Cadastro/consulta de clientes, geração e envio de documentos via WhatsApp (webhook n8n), integração com Salesforce/FOCO e gestão de usuários com perfis de acesso. Nasceu para um único termo (LGPD) e está sendo evoluído para **múltiplos termos por atendimento** (ver "Evolução Termos URC"). Idioma do código, comentários e UI: **português (pt-BR)**.

## Comandos

```bash
npm install          # dependências (dotenv, serve)
npm run dev          # servidor local em http://localhost:3000 (dev.js)
```

- `npm run dev` **exige** um `.env` com `SEBRAE_CLIENT_ID` e `SEBRAE_CLIENT_SECRET` (copie de `.env.example`); sem eles o servidor não sobe. `SEBRAE_API_BASE` é opcional (default: homologação `https://hlg-gateway.sebrae.com.br/foco-stg`).
- O front exige `js/supabase-config.js` (copie de `js/supabase-config.example.js`) — arquivo **gitignored**, nunca commitar.
- Não há build, bundler, testes automatizados nem linter. Deploy é estático na Vercel.

## Arquitetura

Aplicação **vanilla JS sem módulos**: os scripts são carregados via `<script>` nas páginas HTML e compartilham escopo global. Funções e variáveis definidas em um arquivo (ex.: `supabaseClient` de `supabase-config.js`, `_perfilAtual` de `auth.js`, helpers de `sebrae-api.js`) são usadas diretamente nos outros. Ao criar/renomear funções, verifique quem as chama em outros arquivos e a ordem dos `<script>` no HTML.

### Páginas e scripts

| Página | Scripts principais | Função |
|---|---|---|
| `index.html` | `app.js`, `documentos.js` (catálogo), `auth.js`, `sebrae-api.js`, `perfil.js` | **Tela 1**: lista de documentos por cliente, filtros (status, tipo de documento), cadastro, busca FOCO |
| `detalhe.html` | `app.js`, `auth.js`, `sebrae-api.js` | **Tela 2**: atendimento em andamento + seleção do termo a gerar; modais editar cliente / enviar termo / excluir / buscar |
| `documento.html` | `app.js`, `documentos.js`, `auth.js`, `sebrae-api.js` | **Telas 3 e 4**: formulário do termo + pré-visualização e etapa "Enviar via WhatsApp" |
| `acompanhamento.html` | `app.js`, `acompanhamento.js`, `auth.js`, `sebrae-api.js` | **Tela 6**: status dos documentos do atendimento, evidências (timeline) e recusas |
| `usuarios.html` | `usuarios.js`, `auth.js`, `perfil.js` | Gestão de usuários (somente admin) |
| `login.html` | `auth.js` | Login via Supabase Auth |

- `js/app.js` — maior arquivo; lista paginada/filtrada, detalhe, CRUD de clientes, modais, envio de termo (webhook n8n com URL hardcoded no front), busca FOCO. Funções compartilhadas com as outras páginas: `linhaLGPDDoParceiro`, `BADGES_STATUS_DOC`, `formatarDataHora`, `dispararEnvioTermoLGPD`.
- `js/documentos.js` — catálogo `TERMOS_URC` (campos + redação oficial por termo) e a lógica da página de documento; também é carregado no `index.html` só para popular o filtro de tipo.
- `js/acompanhamento.js` — cards, timeline de evidências e recusas da Tela 6.
- `js/auth.js` — sessão Supabase, carregamento do perfil (`perfis_usuarios`), controle de acesso por role, cache da navbar em `sessionStorage` (chaves `sbr_*`), RPC `registrar_ultimo_acesso` com throttle.
- `js/sebrae-api.js` — cliente do proxy Salesforce/FOCO (URLs relativas `/api/sebrae/...`, funcionam em local e Vercel).
- `js/usuarios.js` / `js/perfil.js` — admin de usuários e upload de foto (bucket `avatars`).

### Backend / proxy Salesforce (FOCO) — lógica duplicada

A mesma lógica de proxy (OAuth client_credentials com cache de token em memória, `GET /api/sebrae/query?q=<SOQL>`, `PATCH /api/sebrae/contact/:id` para atualizar **`Phone` e/ou `Email`**) existe em **dois lugares**:

1. `api/sebrae/query.js` e `api/sebrae/contact/[id].js` — Vercel Serverless Functions (produção).
2. `dev.js` — servidor local que serve estáticos + implementa as mesmas rotas inline.

**Qualquer mudança no comportamento da API deve ser replicada nos dois.** (`dev-TLS_GESTOR-M.js` + `proxy.js` são uma variante alternativa do servidor local.)

### Controle de acesso (roles)

Tabela `perfis_usuarios`, campo `role`: **admin** (tudo, inclui gestão de usuários), **operador** (CRUD de parceiros e envio de termo), **visualizador** (somente leitura — botões de ação ficam ocultos). Usuário inativo é deslogado ao acessar. O enforcement é no front-end + RLS/RPCs do Supabase.

### Supabase

- **Tabelas**:
  - `parceiros` — cadastro do cliente, **1 linha por CPF** (UNIQUE). Campos: `nome_razao_social`, `telefone`, **`email`**, `id_salesforce` (Account), `id_contato_salesforce` (Contact); flags/datas do LGPD legado (`termo_aceito`, `termo_aceito_foco`, `recusado`, `data_envio`, `data_aceite`, `data_recusa`).
  - `documentos` — **1 linha por documento/termo** (FK `parceiro_id`, sem UNIQUE por tipo): `tipo_documento` (slug), `nome_documento`, `status` (gerado/enviado/aceito/nao_aceito/recusado), `salvo_foco`, `arquivo_path`, `case_id_salesforce`/`case_number`, `content_document_id`, `consultor`, `dados_formulario` (jsonb), datas.
  - `perfis_usuarios` — usuários e roles.
- **RPCs**: `admin_criar_usuario`, `atualizar_foto_url`, `registrar_ultimo_acesso`.
- **Storage**: bucket `TermosAceite` (PDF `TermosAceite_<CPF_sem_pontuacao>.pdf`, aberto via signed URL) e `avatars` (`{userId}/avatar.{ext}`, URL pública).
- Migrações são arquivos `supabase_*.sql` na raiz, aplicados **manualmente** (ou via Management API — ver "Acesso a dados"): `supabase_add_recusado.sql`, `supabase_add_data_recusa.sql`, `supabase_rpc_registrar_ultimo_acesso.sql`, `supabase_create_documentos.sql`, `supabase_add_consultor_documentos.sql`, `supabase_add_email_parceiros.sql`.

### Fluxos de integração

- **Envio do termo**: front chama webhook n8n (WhatsApp) com `nome_razao_social`, `cpf`, `telefone`; em sucesso grava `data_envio` no Supabase. O aceite/recusa em si é registrado externamente (n8n) direto no banco.
- **Edição de contato (telefone/e-mail)**: atualiza no Supabase e sincroniza `Phone`/`Email` do Contact no Salesforce via `PATCH /api/sebrae/contact/:id`; se não houver `id_contato_salesforce`, tenta descobrir o Contact Id por AccountId ou CPF (SOQL). Disponível no modal "Editar Cliente" **e** no botão "Salvar contato do cliente" dentro do formulário de cada termo.
- **Busca FOCO**: SOQL sobre `Contact` (por `CPF__c`, `Phone/MobilePhone` LIKE ou `Name` LIKE); "Confirmar Cliente" insere o parceiro no Supabase se não existir.

## Deploy (Vercel)

Hosting estático da raiz (`vercel.json`: `outputDirectory: "."`, `cleanUrls: true` — links entre páginas não usam `.html`) + serverless functions em `api/`. Env vars `SEBRAE_*` configuradas no painel da Vercel.

## Fluxos n8n (`fluxos/`)

Espelho e controle dos fluxos n8n do projeto (instância `https://n8n.alfredooliveira.com.br`), na convenção do projeto `E:\Fluxos_N8N`. Regras essenciais (detalhes em `fluxos/README.md` e `fluxos/versionamento-artefatos.md`):

- **A fonte de verdade é a instância n8n**; o repo guarda espelho + histórico. `workflow.json` de cada fluxo é **gitignored** (pode conter segredos) — nunca commitar.
- Artefatos por nó (prompts/queries/código) versionados em `Prompts|Queries|Code/<Nó>/vNNN.*` + `CHANGELOG.md`; `vNNN` é **imutável**; editar o nó na instância e criar a versão local **no mesmo ato**.
- Trabalhar via MCP **`n8n-mcp`**: `get_node` antes de configurar nó; editar com `n8n_update_partial_workflow`; `n8n_validate_workflow` antes de ativar + `n8n_get_workflow` depois para conferir `connections`.
- ⚠️ O Grep tool (ripgrep) respeita `.gitignore` e **não enxerga os `workflow.json`** — para varrê-los use PowerShell `Select-String`.
- Antes de qualquer commit envolvendo `fluxos/`: varredura de segredos (`eyJ`, `sk-`, `client_secret`) nos arquivos versionáveis + `git check-ignore -q` nos `workflow.json`.

Fluxos espelhados: `[Termo LGPD - Envio sem assinar]` (`pJecOOv0Sqxippeu` — webhook `/webhook/fba3c3cd-...` chamado pelo front; gera PDF via Gotenberg, grava `data_envio` e envia via Evolution API) e `[Termo LGPD - Assinado]` (`36Z66pbeI25m2MbJ` — processa resposta "1/2" no WhatsApp, grava PDF no bucket `TermosAceite`, atualiza `parceiros` e sincroniza o FOCO). Débitos conhecidos: o fluxo de envio grava `data_envio` **e** o front grava de novo (redundância); credenciais do FOCO e anon key do Supabase estão **hardcoded em nós** na instância (redigidas nos exports locais) — migrar para credenciais do n8n.

## Controle de versões do desenvolvedor

A pasta `controle-versoes/` (gitignored, local) contém `HISTORICO.md` com a numeração sequencial de todos os commits (Nº → hash → mensagem → status de push). **Após cada commit e push, adicione uma nova linha à tabela** e atualize o marcador "Próximo número". Quando o usuário pedir para "voltar para a versão #N", use o hash correspondente da tabela.

## Skills do projeto (`Claude/skills/`)

Skills criadas para este projeto ficam em `Claude/skills/<nome>/SKILL.md` (pasta-fonte). Para serem invocáveis (`/nome`), cada skill precisa também de uma cópia em `.claude/skills/<nome>/` na raiz — ao criar ou editar uma skill, mantenha as duas em sincronia.

## Evolução Termos URC (em andamento)

Evolução do Aceite LGPD para enviar/coletar aceite de **múltiplos termos URC** por atendimento (protótipo navegável em `docs/poc-termos-urc.html` — 7 telas, requisitos RF01–RF20: seleção de documento, preenchimento pelo consultor, envio WhatsApp, aceite individual, evidências, upload automático no FOCO).

**Fase 1 implementada (22/08/2026):**
- **Rebranding**: header/navbar de todas as páginas (e `<title>`s) agora exibem **TERMOS URC** (antes "Aceite LGPD"). Única exceção: `docs/poc-termos-urc.html` (protótipo de referência, intocado).
- `detalhe.html` virou a tela "Selecionar Documento" (Tela 2 da POC): card "Atendimento em andamento" (Interação nº = `CaseNumber` do último `Case` do cliente no FOCO; Consultor = usuário logado) + grade de 8 cards de termos (`abrirDocumento(tipo)` em `js/app.js`). Botões/modais antigos (editar, enviar termo, excluir, busca) mantidos.
- Nova página **`documento.html?id=<parceiro>&tipo=<slug>`** (Tela 3 da POC: formulário + pré-visualização com a redação oficial dos modelos de `docs/`), lógica em **`js/documentos.js`** (catálogo `TERMOS_URC` com campos e templates por slug: `termo-lgpd`, `parcelamento-mei`, `parcelamento-pgfn`, `reenquadramento-mei`, `formalizacao`, `alteracao`, `declaracao-responsabilidade`).
- **Trechos de qualificação são condicionais (23/08/2026)**: helpers `temValor()` e `trechoSe()` em `js/documentos.js` — **CNPJ, e-mail, telefone e RG** só aparecem no documento quando informados; sem eles a frase se reajusta ("Eu, FULANO, portador do CPF X, declaro…"), sem lacunas em branco. Caso especial na Formalização: sem RG vira "portador do CPF n.º X" (não pode sobrar o "e"). O bloco "Processo/Interação nº" some quando o FOCO não devolve o Case, restando só a data. **Os campos do corpo mantêm a lacuna** (valor do parcelamento, local, linhas de débitos, anos da DASN) — são cláusulas do documento oficial, preenchíveis à mão.
- **Formulários completos conforme a POC**: todos os termos editáveis têm a base comum (`camposBaseTermo()`: Nome, CPF, CNPJ, Telefone, E-mail, Account ID, Nº interação, Data) + campos específicos oficiais + Observações complementares; Formalização tem "Objeto da formalização".
- **CNPJ vem do FOCO (23/08/2026)**: o campo é **`Account.CNPJ__c`** — vive na **conta**, não no contato (o `Contact` não tem campo de CNPJ). `buscarContatoFocoPorCPF` traz `Account.Name, Account.CNPJ__c` pelo relacionamento; o formulário preenche o CNPJ automaticamente e **mantém o campo editável** (como telefone, e-mail e RG). Formato no FOCO já vem com máscara (`00.514.820/0011-73`). Muitos clientes PF não têm CNPJ preenchido — nesse caso o campo fica vazio e o trecho some do documento (ver regra dos trechos condicionais).
- **Etapa "Enviar via WhatsApp" (Tela 4 da POC)** dentro de `documento.html`: "Gerar e prosseguir" (todos os termos) → validações automáticas (badges reais: CPF/FOCO/nome/telefone/e-mail/documento gerado) + card verde de confirmação com dados do cliente + Cancelar/Enviar. **Enviar**: `termo-lgpd` dispara o webhook n8n real (`dispararEnvioTermoLGPD()` em `js/app.js`); demais termos mostram aviso "próxima fase" (não existe fluxo n8n para eles ainda).
- Novas consultas FOCO em `js/sebrae-api.js`: `buscarContatoFocoPorCPF` (Contact) e `buscarUltimaInteracaoFoco` (Case) — documentadas em `docs/integracao-foco/README.md`. Interação/atendimento no FOCO = objeto **`Case`** (`CaseNumber`).
- CSS dos Termos URC no fim de `css/style.css` (`.documentos-grid`, `.doc-card`, `.doc-form-grid`, `.doc-preview`, `.envio-card` etc.).

**Fase 2 implementada (23/08/2026):**
- **Tabela `public.documentos`** criada (`supabase_create_documentos.sql`, aplicada via Management API): 1 linha por documento/termo, FK `parceiro_id` → `parceiros.id` (que segue 1-por-CPF, UNIQUE preservado — fluxos n8n intactos). Campos: `tipo_documento` (slug), `nome_documento`, `status` (gerado/enviado/aceito/nao_aceito/recusado), `salvo_foco`, `arquivo_path`, `case_id_salesforce`/`case_number`, `content_document_id`, `dados_formulario` (jsonb), datas. RLS espelha `parceiros`. **Backfill**: 50 registros LGPD criados a partir das flags dos parceiros com histórico.
- **Lista de Clientes = Tela 1 da POC**: colunas CPF · Nome · Telefone · Account ID · **Documento** · **Status** (+PDF) · Data Envio · Data Aceite · **FOCO** · Ações (saíram Data Recusa/Alteração). Filtro "Telefone" substituído por **"Tipo de Documento"** (`#filtro-tipo`, populado do catálogo `TERMOS_URC` — `js/documentos.js` agora também é carregado no `index.html`); status ganhou `enviado`/`gerado`. Filtragem 100% client-side (`filtrarParceiros()` reescrita; corrigidos: filtro "Com Telefone" morto e pesquisa que filtrava `p.id` em vez de `id_salesforce`).
- **Achatamento** em `js/app.js`: `carregarParceiros()` usa `select('*, documentos(*)')`; `montarLinhasDocumentos()` gera 1 linha LGPD por parceiro (status **derivado das flags de `parceiros`** — fonte viva enquanto o n8n gravar lá) + 1 linha por registro de `documentos` com tipo ≠ termo-lgpd. `criarLinhaParceiro` → `criarLinhaDocumento`; badges: Gerado=`badge-pendente`, Enviado=`badge-assinado`, FOCO=`.badge-foco` (classe nova no CSS, saiu o inline).
- **Gravação em `documentos`**: "Gerar e prosseguir" (`js/documentos.js`) insere/atualiza registro com status `gerado` + `dados_formulario` + Case; envio LGPD bem-sucedido atualiza para `enviado`. **Débito**: aceite/recusa do LGPD ainda chega só em `parceiros` (n8n atualiza por CPF) — quando os fluxos forem migrados, `documentos` vira fonte única.

**Fase 3 implementada (23/08/2026) — Acompanhamento do Atendimento (Tela 6 da POC):**
- Nova página **`acompanhamento.html?id=<parceiro>`** + **`js/acompanhamento.js`**: cabeçalho do cliente (CPF • Interação FOCO • telefone) com botão verde "Enviar novo documento" → `detalhe` (seleção); grade de cards dos documentos do atendimento (`.st-card`, cor por status, linhas Enviado/Aceito/FOCO — "Integrado ✓"/"aguardando aceite"); **timeline de evidências clicável por card** (eventos: documento gerado c/ consultor, enviado via WhatsApp, aceito/recusado, integração no FOCO — "Visualizado pelo cliente" omitido por não haver rastreamento; **"Armazenado no repositório" foi removido em 23/08/2026**: detalhe de infraestrutura do desenvolvedor, sem valor para o consultor, que se interessa pela integração no FOCO); card "Tratamento de recusa" (lista recusas ou aviso verde de nenhuma).
- **Navegação da lista mudou**: linha e olho da Tela 1 agora abrem `acompanhamento` (antes `detalhe`); a seleção de documento é acessada pelo botão "Enviar novo documento" do acompanhamento.
- Coluna **`consultor`** adicionada em `documentos` (`supabase_add_consultor_documentos.sql`, aplicada) e gravada em `registrarDocumentoGerado()` (nome do usuário logado).
- Reuso de `app.js`: `linhaLGPDDoParceiro`, `BADGES_STATUS_DOC`, `formatarDataHora`; CSS da Tela 6 no fim de `style.css` (`.status-grid`, `.st-card*`, `.timeline`, `.badge-pdf`, `.acomp-*`).

**Retomada de documento gerado (23/08/2026):** cards do Acompanhamento com status **Gerado** têm botão "Enviar" (e **Enviado** → "Reenviar"; LGPD não enviado → "Enviar") que abre `documento?id=<parceiro>&tipo=<slug>&doc=<id do registro>`. Na inicialização, `carregarDocumentoExistente()` busca o registro por `?doc=` **ou** o rascunho `gerado` mais recente do par (parceiro, tipo) — isso **evita criar registros duplicados** quando o consultor reabre o termo pelo Detalhe — e `aplicarDadosNoFormulario()` restaura `dados_formulario`; a interação salva prevalece sobre a busca do FOCO. Registros `enviado`/`aceito` só são reaproveitados com `?doc=` explícito.

**E-mail do cliente editável (23/08/2026):** nova coluna **`email` em `parceiros`** (`supabase_add_email_parceiros.sql`, aplicada). O **proxy do FOCO agora aceita `Phone` e/ou `Email`** no `PATCH /api/sebrae/contact/:id` — alterado **nos dois lugares** (`api/sebrae/contact/[id].js` e `dev.js`); cliente: `atualizarContatoSebrae(contactId, {Phone, Email})` em `js/sebrae-api.js` (`atualizarTelefoneContactSebrae` virou atalho). Modal "Editar Cliente" ganhou campo E-mail (salva no Supabase + sincroniza no FOCO). Formulário de cada termo tem botão **"Salvar contato do cliente"** (`salvarContatoDoFormulario()`), que grava telefone/e-mail digitados no cadastro e sincroniza no FOCO sem sair da tela. Precedência do e-mail nos formulários: `parceiros.email` → `Contact.Email` (FOCO).

**Performance de navegação (23/08/2026):** três otimizações no carregamento das telas (medições locais: query Supabase ~250–350 ms, cada consulta FOCO ~100–190 ms):
1. **Auth deixou de bloquear os dados** — no `DOMContentLoaded` de `js/app.js`, `verificarAutenticacao()` e o carregamento (`carregarParceiros`/`carregarDetalhe`) correm em paralelo (a sessão já está no storage do supabase-js). Depois do auth, `aplicarPermissoesDetalhe()`/`preencherConsultorDetalhe()` são reaplicados.
2. **Consultas FOCO em paralelo** — `carregarDadosFocoDetalhe()` dispara Contact e Case com `Promise.all` (o Case resolve por CPF via subquery quando não há ContactId).
3. **Cache stale-while-revalidate em `sessionStorage`** (TTL 5 min): helpers `cacheNavGet/cacheNavSet/invalidarCacheParceiro` em `app.js`; `sbr_parceiro_<id>` (dados do cliente) e `sbr_foco_<cpf>` (Contact + interação). O detalhe pinta na hora com `pintarDetalheParceiro()` e revalida no banco; `documento.html` usa o mesmo cache. Invalidação após editar cliente, salvar contato pelo formulário e excluir.

**Envio unificado dos termos (23/08/2026):** o botão "Enviar" da tela de documento agora dispara **todos** os termos (inclusive o LGPD) no webhook único **`POST /webhook/TERMOS-URC`** (fluxo `[Termo URC - Envio sem assinar]`, id `Hqfoa19HyX4QFOqW`) — o webhook antigo `/fba3c3cd-...` não é mais chamado pelo front. Payload **híbrido** documentado em `fluxos/webhook-n8n.md`: campos planos na raiz (`nome_razao_social`, `cpf`, `telefone`, `email`) para compatibilidade com o fluxo atual + blocos `documento` (id, tipo, nome, **html renderizado do termo**, campos), `cliente`, `interacao` e `consultor`. Em sucesso: `documentos` vira `enviado` com `data_envio` e, no caso do LGPD, `registrarEnvioLGPDNoParceiro()` também carimba `parceiros.data_envio` (a lista deriva o status do LGPD de lá). Removidos do detalhe: botão "Enviar Termo", modal de envio e funções `enviarTermo`/`confirmarEnvioTermo`/`fecharModalEnviarTermo` (o envio agora é só pela tela do documento); botão "Editar" renomeado para "Editar Cliente".

**Fluxo n8n adaptado para múltiplos termos (23/08/2026):** `[Termo URC - Envio sem assinar]` (`Hqfoa19HyX4QFOqW`) deixou de ser cópia do LGPD e ficou **dinâmico por documento** — espelhado em `fluxos/[Termo URC - Envio sem assinar]/`:
- `seta_Dados` agora lê `documento.tipo|nome|id|html` do payload (fallback = LGPD) e usa `$('Webhook')` em vez de `$json` (o nó recebe duas entradas).
- `Saida_HTML` **v002** (`Code/Saida_HTML/v002.js` + CHANGELOG): usa o HTML do termo como corpo do PDF, título = nome do documento, remove o `<h3>` duplicado do fragmento, injeta CSS das classes dos termos e inclui o nome do documento no hash SHA-256; sem HTML recebido, mantém o corpo do LGPD.
- Nome do PDF (Gotenberg e Evolution) e mensagem do WhatsApp passaram a citar o documento; `Atualiza Banco de Dados` agora grava em **`documentos`** (`status = enviado`, `data_envio`) filtrando por `documento.id`, com `onError: continueRegularOutput`.
- ⚠️ **Armadilhas encontradas**: (1) o `n8n_update_partial_workflow` falha nesta instância com `settings must NOT have additional properties` — o workflow tem `availableInMCP`/`timeSavedMode`/`binaryMode`; a saída é o `PUT /api/v1/workflows/:id` enviando `settings` só com `executionOrder`/`callerPolicy`/`errorWorkflow` (o n8n repõe o resto), sempre conferindo antes que `versionId == activeVersionId`. (2) `n8n_validate_workflow` acusa erro no nó `HTML` (`{{ }}` sem `=`) — **falso positivo**: é template do node HTML, herdado do fluxo LGPD em produção. (3) No PowerShell, `Get-Item` com colchetes no caminho (`[Termo URC...]`) não acha o arquivo — usar `-LiteralPath`.
- **Aceite ainda não tratado por documento**: `[Termo LGPD - Assinado]` só conhece o LGPD (grava em `parceiros`) — próxima etapa.

**Aceite/recusa por documento (23/08/2026):** cliente pode ter vários termos aguardando resposta, então cada documento enviado recebe uma **letra** e o cliente responde **`1A`** (aceito) / **`2A`** (não aceito).
- **Banco** (`supabase_aceite_documentos.sql`, aplicada): colunas `codigo_resposta`, `html_documento`, `resposta_texto`, `respondido_em`, `whatsapp_message_id`, `assinatura_digital` em `documentos`; índice único parcial `(parceiro_id, codigo_resposta) where status='enviado'`; **RPC `preparar_envio_documento(uuid)`** (atribui a primeira letra livre + marca enviado, com guarda que recusa documento já respondido); **view `vw_documentos_pendentes`** (join com `parceiros`, usada pelo n8n para achar os pendentes por telefone).
- **Front**: `registrarDocumentoGerado()` grava `html_documento`; `confirmarEnvioDocumento()` chama a RPC, recebe a letra, manda em `documento.codigo` e mostra ao consultor qual resposta o cliente deve dar; card do acompanhamento exibe a letra (`.badge-codigo`).
- **Fluxo de envio**: `seta_Dados.CodigoResposta` + mensagem instruindo `1A`/`2A`.
- **Fluxo de aceite** (`[Termo URC - Assinado]`, `7ITLaIB5rSc7EoTd`, espelhado em `fluxos/`): `Busca Pendentes` (view) → **`Identifica Documento`** (Code v001 — aceita `1A`/`A1`/`aceito B`/`1`/`2`; sem letra e vários pendentes → `ambiguo`, o bot lista os documentos e **nada é gravado**) → Switch (Aceito/Nao Aceito/Ambiguo/fallback). Aceite gera PDF com bloco de evidências (`Saida_HTML` v002), salva em `TermosAceite_<cpf>_<tipo>_<8 do id>.pdf` e grava `documentos`; `parceiros`+FOCO só quando `E LGPD?`. Removidos `Filtra Cadastro`, `If termo_aceito` (bloqueava o 2º aceite) e `Enviar texto2`.
- **Ativado em 23/08/2026**: os dois fluxos LGPD antigos foram **desativados** (endereços antigos respondem 404) e a Evolution API foi reapontada para `/webhook/TERMOS-URC-ASSINADOS`.
- **Robustez das respostas (v003 do `Identifica Documento`)**: ignora mensagens do próprio bot (`fromMe`) e reações; trata **áudio, imagem, figurinha, emoji, teclado esbarrado e texto aleatório** devolvendo orientação contextual (mensagem montada no próprio Code, variando por motivo); lê legenda de imagem e resposta de botão/lista. Silêncio só para `fromMe`, reação e cliente sem documento pendente.
- **Tom das mensagens (decisão do desenvolvedor)**: profissional e fluido, à altura do SEBRAE. Saudação **"Olá, [Nome]!"** (exclamação no fim, definida em 23/08/2026) — nunca "Prezado(a)" (expõe incerteza de gênero) nem "Oi"/"Prontinho"; frases impessoais na voz da instituição ("Recebemos sua mensagem de áudio…"); **emojis apenas funcionais** (📄 documento, ✅ aceite, ❌ recusa, ⚠️ atenção), nunca emocionais (😅🤔🙏). Vale para os dois fluxos.
- **Assinatura digital (SHA-256)**: calculada no nó `Saida_HTML` sobre `id do documento | nome | CPF | nome do documento | data-hora do aceite`. Como o **id do documento** entra no cálculo, a assinatura é **única por termo aceito** — dois termos do mesmo cliente, ainda que aceitos no mesmo segundo, geram hashes diferentes. É determinística (o mesmo documento sempre gera o mesmo hash, o que permite conferir a integridade) e sensível a qualquer alteração, inclusive 1 segundo na data. Conferido em 23/08/2026: 3 aceites em `documentos` = 3 assinaturas distintas.
- ⚠️ **Armadilha de escape (PowerShell → n8n)**: montar expressões n8n via PowerShell gerou dois bugs — `{{ d1.acao }}` (o `$ID` colidiu com o parâmetro `$id` do scriptblock, pois PowerShell **não diferencia maiúsculas**) e `replace(/\D/g,''')` (aspas simples a mais). **Sempre reler as expressões gravadas** com um GET depois do PUT; usar aspas duplas dentro do JS evita o segundo caso.
- ⚠️ **Nome de arquivo com acento**: `replace(/[^a-zA-Z0-9 ]/g,"")` **apaga** letras acentuadas ("Débitos" → "Dbitos"). Nos dois fluxos o nome do PDF passa por `normalize("NFD")` + remoção de diacríticos + travessão→hífen antes de filtrar, resultando em "Parcelamento de Debitos do MEI - Termo de Ciencia". Vale para o PDF enviado, o `Gotenberg-Output-Filename` e o `PathOnClient` do FOCO; o **Title** do anexo no FOCO mantém acentos.
- ⚠️ **Armadilha do filtro (custou silêncio no aceite)**: o nó Supabase/PostgREST **não casa valores com parênteses/hífen** — filtrar `telefone eq (67)99245-1961` retorna vazio. Por isso a view expõe **`telefone_digitos`** e **`cpf_digitos`** (só números) e o fluxo filtra por elas. Ao consultar por telefone/CPF em qualquer nó, use as colunas de dígitos.
- ⚠️ **Armadilha do n8n (custou mensagens duplicadas)**: um nó que recebe **duas conexões no mesmo input** multiplica os itens e duplica todo o caminho a jusante. Era o caso de `Webhook → [instancia, seta_Dados]` + `instancia → seta_Dados` (topologia herdada do fluxo LGPD original): `seta_Dados` saía com 2 itens e o cliente recebia **duas mensagens e dois PDFs** por clique. Corrigido nos dois fluxos com cadeia linear `Webhook → instancia → …`. Ao editar fluxos, conferir se nenhum nó recebe mais de uma conexão no mesmo input.

**Upload do documento assinado no FOCO (23/08/2026):** implementado no fluxo `[Termo URC - Assinado]`, seguindo `docs/ACTO_Exemplo_UpAnexo.postman_collection.json`. Após o envio do PDF ao cliente: `Upload Anexo FOCO` (POST `/sobjects/ContentVersion` com o PDF em base64 e `ContentLocation: "S"`) → `Busca ContentDocumentId` (query em `ContentVersion`) → `Vincula Anexo Interacao` (POST `/sobjects/ContentDocumentLink`, `LinkedEntityId` = Case da interação, com fallback para o Account) → `Marca FOCO Integrado` (grava `documentos.salvo_foco = true` + `content_document_id`, o que acende a coluna **FOCO** na lista). Roda para **todos** os termos; o `Contact.TermoAceiteLGPD__c` continua exclusivo do LGPD. Todos os nós com `onError: continueRegularOutput` — falha no FOCO não impede o aceite. **Validado em produção em 23/08/2026 pela execução real 41019** (aceite "1b" do Parcelamento MEI): `ContentVersion 068bL00000W7wkpQAB` → `ContentDocumentId 069bL00000W2MZvQAN` → link `06AbL00000YqdXzUAJ` → `salvo_foco = true`; PDF de 147 KB confirmado anexado ao Case 31344760.

**"Integrado no FOCO" agora só aparece quando é verdade (23/08/2026):** teste com cliente cadastrado apenas no sistema (sem Contato/Conta/Case no FOCO) revelou **falso positivo**: a tela mostrava "FOCO Integrado ✓" e a evidência "Documento anexado à interação do cliente" para um documento que não foi anexado a nada. Na execução 41027 o `Upload Anexo FOCO` teve sucesso, mas `Vincula Anexo Interacao` recebeu **400 `REQUIRED_FIELD_MISSING: [LinkedEntityId]`** (sem Case e sem Account, não há a quem vincular) e, por causa do `onError: continueRegularOutput` de todos os nós, `Marca FOCO Integrado` gravava `salvo_foco = true` assim mesmo. O PDF ficava **solto** na biblioteca do usuário da integração — o único `ContentDocumentLink` era com `005V200000JysXGIAZ` (prefixo `005` = **User**, `rpa@ms.sebrae.com.br`), vínculo automático de quem sobe o arquivo. Correção no fluxo (dois nós IF, já publicados): **`Tem vinculo FOCO?`** antes do upload (`case_id_salesforce || id_salesforce` não vazio — sem isso nem sobe o arquivo, evitando órfãos no FOCO) e **`Vinculou no FOCO?`** depois do vínculo (`$json.success === true && !$json.error`) — só então marca. Resíduo do teste removido: `ContentDocument 069bL00000W2TUvQAN` apagado (HTTP 204, confirmado com 0 registros) e `salvo_foco`/`content_document_id` zerados no registro. ⚠️ **Lição geral**: `onError: continueRegularOutput` mantém o fluxo vivo, mas **exige checar o resultado antes de registrar sucesso** — vale para qualquer gravação que dependa de uma chamada externa. Obs.: os `salvo_foco = true` do backfill LGPD (sem `content_document_id`) são legítimos — ali a coluna significa `TermoAceiteLGPD__c` no Contato, não anexo.

**Filtro de status da lista (23/08/2026):** opções reduzidas a **Gerado / Enviado / Aceito / Recusado**, na ordem do ciclo. O status derivado `nao_aceito` (cliente sem documento enviado) passou a ser exibido como **"Pendente"** (badge cinza), eliminando a duplicidade que existia entre "Não Aceito" e "Recusado".

**Atualização das telas em tempo real (23/08/2026):** o aceite/recusa e a integração no FOCO são gravados pelo n8n, então a tela ficava desatualizada até um F5. Agora a **lista de clientes** e o **acompanhamento** escutam o Supabase Realtime.
- **Banco** (`supabase_realtime_documentos.sql`, aplicada): `documentos` e `parceiros` adicionadas à publicação `supabase_realtime` + `replica identity full`.
- **Front** (`js/app.js`): `ligarAtualizacaoAoVivo(nomeCanal, recarregar)` (assina as duas tabelas, `event: '*'`), `agendarAtualizacao()` (agrupa eventos em rajada com 400 ms de espera — o aceite grava nas duas tabelas quase junto) e `atualizarAoVoltarParaAba()` (revalida no `visibilitychange`, rede de segurança se o websocket cair em segundo plano). A lista recarrega por `recarregarListaAoVivo()`, que **preserva filtros e página** — para isso `filtrarParceiros()` foi dividida em `aplicarFiltrosParceiros()` (só recalcula) + reset/render. O acompanhamento usa `recarregarAcompanhamentoAoVivo()`, que **mantém o card selecionado** (chave `id` do documento, ou o tipo no LGPD derivado).
- ⚠️ **Armadilha (custou eventos silenciosamente perdidos)**: `supabaseClient.realtime.setAuth(token)` é **assíncrono** no supabase-js v2 recente. Se o canal assina antes do token da sessão chegar ao websocket, o servidor descarta os eventos por RLS (as policies de SELECT exigem `authenticated`) e **o canal ainda reporta `SUBSCRIBED`** — falha muda. Por isso `ligarAtualizacaoAoVivo` é `async`: faz `getSession()` → `await setAuth(access_token)` → só então `subscribe()`, e reaplica o token em `TOKEN_REFRESHED`.
- **Verificado em 23/08/2026** com um usuário autenticado real (criado e removido no teste): canal `SUBSCRIBED`, `UPDATE` em `documentos` recebido em ~1,4 s e em `parceiros` em ~1,1 s. Sem o `await` no `setAuth`, o mesmo teste recebia **zero** eventos — a prova da armadilha acima.

**Botão "Início" em todas as telas (23/08/2026):** o botão azul com ícone de casa (`.btn-inicio`, `href="/"`) que existia só na Lista de Clientes foi levado a **todas** as telas. Onde já havia um botão com o mesmo destino ele foi **substituído** (Detalhe: "Voltar"; Acompanhamento: "Lista de Clientes"; Usuários: "Voltar" — que ainda apontava para `index`), evitando dois botões idênticos; em `documento.html` o "Trocar documento" (cinza, `.btn-voltar`, destino diferente) foi mantido e o "Início" entrou ao lado. `login.html` ficou de fora (não tem navegação). `.btn-voltar` segue no CSS por causa do "Trocar documento".

**Cadastro temporário de cliente (23/08/2026):** botão verde **"Novo Cliente"** na Lista de Clientes (ao lado de "Buscar Cliente"), que reaproveita o modal `#modal-cadastro` — até então **órfão**, sem botão que o abrisse. Ganhou o campo **E-mail** (gravado em `parceiros.email`) e um **aviso no rodapé do formulário** (`.aviso-cadastro-teste`): o cadastro é provisório, **só para os testes**, e o cadastramento oficial é **exclusivamente pela plataforma FOCO** — clientes criados aqui não vão para o FOCO. Visível só para admin/operador (`aplicarPermissoesLista()` + `aplicarPermissoesDetalheComCache()`). ⚠️ **Remover esta funcionalidade ao fim dos testes**: botão `.btn-novo-cliente` no `index.html`, o aviso e o modal.

**Editar Cliente no Acompanhamento (23/08/2026):** o modal de edição foi replicado em `acompanhamento.html` com os **mesmos ids** do detalhe, reaproveitando `abrirModalEdicao()`/`salvarEdicao()` de `app.js` — para isso `acompanhamento.js` passou a preencher a global **`parceiroAtual`** e `salvarEdicao()` agora decide o que recarregar (detalhe → `carregarDetalhe()`; acompanhamento → `recarregarAcompanhamentoAoVivo()` + `pintarCabecalhoAcompanhamento()`, função extraída para repintar nome/CPF/telefone). O botão **Excluir** ficou de fora do modal do acompanhamento (a exclusão continua só no detalhe, onde existe o `#modal-excluir`).

**Mensagens de atualização de contato dizem o que aconteceu (23/08/2026):** o modal dizia apenas "Parceiro atualizado com sucesso!", sem informar se o FOCO foi atualizado. Agora `salvarEdicao()` (e o botão "Salvar contato do cliente" de `documentos.js`, alinhado à mesma redação) distingue três desfechos: **"Cliente atualizado no cadastro e no FOCO."**; *"…no cadastro. **Atenção:** não foi possível atualizar no FOCO (motivo)."*; *"…no cadastro. **Atenção:** este cliente não foi localizado no FOCO, então os dados não foram atualizados lá."* — esta última é a que aparece nos clientes criados pelo cadastro de testes. **Verificado em 23/08/2026** executando a própria `salvarEdicao()` com dublês em 5 cenários (detalhe / acompanhamento / sem Contact Id / FOCO fora do ar / cliente inexistente no FOCO) + `PATCH /api/sebrae/contact/:id` real devolvendo HTTP 204: o modal grava no cadastro **e** sincroniza `Phone`/`Email` no FOCO nas duas telas. Nome e CPF seguem somente leitura (não são sincronizados).

**Badge "PDF final" removido dos cards (23/08/2026):** parecia um botão para abrir o documento, mas não era clicável — confundia o consultor. Saiu o `<span class="badge-pdf">` de `renderCardsAcompanhamento()` e a classe `.badge-pdf` do CSS (sem outros usos). O PDF continua acessível pelo botão de arquivo na coluna Status da lista, onde o clique realmente abre o documento.

**Nenhum termo pré-atribuído ao cliente (23/08/2026):** a lista criava **sempre** uma linha "Termo LGPD" derivada das flags de `parceiros`, então todo cliente recém-cadastrado já nascia com um termo que ninguém gerou. Agora `montarLinhasDocumentos()` só emite a linha do LGPD quando ele existe de fato — há registro `termo-lgpd` em `documentos` **ou** histórico nas flags (`temHistoricoLGPD()`: `termo_aceito`, `recusado`, `data_envio`, `data_aceite`, `data_recusa`). Cliente sem documento nenhum entra com a linha **"— / Sem documento"** (`linhaSemDocumento()` + badge `sem_documento`), para continuar visível e clicável na lista. Mesma regra em `montarDocsAcompanhamento()`, e o acompanhamento ganhou estado vazio (`.acomp-vazio`) convidando a gerar o primeiro documento. Impacto medido na base: 2 clientes de 52 deixam de exibir o LGPD fantasma.

**Sessão expirada leva ao login (23/08/2026):** quando a sessão acabava (expiração, revogação ou logout em outra aba), as consultas falhavam e a tela mostrava "Erro ao carregar dados", sem dizer o que fazer. Em `js/auth.js`: `erroDeSessao(error)` (reconhece 401, `PGRST301`, "jwt expired", "invalid jwt", "refresh token"), `tratarErroDeSessao(error)` (redireciona e devolve `true` para quem chamou não exibir o erro genérico) e `redirecionarParaLogin(motivo)` — que limpa o cache da navbar e guarda a página atual em `?redirect=`. Um `onAuthStateChange` global capta `SIGNED_OUT` (flag `_logoutIntencional` evita confundir logout normal e conta inativa com sessão expirada). Aplicado em `carregarParceiros`, `recarregarListaAoVivo`, `carregarDetalhe`, `inicializarAcompanhamento`, `documentos.js` e `usuarios.js`. O `login.html` mostra o motivo ("Sua sessão expirou. Entre novamente para continuar.") e volta para a página de origem após o login — **validando o `redirect` para aceitar só caminho interno** (`//evil.com`, `https://…` e `javascript:` caem para `/`, testado).

**Correção de segurança na view (23/08/2026):** `vw_documentos_pendentes` fora criada sem `security_invoker` — rodava com os privilégios do dono e **ignorava o RLS**, deixando qualquer portador da anon key ler CPF, telefone e HTML dos termos pendentes (badge "SEM RESTRIÇÕES" no painel). `supabase_view_pendentes_security_invoker.sql` (aplicada) liga `security_invoker = true` e revoga o SELECT da `anon`. O n8n continua lendo tudo (credencial service_role tem BYPASSRLS) e o `authenticated` mantém acesso pela policy.

**Decisão pendente (regra da interação)**: hoje a tela mostra a **última** interação do cliente, qualquer status (ex.: Case de campanha já concluído). A POC prevê a interação do **atendimento em andamento** (RF12) — refinar critério (Status aberto, `CPFAtendente__c` do consultor logado, ou escolha manual) na fase de geração/envio.

**Acesso a dados (aprendido em 22/08/2026)**: a anon key do front **não insere** em `parceiros` (RLS: só autenticado) e o MCP Supabase da sessão é **somente leitura**; escrita administrativa pontual foi feita via Supabase Management API (`POST /v1/projects/qvjpnucpwdrtxfjqicsu/database/query`) com o token `sbp_` do `.mcp.json` do Fluxos_N8N — ignora RLS, usar com parcimônia. Projeto Supabase do app = `qvjpnucpwdrtxfjqicsu` (mesmo do MCP).

**Estado do repositório**: a frente Termos URC foi commitada no **#34** (23/08/2026) — primeiro commit desde `853f08d` — e os ajustes da preparação para os testes no **#35** (cadastro temporário de cliente, Editar Cliente no acompanhamento, fim do termo pré-atribuído, redirecionamento por sessão expirada, guarda da integração no FOCO). A partir daqui o projeto entra em **testes com usuários**. Não versionados por decisão de 23/08/2026 (nada disso é necessário no deploy da Vercel): `.agents/`, `.claude/`, `skills-lock.json` e `README-Alfredo.md` (README antigo, superado) — todos agora no `.gitignore`. ⚠️ **`js/supabase-config.js` está rastreado** apesar de constar no `.gitignore`: foi adicionado de propósito no commit `57deebb` para o deploy da Vercel funcionar, e o `.gitignore` não afeta arquivo já rastreado. A chave ali é a **anon key** (pública por design, protegida por RLS) — mas vale saber que ela está no GitHub.

**Próximas fases (pendentes):**
1. **Regra da interação** (acima) — hoje é sempre o último Case do cliente.
2. **Migração do LGPD para `documentos`** como fonte única: o aceite/recusa do termo LGPD ainda chega só em `parceiros` (o n8n grava por CPF) e a lista deriva o status de lá.
3. **Telas 5 e 7 da POC** (aceite pelo cliente no celular / confirmação do upload) — hoje representadas apenas no protótipo.
4. **Débitos do n8n**: credenciais do FOCO e anon key do Supabase **hardcoded em nós** da instância (migrar para credenciais do n8n); redundância do `data_envio` gravado pelo fluxo e pelo front.
5. **Termo de Baixa** — existe modelo oficial em `docs/` mas não há card nem entrada em `TERMOS_URC`.

- **Modelos oficiais** em `docs/`: 6 DOCX (Parcelamento MEI PGFN e RFB, Reenquadramento SIMEI, Termo de Responsabilidade Formalização/Alteração/Baixa) + `TERMO DECLARAÇÃO ANUAL DASN.pdf` (título oficial: "Declaração de Responsabilidade").
- **Divergências conferidas em 22/08/2026** entre modelos e POC: falta card do **Termo de Baixa**; POC tem **3 cards de parcelamento para 2 termos oficiais** (duplicidade); filtro da Tela 1 desalinhado do menu da Tela 2; os **campos específicos de cada termo** (checklists de documentos, modalidades/valores de parcelamento, tabela DASN de anos, RG) não estão representados — a POC só demonstra o formulário genérico da Formalização.

## Referências

- `README.md` — documentação completa (funcionalidades, schema do banco, setup).
- `docs/` — modelos de termos e POC; não é código.
- `docs/integracao-foco/` — documentação das APIs de integração com o FOCO/Salesforce (README com endpoints, autenticação e SOQL usados + PDF oficial de integração). Novos materiais da integração FOCO vão aqui.
