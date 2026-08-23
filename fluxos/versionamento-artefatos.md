# Convenção de versionamento de artefatos (Prompts / Queries / Code)

Convenção herdada do projeto `E:\Fluxos_N8N` (`docs/versionamento-artefatos.md`), adaptada para os fluxos do SEBRAE.

Cada pasta de fluxo em `fluxos/<Nome exato do fluxo>/` contém três subpastas de artefatos:

```
Prompts/   # prompts de LLM/agente (.md)
Queries/   # queries SQL/SOQL/DAX (.sql, .dax)
Code/      # código de nós Code (.js, .py, .html)
```

Dentro de cada uma: `README.md` (índice) + uma subpasta por nó com `CHANGELOG.md` e os arquivos `vNNN.*`.

## As 6 regras

1. **`vNNN.*` é imutável.** Mudou o artefato → nasce `vNNN+1`. Nunca edite uma versão existente.
2. **O arquivo contém só o artefato** (prompt/query/código puro, pronto para colar no nó). Metadados, contexto e decisões vão no `CHANGELOG.md` — assim o diff entre versões fica limpo.
3. **Uma versão por mudança real**, inclusive manutenção (trocar filtro de mês, ajustar texto de mensagem, corrigir regex).
4. **Status no CHANGELOG**: `em produção` | `em teste` | `arquivada`. **Só uma** versão por nó pode estar `em produção`.
5. **Sincronia com a instância**: ao editar o nó no n8n, crie a versão local **no mesmo ato** (e vice-versa). A fonte de verdade é a instância; o repositório é o histórico.
6. **Registre resultados** na coluna "Resultados/observações" do CHANGELOG (execução validada, volume processado, erro corrigido) — é o que permite escolher a versão vencedora.

## Detalhes de formato

- Numeração `v001`, `v002`, ... (3 dígitos).
- Nome da subpasta = **nome exato do nó** no n8n (o nome do nó é contrato — expressões `$('Nome')` e credenciais dependem dele).
- **Regra do `=`**: se o campo no `workflow.json` é expressão n8n (valor começa com `=`), esse `=` **não faz parte do artefato** e é omitido no `vNNN.*`; ao devolver o conteúdo via MCP/JSON, reponha-o. Expressões embutidas (`{{ $('Node').item.json.x }}`) fazem parte do artefato e ficam literais.
- **Todo nó Code é versionado**, sem critério de tamanho.
- Subpasta de categoria sem artefato mantém um `README.md` stub explicando o porquê (ex.: "fluxo sem LLM, não há prompts").

## Formato do CHANGELOG.md por nó

```markdown
# CHANGELOG — <Nome do Nó>

- **Fluxo:** `<nome>` (id `<id>`)
- **Nó:** `<Nome do Nó>` (`<type>`, <modo>)
- **Campo:** `<campo do parameters>` (com ou sem `=` de expressão)
- **Papel:** <o que o nó faz no pipeline>

| Versão | Data | Status | Mudanças | Resultados/observações |
|---|---|---|---|---|
| v001 | AAAA-MM-DD | em produção | Versão inicial (espelho da instância). | ... |

## Decisões registradas
<por que o artefato é assim — armadilhas, formatos, dependências>
```
