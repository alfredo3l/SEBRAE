# [Termo URC - Aviso Senha Redefinida]

- **ID:** `sXKOKjNsKLyMGp3U` · **Status:** ativo · **Nós:** 10 (+1 sticky) · **Criado:** 08/10/2026
- **Webhook:** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-SENHA-REDEFINIDA`
- **Pasta na instância:** SEBRAE (mover manualmente — a API do n8n desta instância recusa operações de pasta)

Quando um gestor de senhas **redefine a senha** de um usuário na Gestão de Usuários, manda ao usuário a **senha temporária** pelo WhatsApp (decisão do desenvolvedor) e avisa os **demais gestores** que o pedido foi atendido. Só recebe mensagem quem tem **telefone com WhatsApp** cadastrado (`perfis_usuarios.whatsapp`); sem número, nada é enviado.

## Pipeline

```
Webhook (POST /webhook/TERMOS-URC-SENHA-REDEFINIDA, responde pelo nó "Responde")
  → instancia (Set: instancia = "SEBRAE")
  → Valida redefinicao (HTTP Request: RPC aviso_senha_redefinida com o TOKEN do gestor)
  → Monta mensagens (Code: usuário + demais gestores com WhatsApp, ou { enviar: false })
  → Tem mensagem? (If)
       ├─ true  → Envia mensagens (Evolution: messages-api, instância SEBRAE) ─┐
       └─ false ─────────────────────────────────────────────────────────┤
  → Resumo (Code: { ok, usuario_avisado, gestores_avisados, motivo })
  → Monta log (Code) → Registra log (HTTP Request: RPC n8n_registrar_log, credencial "Acto")
  → Responde (Respond to Webhook: JSON)
```

## Contrato com o sistema

**Requisição:** `{ "usuario_id": "<uuid>", "senha": "<temporária>", "token": "<access_token do gestor logado>" }`

**Resposta (HTTP 200):** `{ ok: true, usuario_avisado, gestores_avisados, motivo }`. A Gestão de Usuários diz *"Também enviamos uma mensagem no WhatsApp do usuário com a senha temporária"* quando `usuario_avisado`, senão mantém *"Informe-a ao usuário"*; cita os demais gestores quando `gestores_avisados > 0`.

## Proteção

**Ninguém manda senha falsa.** O nó repassa o JWT do gestor e chama a RPC `aviso_senha_redefinida`, que exige `pode_gerir_senhas()`, que **esse** gestor tenha redefinido a senha desse usuário nos últimos **15 min** (`updated_by`/`updated_at` + `senha_temporaria`) e que a senha recebida seja **exatamente** a gravada (bcrypt). Sem isso, nada é enviado. **Execuções com sucesso não são salvas** (`saveDataSuccessExecution: none`) para a senha não ficar no histórico do n8n; execuções com erro continuam salvas.

## Log do sistema

Desde 08/10/2026 cada execução com pedido/redefinição real grava um registro em `logs_sistema` (categoria **WhatsApp**, origem **n8n**) — ver `supabase_logs_sistema.sql` e a tela `logs.html`. A senha nunca vai para o log.

## Banco

Migração `supabase_avisos_senha_whatsapp.sql` (raiz do projeto): `solicitacoes_senha.notificado_em`, `_gestores_senhas_whatsapp()`, `n8n_aviso_pedido_senha(email)` e `aviso_senha_redefinida(usuario, senha)`. O destino usa `whatsapp_jid` (JID verificado na Evolution) ou `55` + dígitos.

## Credenciais referenciadas

A chave **anon** do Supabase está no header `apikey` do nó `Valida redefinicao` — é pública por design (a mesma do front) e quem autoriza é o JWT do gestor. Evolution API (`Evolution API`, instância `SEBRAE`).

## Verificação (08/10/2026)

Chamada real com token inválido → `{ ok: true, usuario_avisado: false, gestores_avisados: 0, motivo: "redefinição não confirmada pelo banco" }`; CORS OK. A RPC foi testada numa transação desfeita: o gestor que redefiniu recebe usuário + JID; senha errada, outro gestor e operador são recusados. **Envio real conferido em 08/10/2026** (senha temporária recebida no WhatsApp do usuário de teste); na sequência o link do login foi retirado do fim da mensagem (v002).
