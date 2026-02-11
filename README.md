# SEBRAE - Aceite LGPD

Sistema de gestão de termos LGPD para parceiros do SEBRAE.

## Funcionalidades

- Login com autenticação via Supabase
- Listagem de parceiros com filtros (pesquisa, status do termo, telefone)
- Cadastro de novos parceiros
- Visualização detalhada de cada parceiro
- Edição de dados do parceiro
- Validações de CPF, telefone e status LGPD
- Envio de termo LGPD via WhatsApp

## Tecnologias

- HTML5, CSS3, JavaScript (Vanilla)
- [Bootstrap 5](https://getbootstrap.com/) - Framework CSS
- [Font Awesome 6](https://fontawesome.com/) - Ícones
- [Supabase](https://supabase.com/) - Backend (banco de dados e autenticação)

## Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/SEU-USUARIO/sebrae-aceite-lgpd.git
cd sebrae-aceite-lgpd
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o Supabase

Copie o arquivo de exemplo de configuração e insira suas credenciais:

```bash
cp js/supabase-config.example.js js/supabase-config.js
```

Edite o arquivo `js/supabase-config.js` e substitua com as credenciais do seu projeto Supabase:

```javascript
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY-AQUI';
```

> **IMPORTANTE:** O arquivo `js/supabase-config.js` está no `.gitignore` e **não deve** ser commitado no repositório para proteger suas credenciais.

### 4. Estrutura do banco de dados (Supabase)

O projeto utiliza a tabela `parceiros` com os seguintes campos:

| Campo              | Tipo      | Descrição                     |
|--------------------|-----------|-------------------------------|
| id                 | uuid      | Identificador único (PK)      |
| cpf                | text      | CPF do parceiro (unique)      |
| nome_razao_social  | text      | Nome ou razão social          |
| telefone           | text      | Telefone do parceiro          |
| termo_aceito       | boolean   | Se aceitou o termo LGPD       |
| assinatura_digital | text      | Hash da assinatura digital    |
| enviado_piiq       | boolean   | Se foi enviado ao PIIq        |
| data_envio         | timestamp | Data do envio                 |
| created_at         | timestamp | Data de criação do registro   |

### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

O sistema estará disponível em `http://localhost:3000`.

## Estrutura do Projeto

```
sebrae-aceite-lgpd/
├── css/
│   └── style.css              # Estilos customizados
├── img/
│   ├── Logo_Sebrae.png        # Logo SEBRAE (colorido)
│   └── Logo_Sebrae_Branco.png # Logo SEBRAE (branco)
├── js/
│   ├── app.js                 # Lógica principal da aplicação
│   ├── auth.js                # Autenticação com Supabase
│   ├── supabase-config.example.js  # Template de configuração
│   └── supabase-config.js     # Configuração real (não commitado)
├── index.html                 # Página principal (lista de parceiros)
├── detalhe.html               # Página de detalhe do parceiro
├── login.html                 # Página de login
├── serve.json                 # Configuração do servidor local
├── package.json               # Dependências do projeto
├── .gitignore                 # Arquivos ignorados pelo git
└── README.md                  # Este arquivo
```

## Licença

Uso interno - SEBRAE
