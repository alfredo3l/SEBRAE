# Skills do projeto SEBRAE

Pasta onde ficam salvas as skills criadas para este projeto.

## Convenção

- Cada skill em sua própria subpasta: `Claude/skills/<nome-da-skill>/SKILL.md` (+ arquivos de apoio, se houver).
- `SKILL.md` com frontmatter padrão:

  ```markdown
  ---
  name: nome-da-skill
  description: Quando e para que usar esta skill.
  ---

  <instruções da skill>
  ```

> [!IMPORTANT]
> O Claude Code só **descobre e invoca** skills que estejam em `.claude/skills/` (na raiz do projeto).
> Esta pasta é o repositório-fonte; ao criar uma skill aqui, registre também uma cópia (ou link)
> em `.claude/skills/<nome-da-skill>/` para que ela fique invocável via `/nome-da-skill`.
