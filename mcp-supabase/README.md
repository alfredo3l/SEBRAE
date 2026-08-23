# MCP Supabase

Integração do projeto com o **servidor MCP oficial do Supabase**, permitindo que o Claude Code interaja diretamente com o projeto Supabase (banco, migrações, logs, advisors, edge functions, docs etc.).

## Configuração

O servidor está registrado no escopo do **projeto**, no arquivo [`.mcp.json`](../.mcp.json) da raiz (versionado — não contém segredos, apenas o `project_ref`):

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=qvjpnucpwdrtxfjqicsu&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
    }
  }
}
```

- **Projeto Supabase**: `qvjpnucpwdrtxfjqicsu`
- **Features habilitadas**: `docs`, `account`, `database`, `debugging`, `development`, `functions`, `branching`

Foi adicionado com:

```bash
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=qvjpnucpwdrtxfjqicsu&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

## Autenticação (obrigatória, uma vez por máquina)

A autenticação é via OAuth e **precisa ser feita em um terminal comum** (não funciona dentro da extensão do IDE):

```bash
claude
/mcp
```

Selecione o servidor **supabase** e depois **Authenticate** para iniciar o fluxo no navegador.

## Skills do Supabase (opcional)

Para instalar as Agent Skills oficiais do Supabase (instruções e boas práticas prontas):

```bash
npx skills add supabase/agent-skills
```

## Uso típico neste projeto

- Consultar/alterar as tabelas `parceiros` e `perfis_usuarios` (`list_tables`, `execute_sql`)
- Aplicar as migrações `supabase_*.sql` da raiz (`apply_migration`) — hoje aplicadas manualmente no painel
- Depurar com `query_logs` e `get_advisors` (segurança/performance, útil para revisar RLS)
- Gerenciar as RPCs (`admin_criar_usuario`, `atualizar_foto_url`, `registrar_ultimo_acesso`)
- Consultar a documentação oficial via `search_docs`
