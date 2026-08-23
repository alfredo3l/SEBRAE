# SEBRAE - TERMOS URC

Sistema de gestão de **termos e declarações URC** para clientes do SEBRAE/MS. Permite cadastro e consulta de clientes, preenchimento e geração dos termos, envio e coleta do aceite via WhatsApp, anexação automática do documento assinado no Salesforce/FOCO e gestão de usuários com controle de acesso por perfis.

O sistema nasceu para um único termo (Aceite LGPD) e hoje atende **múltiplos termos por atendimento**: Termo LGPD, Parcelamento de Débitos do MEI (RFB e PGFN), Reenquadramento SIMEI, Termo de Responsabilidade (Formalização e Alteração) e Declaração de Responsabilidade (DASN).

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Configuração Supabase](#configuração-supabase)
- [Configuração Vercel](#configuração-vercel)
- [Banco de dados (Supabase)](#banco-de-dados-supabase)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como rodar localmente](#como-rodar-localmente)
- [Deploy na Vercel](#deploy-na-vercel)
- [Licença](#licença)

---

## Funcionalidades

### Autenticação e perfis

- **Login** com e-mail e senha via Supabase Auth.
- **Perfis de usuário** na tabela `perfis_usuarios` com **roles**:
  - **admin**: acesso total, incluindo gestão de usuários.
  - **operador**: pode listar, cadastrar, editar e excluir clientes, gerar e enviar termos; não acessa gestão de usuários.
  - **visualizador**: apenas visualização (lista e detalhe); botões de editar, excluir e enviar termo ficam ocultos.
- **Controle de acesso**: usuários inativos são deslogados ao tentar acessar; redirecionamento para login quando não autenticado.
- **Cache de perfil** no `sessionStorage` para preencher nome, foto e role na navbar sem “flash” de “Carregando…” ao navegar.
- **Logout** com limpeza de cache e redirecionamento para a página de login.

### Lista de clientes (`index.html`)

- **Uma linha por documento** (não por cliente): o cliente com três termos aparece em três linhas.
- **Tabela paginada** com quantidade configurável de registros por página (10, 25, 50).
- **Filtros**:
  - Pesquisa textual (CPF, nome, telefone, Account ID, nome do documento).
  - Status: Gerado, Enviado, Aceito, Recusado (o cliente sem documento enviado aparece como **Pendente**).
  - Tipo de documento (alimentado pelo catálogo `TERMOS_URC`).
- **Colunas**: CPF, Nome/Razão Social, Telefone, Account ID, **Documento**, **Status** (+ PDF quando houver), Data Envio, Data Aceite, **FOCO**, Ações.
- **Botão “Ver termo PDF”** quando existir arquivo no bucket `TermosAceite` (link assinado).
- **Atualização em tempo real**: o aceite/recusa e a integração no FOCO são gravados pelo n8n; a tela se atualiza sozinha, **preservando filtros e página**.
- **Clique na linha** ou no ícone de visualizar leva ao **acompanhamento do atendimento**.

### Seleção de documento (`detalhe.html`)

- Card **“Atendimento em andamento”**: nº da interação (`CaseNumber` do último Case do cliente no FOCO) e consultor logado.
- **Grade de cards** com os termos disponíveis; clicar abre o formulário do termo escolhido.
- **Botões (conforme permissão)**: Buscar Cliente, **Editar Cliente** (telefone e e-mail, com sincronização no FOCO), Acompanhamento, Excluir e **Início**.

### Preenchimento e envio do termo (`documento.html`)

- **Formulário por termo** (catálogo `TERMOS_URC`): base comum (nome, CPF, CNPJ, telefone, e-mail, Account ID, nº da interação, data) + campos específicos do modelo oficial + observações complementares.
- **Dados vindos do FOCO**: CPF, telefone, e-mail e **CNPJ** (`Account.CNPJ__c`) chegam preenchidos e continuam **editáveis**; botão **“Salvar contato do cliente”** grava telefone/e-mail no cadastro e sincroniza no FOCO sem sair da tela.
- **Pré-visualização** com a redação oficial do termo, atualizada enquanto se digita. Trechos de qualificação (CNPJ, e-mail, telefone, RG) **somem quando o dado não existe**, em vez de deixar lacunas.
- **“Gerar e prosseguir”**: grava o documento (status `gerado`, campos preenchidos e HTML renderizado) e abre a etapa de envio, com validações (CPF, FOCO, nome, telefone, e-mail, documento gerado).
- **“Enviar”**: dispara o webhook n8n único (`/webhook/TERMOS-URC`), que gera o PDF e envia pelo WhatsApp. O documento recebe uma **letra de resposta** (A, B, C…) e o consultor vê qual resposta o cliente deve dar.

### Acompanhamento do atendimento (`acompanhamento.html`)

- **Cards de todos os documentos** do cliente, coloridos por status, com datas de envio/aceite, letra de resposta e situação no FOCO (“Integrado ✓” / “aguardando aceite”).
- **Timeline de evidências** por documento: gerado (com consultor), enviado via WhatsApp, aceito/recusado e integração no FOCO.
- **Tratamento de recusa**: lista os documentos recusados ou informa que não há nenhum.
- **Retomada**: documentos com status Gerado têm botão “Enviar” (e Enviado, “Reenviar”), que reabre o termo já preenchido.
- Também **atualiza em tempo real**, mantendo o card selecionado.

### Cadastro de parceiros

- **Modal de cadastro** na lista: nome, CPF (máscara), telefone (máscara). Validação de CPF e telefone completos; inserção na tabela `parceiros` com `termo_aceito` e `termo_aceito_foco` em false. Evita duplicidade por CPF.

### Busca de parceiros na API SEBRAE (FOCO)

- **Modal “Buscar parceiro”**: busca no Salesforce/FOCO via API (proxy local ou serverless na Vercel).
- **Tipos de busca**:
  - **CPF**: consulta exata por `CPF__c`.
  - **Telefone**: consulta por `Phone` ou `MobilePhone` (LIKE).
  - **Nome**: consulta por `Name` (LIKE).
- **Resultados** em tabela paginada com filtro rápido; exibição de nome, CPF, telefone, e-mail, status LGPD (FOCO).
- **“Confirmar Cliente”**: garante o parceiro no Supabase (insere com dados do FOCO se não existir) e redireciona para o detalhe. Apenas admin/operador podem confirmar.

### Gestão de usuários (somente admin)

- **Listagem** de usuários com foto, nome, e-mail, role, último acesso, data de criação, status (Ativo/Inativo) e ações.
- **Filtros** por pesquisa (nome/e-mail), role e status (ativo/inativo).
- **Resumo**: totais de usuários, ativos, inativos e admins.
- **Criar usuário**: modal com nome, e-mail, senha e role; criação via RPC `admin_criar_usuario` (Supabase).
- **Editar usuário**: nome, role e (exceto admin principal) ativo/inativo e motivo de desativação.
- **Ativar/Desativar** com toggle na tabela e modal de confirmação; admin principal não pode ser desativado.
- **Alterar foto**: modal de perfil com upload para o bucket `avatars` do Supabase Storage; atualização do campo `foto_url` via RPC `atualizar_foto_url`.

### Foto de perfil

- **Upload** no bucket `avatars` (caminho `{userId}/avatar.{ext}`), limite 2 MB; atualização na navbar e na tabela de usuários.
- **Placeholder** quando não há foto ou em caso de erro no carregamento.

### Integração Salesforce/FOCO

- **Query (SOQL)** via proxy: `GET /api/sebrae/query?q=<SOQL>` — usa credenciais OAuth (client_credentials) configuradas em variáveis de ambiente.
- **Atualização de contato**: `PATCH /api/sebrae/contact/:id` com body `{ "Phone": "(00)00000-0000" }` e/ou `{ "Email": "nome@dominio" }`.
- **Consultas usadas**: Contact por CPF (traz `Account.Name` e `Account.CNPJ__c`) e último Case do cliente (nº da interação).
- **Anexação do documento assinado**: feita pelo fluxo n8n do aceite (`ContentVersion` → `ContentDocumentLink` no Case do atendimento); ao concluir, marca `documentos.salvo_foco` e acende a coluna FOCO na lista.
- **Token** em cache em memória (renovado conforme `expires_in`) nas serverless functions e no servidor de desenvolvimento local.

### Envio e aceite dos termos via WhatsApp

- **Envio**: webhook n8n único `POST /webhook/TERMOS-URC`, com os dados do cliente, do consultor, da interação e do documento (incluindo o HTML renderizado do termo). O fluxo gera o PDF (Gotenberg) e envia pela Evolution API; em sucesso, o documento vira `enviado` com `data_envio`.
- **Aceite/recusa**: como o cliente pode ter vários termos aguardando resposta, cada documento enviado recebe uma **letra** e o cliente responde **`1A`** (aceito) ou **`2A`** (não aceito). O fluxo `TERMOS-URC-ASSINADOS` interpreta variações (`1a`, `A1`, “aceito B”), pede esclarecimento quando a resposta é ambígua e orienta o cliente quando recebe áudio, imagem, emoji ou texto aleatório — **nunca adivinha** a qual documento a resposta se refere.
- **Documento assinado**: PDF com bloco de evidências e **assinatura digital SHA-256** única por documento (calculada sobre id do documento, nome, CPF, nome do termo e data-hora do aceite), salvo no bucket `TermosAceite` e anexado ao Case no FOCO.

---

## Tecnologias

- **Front-end**: HTML5, CSS3, JavaScript (Vanilla)
- **UI**: [Bootstrap 5](https://getbootstrap.com/), [Font Awesome 6](https://fontawesome.com/)
- **Back-end / Auth / Banco**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Storage, RPC)
- **API SEBRAE**: Proxy Node (local) ou **Vercel Serverless Functions** (produção)
- **Deploy**: [Vercel](https://vercel.com/) (arquivos estáticos + serverless)
- **Ambiente local**: Node.js (servidor customizado em `dev.js`), [dotenv](https://www.npmjs.com/package/dotenv) para variáveis de ambiente

---

## Variáveis de ambiente

O sistema usa dois conjuntos de configuração:

1. **Supabase** (front-end): URL e chave anônima no arquivo `js/supabase-config.js` — **versionado** desde o commit `57deebb`, porque o deploy estático da Vercel precisa dele no repositório. A chave ali é a *anon key*, pública por design e protegida pelas policies de RLS; nenhuma chave de serviço deve entrar nesse arquivo.
2. **API SEBRAE (FOCO)** (backend/proxy): variáveis no `.env` (local) ou no painel da Vercel (produção).

Resumo:

| Onde              | Variável              | Obrigatório | Descrição |
|-------------------|------------------------|-------------|-----------|
| Supabase (front)  | `SUPABASE_URL`         | Sim         | URL do projeto (ex.: `https://xxxx.supabase.co`) |
| Supabase (front)  | `SUPABASE_ANON_KEY`    | Sim         | Chave anônima (pública) do projeto |
| Backend / Vercel  | `SEBRAE_API_BASE`      | Não*        | Base da API FOCO (default: `https://hlg-gateway.sebrae.com.br/foco-stg`) |
| Backend / Vercel  | `SEBRAE_CLIENT_ID`     | Sim         | Client ID OAuth2 (Salesforce/FOCO) |
| Backend / Vercel  | `SEBRAE_CLIENT_SECRET`  | Sim         | Client Secret OAuth2 (Salesforce/FOCO) |

\* Se não definido, o código usa o default de homologação.

---

## Configuração Supabase

### 1. Arquivo de configuração no front-end

O front-end não lê variáveis de ambiente para Supabase; ele usa um arquivo JavaScript:

1. Copie o exemplo:
   ```bash
   cp js/supabase-config.example.js js/supabase-config.js
   ```
2. Edite `js/supabase-config.js` e preencha:
   ```javascript
   const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   const SUPABASE_ANON_KEY = 'SUA-ANON-KEY-AQUI';
   ```

O arquivo `js/supabase-config.js` está no `.gitignore` e **não deve** ser commitado.

### 2. Onde obter as credenciais no Supabase

- Acesse o [Dashboard do Supabase](https://app.supabase.com/) → seu projeto.
- **Project Settings** → **API**:
  - **Project URL** → use em `SUPABASE_URL`.
  - **anon public** (Project API keys) → use em `SUPABASE_ANON_KEY`.

### 3. Deploy (ex.: Vercel)

Em deploy estático, o navegador carrega o `supabase-config.js` que estiver no build. Opções:

- Incluir `js/supabase-config.js` no repositório **apenas** se for um projeto de produção dedicado e a anon key for considerada segura para exposição (recomendações do Supabase).
- Ou gerar `js/supabase-config.js` em um **build step** no Vercel a partir de variáveis de ambiente (ex.: `SUPABASE_URL` e `SUPABASE_ANON_KEY` definidas no painel da Vercel) e não versionar o arquivo gerado.

---

## Configuração Vercel

### Variáveis de ambiente no painel

No projeto na [Vercel](https://vercel.com/): **Settings** → **Environment Variables**. Configure para os ambientes desejados (Production, Preview, Development):

| Nome                   | Valor exemplo                                                                 | Observação |
|------------------------|-------------------------------------------------------------------------------|------------|
| `SEBRAE_API_BASE`      | `https://gateway.sebrae.com.br/foco` ou `https://hlg-gateway.sebrae.com.br/foco-stg` | Base da API FOCO (produção ou homologação). |
| `SEBRAE_CLIENT_ID`     | (valor fornecido pelo SEBRAE/FOCO)                                            | Client ID OAuth2. |
| `SEBRAE_CLIENT_SECRET` | (valor fornecido pelo SEBRAE/FOCO)                                            | Client Secret OAuth2. Marque como **Secret**. |

Sem `SEBRAE_CLIENT_ID` e `SEBRAE_CLIENT_SECRET`, as rotas `/api/sebrae/query` e `/api/sebrae/contact/[id]` retornarão erro 500 informando que as variáveis não estão configuradas.

### Configuração do projeto (`vercel.json`)

O projeto já está configurado para hospedagem estática + clean URLs:

```json
{
    "buildCommand": "",
    "outputDirectory": ".",
    "cleanUrls": true,
    "trailingSlash": false
}
```

- **outputDirectory**: `.` — a raiz do repositório é servida como estático (HTML, CSS, JS, imagens).
- **cleanUrls**: `true` — URLs sem `.html` (ex.: `/login`, `/detalhe`, `/usuarios`).
- **trailingSlash**: `false` — URLs sem barra final.

As serverless functions ficam em `api/` e são expostas automaticamente pela Vercel (ex.: `/api/sebrae/query`, `/api/sebrae/contact/[id]`).

---

## Banco de dados (Supabase)

### Tabela `parceiros`

| Campo                  | Tipo      | Descrição |
|------------------------|-----------|-----------|
| id                     | uuid      | PK (default: `gen_random_uuid()`) |
| cpf                    | text      | CPF (único) |
| nome_razao_social      | text      | Nome ou razão social |
| telefone               | text      | Telefone |
| email                  | text      | E-mail do cliente (editável no sistema; sincroniza `Contact.Email` no FOCO) |
| id_salesforce          | text      | Account Id no Salesforce/FOCO |
| id_contato_salesforce  | text      | Contact Id no Salesforce/FOCO (sincronização de telefone) |
| termo_aceito           | boolean   | Se aceitou o termo LGPD |
| termo_aceito_foco      | boolean   | Se o aceite veio do FOCO (exibe badge "FOCO") |
| recusado               | boolean   | Se recusou o termo LGPD |
| assinatura_digital     | text      | Hash da assinatura digital |
| enviado_piiq           | boolean   | Se foi enviado ao PIIq |
| data_envio             | timestamptz | Data/hora do envio do termo |
| data_aceite            | timestamptz | Data/hora do aceite |
| data_recusa            | timestamptz | Data/hora da recusa |
| created_at             | timestamptz | Criação do registro |
| updated_at             | timestamptz | Última atualização |

### Tabela `documentos` (Termos URC)

Múltiplos termos/documentos por parceiro — 1 linha por documento (o `parceiros` permanece como cadastro do cliente, 1 linha por CPF). Migração: `supabase_create_documentos.sql`.

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK (default: `gen_random_uuid()`) |
| parceiro_id | uuid | FK → `parceiros.id` (on delete cascade) |
| tipo_documento | text | Slug do catálogo (`termo-lgpd`, `parcelamento-mei`, `parcelamento-pgfn`, `reenquadramento-mei`, `formalizacao`, `alteracao`, `declaracao-responsabilidade`) |
| nome_documento | text | Título exibido (ex.: "Termo LGPD") |
| status | text | `gerado` \| `enviado` \| `aceito` \| `nao_aceito` \| `recusado` |
| salvo_foco | boolean | Documento anexado no FOCO (badge FOCO na lista) |
| arquivo_path | text | Caminho do PDF no bucket `TermosAceite` |
| case_id_salesforce / case_number | text | Interação (Case) vinculada no FOCO |
| content_document_id | text | ContentDocumentId do anexo no FOCO |
| consultor | text | Nome do usuário que gerou o documento |
| dados_formulario | jsonb | Campos preenchidos pelo consultor na geração |
| html_documento | text | HTML do termo renderizado (usado no PDF do envio e do aceite) |
| codigo_resposta | text | Letra do documento na conversa do WhatsApp (`1A` / `2A`) |
| resposta_texto / respondido_em | text / timestamptz | Resposta do cliente e quando chegou |
| whatsapp_message_id | text | Id da mensagem do WhatsApp que trouxe a resposta |
| assinatura_digital | text | SHA-256 do aceite (único por documento) |
| data_envio / data_aceite / data_recusa | timestamptz | Datas do ciclo |
| created_at / updated_at | timestamptz | Auditoria |

Índice único parcial `(parceiro_id, codigo_resposta) where status = 'enviado'` garante que duas letras iguais não fiquem pendentes ao mesmo tempo. A RPC **`preparar_envio_documento(uuid)`** atribui a primeira letra livre e marca o documento como enviado, recusando documento já respondido. A view **`vw_documentos_pendentes`** (usada pelo n8n) expõe `telefone_digitos` e `cpf_digitos` — só números, porque o PostgREST não casa valores com parênteses e hífen.

RLS igual à de `parceiros` (SELECT/INSERT autenticado; UPDATE/DELETE via `pode_editar_parceiros()`). **Obs.:** o status do Termo LGPD exibido na lista ainda é derivado das flags de `parceiros` (os fluxos n8n gravam lá); `documentos` é a fonte para os demais termos.

### Tabela `perfis_usuarios`

Campos utilizados no sistema: `id` (uuid, igual ao `id` do Auth), `email`, `nome_completo`, `role` (admin, operador, visualizador), `ativo`, `ultimo_acesso`, `motivo_desativacao`, `foto_url`, `created_at`, `updated_at`, `updated_by`. A criação/atualização do perfil pode ser feita via triggers e RPCs no Supabase.

### RPCs utilizadas

- `admin_criar_usuario(p_email, p_senha, p_nome_completo, p_role)`: criação de usuário no Auth e perfil (uso restrito a admin).
- `atualizar_foto_url(nova_url)`: atualiza apenas o campo `foto_url` do perfil do usuário logado (SECURITY DEFINER).

### Storage (buckets)

- **TermosAceite**: PDFs dos termos aceites; nome do arquivo: `TermosAceite_<CPF_sem_pontuacao>.pdf`. URLs assinadas para visualização.
- **avatars**: fotos de perfil; caminho `{userId}/avatar.{ext}`. URL pública usada em `foto_url`.

---

## Estrutura do projeto

```
sebrae-termos-urc/
├── api/
│   └── sebrae/
│       ├── query.js              # GET ?q=SOQL — consulta Salesforce/FOCO
│       └── contact/
│           └── [id].js           # PATCH — atualiza Phone e/ou Email do Contact
├── css/
│   └── style.css
├── img/
│   ├── Logo_Sebrae.png
│   └── Logo_Sebrae_Branco.png
├── js/
│   ├── app.js                    # Lista, seleção de documento, cadastro/edição, busca FOCO, tempo real
│   ├── documentos.js             # Catálogo TERMOS_URC, formulários, pré-visualização e envio
│   ├── acompanhamento.js         # Cards, timeline de evidências e recusas do atendimento
│   ├── auth.js                   # Autenticação, perfis, navbar, logout
│   ├── perfil.js                 # Modal de perfil e upload de foto
│   ├── usuarios.js               # Gestão de usuários (admin)
│   ├── sebrae-api.js             # Cliente da API SEBRAE (query, PATCH contact, helpers)
│   ├── supabase-config.example.js
│   └── supabase-config.js        # Configuração do Supabase (URL + anon key)
├── index.html                    # Lista de clientes/documentos
├── detalhe.html                  # Seleção do documento a gerar
├── documento.html                # Formulário do termo + pré-visualização + envio
├── acompanhamento.html           # Acompanhamento do atendimento (status e evidências)
├── login.html
├── usuarios.html                 # Gestão de usuários (admin)
├── dev.js                        # Servidor local (estático + /api/sebrae)
├── docs/                         # Modelos oficiais dos termos, POC e integração FOCO
├── fluxos/                       # Espelho e histórico dos fluxos n8n do projeto
├── Claude/                       # Contexto do projeto para o assistente (CLAUDE.md e skills)
├── supabase_*.sql                # Migrações aplicadas manualmente no Supabase
├── serve.json                    # Config do serve (fallback)
├── vercel.json                   # Config do deploy Vercel
├── package.json
├── .env.example                  # Modelo para .env (SEBRAE_*)
├── .env                          # Não versionado
├── .gitignore
└── README.md
```

---

## Como rodar localmente

### 1. Clone e dependências

```bash
git clone <url-do-repositorio>
cd SEBRAE
npm install
```

### 2. Supabase

O arquivo `js/supabase-config.js` já vem no repositório apontando para o projeto em uso. Para apontar a outro projeto Supabase, edite-o (modelo em `js/supabase-config.example.js`) com `SUPABASE_URL` e `SUPABASE_ANON_KEY` — veja [Configuração Supabase](#configuração-supabase).

### 3. Variáveis da API SEBRAE

Copie o exemplo e edite com as credenciais reais:

```bash
cp .env.example .env
```

Conteúdo mínimo do `.env`:

```env
SEBRAE_API_BASE=https://gateway.sebrae.com.br/foco
SEBRAE_CLIENT_ID=seu_client_id
SEBRAE_CLIENT_SECRET=seu_client_secret
```

O `dev.js` carrega o `.env` com `dotenv` e exige `SEBRAE_CLIENT_ID` e `SEBRAE_CLIENT_SECRET` para subir o servidor.

### 4. Subir o servidor

```bash
npm run dev
```

O sistema estará em `http://localhost:3000`. O servidor:

- Sirve os arquivos estáticos (HTML, CSS, JS, imagens).
- Expõe `/api/sebrae/query` e `/api/sebrae/contact/:id` usando as variáveis do `.env`.

---

## Deploy na Vercel

1. Conecte o repositório à Vercel e faça o deploy (a raiz do projeto é o output).
2. Em **Settings** → **Environment Variables**, defina `SEBRAE_API_BASE`, `SEBRAE_CLIENT_ID` e `SEBRAE_CLIENT_SECRET` (veja [Configuração Vercel](#configuração-vercel)).
3. Garanta que o front-end tenha acesso ao Supabase: inclua `js/supabase-config.js` no build ou gere esse arquivo em um build step a partir de variáveis de ambiente (ex.: `SUPABASE_URL`, `SUPABASE_ANON_KEY` na Vercel), conforme [Configuração Supabase](#configuração-supabase).

Após o deploy, as rotas `/api/sebrae/query` e `/api/sebrae/contact/[id]` usarão automaticamente as variáveis configuradas no painel.

---

## Licença

Uso interno — SEBRAE.
