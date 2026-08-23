# Prompts — `[Termo LGPD - Envio sem assinar]`

> [!NOTE]
> Este fluxo não possui nós de LLM/agente (nenhum campo `systemMessage` ou prompt). É um pipeline determinístico: webhook → consulta Supabase → geração de HTML → PDF (Gotenberg) → envio via WhatsApp (Evolution API). Portanto não há prompts a versionar.
