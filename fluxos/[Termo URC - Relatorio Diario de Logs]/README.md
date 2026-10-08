# [Termo URC - Relatorio Diario de Logs]

- **ID:** `uuoLTg4EksPZpfwi` · **Status:** ativo · **Nós:** 20 (+1 sticky) · **Criado:** 08/10/2026 · **Fuso do fluxo:** `America/Campo_Grande`
- **Agenda:** cron `0 17 * * 1-5` (segunda a sexta, 17:00 de MS)
- **Webhook ("Enviar agora" da tela):** `POST https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC-RELATORIO-LOGS` `{ token }`
- **Pasta na instância:** SEBRAE (mover manualmente — a API do n8n desta instância recusa operações de pasta)
- **Referências usadas:** `[Relatorio Acessos]` (agenda → consulta → HTML com logo → Gotenberg → texto + PDF pela Evolution) e `[Termo URC - Envio sem assinar]` (A4, margens, `printBackground`, rodapé `footer.html`).

Envia aos destinatários cadastrados na tela **Logs do Sistema** (só o Administrador SEBRAE) um **PDF com o
relatório dos logs**: resumo (totais, termos, categorias, atividade por usuário) + eventos em ordem de horário
("tela aberta" só contada). Decisões do desenvolvedor: período **desde o relatório anterior** (o de segunda cobre o
fim de semana); **dias úteis** = seg–sex menos feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus
Christi, pela Páscoa), 11/10 (MS) e 26/08 (Campo Grande); **dia sem movimento também envia**.

## Pipeline

```
Agenda 17h dias uteis ─→ Dados agendado (RPC n8n_relatorio_logs_agendado, credencial "Acto") ─┐
Enviar agora (tela)   ─→ Dados manual (RPC relatorio_logs_manual com o TOKEN do admin)        ─┤
                                                                                              ↓
  → Prepara dados (Code) → Pode enviar? (If)
       ├─ true  → Busca logo (site) → Logo base64 → Monta HTML (Code) → Convert to File → Monta rodape PDF (Code)
       │            → Gera PDF (Gotenberg, A4) → PDF base64 → Itens por destinatario (Code)
       │            → Envia texto (Evolution) → Envia PDF (Evolution, send-document) ─┐
       └─ false ──────────────────────────────────────────────────────────────────────┤
  → Resumo envio (Code) → Registra envio (RPC n8n_registrar_envio_relatorio, "Acto") → Foi pela tela? (If) → Responde
```

## Banco (`supabase_relatorio_logs_diario.sql`)

- `relatorio_logs_destinatarios` (nome, WhatsApp, `whatsapp_jid`, ativo; número único; RLS: só `pode_ver_logs()`; mudanças vão para o log do sistema, categoria **Relatório**).
- `relatorio_logs_envios` (modo, período, totais, destinatários, enviados) — o **maior `periodo_fim` de envio agendado com pelo menos 1 entregue** é o início do próximo período; sem envio anterior, começa às 00:00 do dia.
- `pascoa(ano)`, `feriado_ms(data)`, `dia_util_ms(data)`.
- `n8n_relatorio_logs_agendado()` (só service_role; fora de dia útil devolve `executar: false` com o motivo) · `relatorio_logs_manual()` (token do Administrador SEBRAE; hoje 00:00 até agora; **não altera** a janela do agendado) · `n8n_registrar_envio_relatorio(...)` (só service_role; grava o envio + linha no log).
- Sem destinatário ativo → não envia e não grava envio (o próximo relatório cobre o período acumulado).

## Credenciais referenciadas

Supabase `Acto` (service_role) nos nós de dados agendados e de registro; chave **anon** (pública) + JWT do
administrador no `Dados manual`; Evolution API (`Evolution API`, instância `SEBRAE`); Gotenberg interno (`http://gotenberg:3000`).

## Verificação (08/10/2026)

Calendário 2026 conferido (Páscoa 05/04; Carnaval 16–17/02; Corpus Christi 04/06; 11/10 e 26/08). RPCs numa
transação desfeita (sem destinatário não executa; duplicado/curto recusados; outra admin não vê nem dispara;
janela seguinte começa no fim do envio anterior; log de inclusão/pausa/reativação/envio). Webhook real com token
inválido → `executou: false` com o motivo; CORS OK. **Geração do PDF no n8n** conferida num fluxo temporário isolado
com os mesmos nós (apagado em seguida). Tela: 21 asserções no Chrome headless + captura. **Envio real pela Evolution
ainda não testado** (primeiro: botão "Enviar agora" ou o agendamento das 17:00).
