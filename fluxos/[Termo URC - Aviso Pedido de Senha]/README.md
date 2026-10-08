# [Termo URC - Aviso Pedido de Senha]

- **ID:** `fNRWBRfKLd1fbiEz` · **Status:** ativo · **Nós:** 8 (+1 sticky) · **Criado:** 08/10/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-SENHA-PEDIDO`
- **Pasta na instância:** SEBRAE (mover manualmente — a API do n8n desta instância recusa operações de pasta)

Avisa pelo WhatsApp os **gestores de senhas** (Administrador SEBRAE + administradores com "cuidar de senhas") quando um usuário registra um **"Esqueci minha senha"** na tela de login. Só recebe mensagem quem tem **telefone com WhatsApp** cadastrado (`perfis_usuarios.whatsapp`); sem número, nada é enviado.

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC-SENHA-PEDIDO, responde pelo nó "Responde")
  → instancia (Set: instancia = "SEBRAE")
  → Reivindica pedido (HTTP Request: RPC n8n_aviso_pedido_senha, credencial Supabase "Acto")
  → Monta mensagens (Code: 1 item por gestor com WhatsApp, ou { enviar: false })
  → Tem mensagem? (If)
       ├─ true  → Envia aos gestores (Evolution: messages-api, instância SEBRAE) ─┐
       └─ false ─────────────────────────────────────────────────────────────┤
  → Resumo (Code: { ok, avisados, motivo })
  → Responde (Respond to Webhook: JSON)
```

## Contrato com o sistema

**Requisição:** `{ "email": "fulano@ms.sebrae.com.br" }`

**Resposta (HTTP 200):** `{ ok: true, avisados: <n>, motivo }` — `avisados` = gestores que receberam a mensagem. A tela de login acrescenta *"Também enviamos uma mensagem no WhatsApp dos administradores…"* quando `avisados > 0`.

## Proteção

**1 aviso por pedido real.** A RPC só devolve gestores se existir pedido `pendente` desse e-mail criado nos últimos **15 min** e ainda **não avisado** (`solicitacoes_senha.notificado_em`), e já marca o aviso. Chamar o webhook à toa, ou repetir o pedido pendente, não gera mensagem — o webhook é público (a tela de login não tem sessão).

## Banco

Migração `supabase_avisos_senha_whatsapp.sql` (raiz do projeto): `solicitacoes_senha.notificado_em`, `_gestores_senhas_whatsapp()`, `n8n_aviso_pedido_senha(email)` e `aviso_senha_redefinida(usuario, senha)`. O destino usa `whatsapp_jid` (JID verificado na Evolution) ou `55` + dígitos.

## Credenciais referenciadas

Supabase `Acto` (service_role) no HTTP Request (*predefined credential type* `supabaseApi`) — a RPC `n8n_aviso_pedido_senha` só é executável por `service_role`. Evolution API (`Evolution API`, instância `SEBRAE`).

## Verificação (08/10/2026)

Chamada real com e-mail sem pedido → `{ ok: true, avisados: 0, motivo: "sem pedido novo" }` (prova que a credencial do Supabase funciona); CORS OK (preflight 204 ecoando a origem). A RPC foi testada numa transação desfeita: 1ª chamada devolve o Administrador SEBRAE, 2ª não devolve nada, e-mail inexistente não devolve nada, `anon`/`authenticated` não executam. **Envio real conferido em 08/10/2026** (mensagem recebida pelo Administrador SEBRAE); na sequência o link do sistema foi retirado do fim da mensagem (v002).
