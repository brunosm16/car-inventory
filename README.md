# car-inventory

Repositório de documentação, arquitetura e design docs do projeto **car-inventory** (gestão de estoque/pátio de veículos). Não contém código de produção — é o par documental de [`api-locaviaweb-car-inventory`](../api-locaviaweb-car-inventory), no mesmo padrão usado em [`asaas-integration`](../asaas-integration) para a integração Asaas.

## Estrutura

```
car-inventory/
├── .claude/
│   ├── CLAUDE.md                 # Convenções do repositório para o Claude Code
│   └── skills/
│       ├── design-doc-writer/    # Skill para gerar design docs (C4 + Mermaid/Draw.io)
│       └── subtask-writer/       # Skill para quebrar histórias em subtarefas
├── product-backlog/
│   └── {codigo}-{slug-da-feature}/
│       ├── {codigo}-design-doc.md
│       ├── drawio-diagrams/
│       ├── mockups/
│       ├── scripts/
│       └── subtasks/
│           ├── {codigo} - Índice das Subtarefas.md
│           └── {codigo}-{NN} - {Título}.md
├── collections/                  # Coleções Postman/Insomnia para testar os endpoints
└── scripts/                      # Scripts utilitários (infra, migração, limpeza de dados)
```

## Convenções

- Documentação em markdown, escrita em português brasileiro.
- Arquitetura modelada com C4 Model (Mermaid para os diagramas versionados em markdown, Draw.io para os diagramas editáveis em `drawio-diagrams/`).
- Cada feature/épico do backlog vive em sua própria pasta dentro de `product-backlog/`, nomeada `{codigo}-{slug}`.
- Use as skills do Claude Code (`design-doc-writer`, `subtask-writer`) para gerar e manter os documentos — elas aplicam os templates e os quality gates definidos em `.claude/skills/`.

## Setup

```bash
pnpm install
```

Isso habilita o commitlint + husky (commits no padrão [Conventional Commits](https://www.conventionalcommits.org/)) e o Biome/Prettier para lint e formatação de markdown.

```bash
pnpm lint       # biome check
pnpm format     # biome format + prettier (markdown)
pnpm commit     # commit assistido (commitizen)
```
