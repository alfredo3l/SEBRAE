# [Termo URC - Mensagem ao Usuario]

- **ID:** `WxjQwFqYofDlbDh1` · **Status:** ativo · **Nós:** 9 (+1 sticky) · **Criado:** 08/10/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-MENSAGEM-USUARIO`
- **Pasta na instância:** SEBRAE (mover manualmente — a API do n8n desta instância recusa operações de pasta)

Na **Gestão de Usuários**, o administrador clica no WhatsApp de um usuário, escreve a mensagem e o
fluxo envia pela instância **SEBRAE**, com o **nome e o WhatsApp do administrador** no rodapé — para o
usuário continuar a conversa direto com ele (respostas ao número institucional não são tratadas).

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC-MENSAGEM-USUARIO, responde pelo nó "Responde")
  → instancia (Set: instancia = "SEBRAE")
  → Prepara mensagem (HTTP Request: RPC preparar_mensagem_usuario com o TOKEN do administrador; resposta completa)
  → Monta mensagem (Code: texto + rodapé, ou { enviar: false, motivo })
  → Tem mensagem? (If)
       ├─ true  → Envia mensagem (Evolution, instância SEBRAE)
       │            → Registra resultado (HTTP Request: RPC n8n_resultado_mensagem_usuario, credencial "Acto") ─┐
       └─ false ──────────────────────────────────────────────────────────────────────────────────────┤
  → Resumo (Code: { ok, enviado, motivo })
  → Responde (Respond to Webhook: JSON)
```

## Contrato com o sistema

**Requisição:** `{ "destinatario_id": "<uuid>", "texto": "<até 1.000 caracteres>", "token": "<access_token do admin>" }`

**Resposta (HTTP 200):** `{ ok: true, enviado, motivo }` — `motivo` traz a mensagem do banco quando recusado
(ex.: "Cadastre o seu WhatsApp no Meu Perfil…", "Usuário inativo…", "Muitas mensagens em pouco tempo…").

## Regras (banco)

`preparar_mensagem_usuario(destinatario, texto)` — chamada com o JWT de quem envia: só **administrador ativo**;
exige o **WhatsApp do próprio administrador**; destinatário **ativo** com número e diferente do remetente; texto
de 1 a **1.000** caracteres; no máximo **20 mensagens por administrador em 10 min**. Grava o histórico em
`mensagens_whatsapp_usuarios` (status `pendente` → `enviada`/`falha` por `n8n_resultado_mensagem_usuario`, só
`service_role`). RLS: só administrador lê; ninguém escreve direto. Migração: `supabase_mensagens_whatsapp_usuarios.sql`.

## Credenciais referenciadas

Chave **anon** do Supabase no header do nó `Prepara mensagem` (pública por design; quem autoriza é o JWT do
administrador). Supabase `Acto` (service_role) no `Registra resultado`. Evolution API (`Evolution API`, instância `SEBRAE`).

## Verificação (08/10/2026)

RPCs testadas numa transação desfeita (13 casos: envio ok com status, inativo, sem número, para si mesmo, vazio,
1.001 caracteres, insert direto negado, admin sem número próprio, operador, leitura do histórico só por admin,
resultado só por service_role). Webhook real com token inválido → `enviado: false` com o motivo do banco; CORS OK.
Tela: 21 asserções no Chrome headless. **Envio real pela Evolution ainda não testado.**
