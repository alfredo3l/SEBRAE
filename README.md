# SEBRAE - Aceite LGPD

Sistema de gestão de termos LGPD para parceiros do SEBRAE. Permite cadastro, consulta, envio de termo via WhatsApp, integração com Salesforce/FOCO e gestão de usuários com controle de acesso por perfis.

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
  - **operador**: pode listar, cadastrar, editar, excluir parceiros e enviar termo LGPD; não acessa gestão de usuários.
  - **visualizador**: apenas visualização (lista e detalhe); botões de editar, excluir e enviar termo ficam ocultos.
- **Controle de acesso**: usuários inativos são deslogados ao tentar acessar; redirecionamento para login quando não autenticado.
- **Cache de perfil** no `sessionStorage` para preencher nome, foto e role na navbar sem “flash” de “Carregando…” ao navegar.
- **Logout** com limpeza de cache e redirecionamento para a página de login.

### Listagem de parceiros

- **Tabela paginada** com quantidade configurável de registros por página (10, 25, 50).
- **Filtros**:
  - Pesquisa textual (CPF, nome, telefone, ID).
  - Status do termo: Todos, Aceito, Não aceito, Recusado.
  - Telefone: Todos ou “Sem telefone”.
- **Colunas**: CPF, Nome/Razão Social, Telefone, Account ID (Salesforce), Termo Aceito (com badge FOCO quando aplicável), Data Envio, Data Aceite, Data Recusa, Data Alteração, Ações.
- **Botão “Ver termo PDF”** na coluna do termo quando existir PDF no bucket `TermosAceite` do Supabase Storage (nome: `TermosAceite_<CPF_sem_pontuacao>.pdf`).
- **Clique na linha** ou no botão de visualizar leva à página de detalhe do parceiro.

### Página de detalhe do parceiro

- Exibição de: nome, CPF, Account ID, telefone, status do termo (Sim/Não/Recusado, badge FOCO quando houver), datas de envio, aceite e recusa.
- **Validações exibidas**: CPF válido, Cadastrado no FOCO, Nome válido, Telefone válido, Status do termo LGPD.
- **Mensagem contextual** conforme situação (pode receber termo, já aceitou, recusou, etc.).
- **Navegação** “Anterior” / “Próximo” entre parceiros (ordem por `created_at`).
- **Abrir termo em PDF** (link assinado do Storage, quando existir).
- **Botões (conforme permissão)**:
  - **Editar**: abre modal para alterar telefone; ao salvar, atualiza no Supabase e sincroniza o campo Phone do Contact no Salesforce/FOCO (via API), quando houver `id_contato_salesforce` ou quando for possível obter o Contact Id por AccountId/CPF.
  - **Enviar termo**: abre modal de confirmação e dispara webhook n8n para envio do termo LGPD via WhatsApp; em sucesso, grava `data_envio` no parceiro.
  - **Excluir**: modal de confirmação e exclusão do registro no Supabase; em sucesso, redireciona para a lista.

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
- **Atualização de telefone do Contact**: `PATCH /api/sebrae/contact/:id` com body `{ "Phone": "(00)00000-0000" }`.
- **Token** em cache em memória (renovado conforme `expires_in`) nas serverless functions e no servidor de desenvolvimento local.

### Envio do termo LGPD via WhatsApp

- Envio realizado por **webhook n8n** (URL configurada no front-end). Payload: `nome_razao_social`, `cpf`, `telefone`.
- Após sucesso da chamada, o sistema atualiza o campo `data_envio` do parceiro no Supabase.

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

1. **Supabase** (front-end): URL e chave anônima no arquivo `js/supabase-config.js` (não versionado).
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
sebrae-aceite-lgpd/
├── api/
│   └── sebrae/
│       ├── query.js              # GET ?q=SOQL — consulta Salesforce/FOCO
│       └── contact/
│           └── [id].js           # PATCH — atualiza Phone do Contact
├── css/
│   └── style.css
├── img/
│   ├── Logo_Sebrae.png
│   └── Logo_Sebrae_Branco.png
├── js/
│   ├── app.js                    # Lista, detalhe, cadastro, edição, exclusão, envio termo, busca FOCO
│   ├── auth.js                   # Autenticação, perfis, navbar, logout
│   ├── perfil.js                 # Modal de perfil e upload de foto
│   ├── usuarios.js               # Gestão de usuários (admin)
│   ├── sebrae-api.js             # Cliente da API SEBRAE (query, PATCH contact, helpers)
│   ├── supabase-config.example.js
│   └── supabase-config.js        # Não versionado
├── index.html                    # Lista de parceiros
├── detalhe.html                  # Detalhe do parceiro
├── login.html
├── usuarios.html                 # Gestão de usuários (admin)
├── dev.js                        # Servidor local (estático + /api/sebrae)
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
cd sebrae-aceite-lgpd
npm install
```

### 2. Supabase

Crie e preencha `js/supabase-config.js` a partir de `js/supabase-config.example.js` com `SUPABASE_URL` e `SUPABASE_ANON_KEY` (veja [Configuração Supabase](#configuração-supabase)).

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
