# product-backlog

Cada feature/épico do backlog tem sua própria pasta: `{codigo}-{slug-da-feature}/`.

Estrutura esperada dentro de cada pasta (crie apenas o que for aplicável à feature):

- `{codigo}-design-doc.md` — gerado com a skill `design-doc-writer`, usando `.claude/skills/design-doc-writer/templates/design-doc-template.md`.
- `drawio-diagrams/` — diagramas C4 editáveis (`.drawio`): contexto, contêineres, componentes, fluxos e modelo de dados.
- `mockups/` — protótipos de tela (HTML estático ou imagens exportadas).
- `scripts/` — scripts SQL/shell específicos da feature (massa de teste, limpeza, migração pontual).
- `subtasks/` — subtarefas geradas com a skill `subtask-writer`, usando `.claude/skills/subtask-writer/templates/subtask-template.md`, mais um índice `{codigo} - Índice das Subtarefas.md`.

Nenhuma feature foi registrada ainda — crie a primeira pasta quando o próximo épico do car-inventory for priorizado.
