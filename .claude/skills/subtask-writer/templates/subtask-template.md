---
epico: "{{codigo-epico}} - {{nome-epico}}"
tipo: Subtarefa
status: backlog
depende_de: ["{{id-subtarefa-dependencia}}"]
---

# {{codigo-epico}}-{{NN}} — {{Título da subtarefa}}

## Objetivo

{{O que esta subtarefa entrega, em 1-3 frases, focado no resultado observável — não em detalhes de implementação (esses vão em Escopo técnico).}}

## Depende de

{{IDs das subtarefas das quais esta depende e o motivo concreto da dependência (não só o número). Se for a primeira/sem dependências, escrever "Nenhuma" e justificar por quê.}}

## Escopo técnico

- {{Componentes concretos envolvidos: controllers, use cases, services, migrations, validators — nomes reais de arquivos/classes do projeto, não descrições genéricas.}}
- {{Sempre que possível, ancorar em código já existente ("Confirmado no código: ...", "mirar X.service.ts", "seguindo o padrão de Y") em vez de propor abstrações novas.}}
- {{Regras de negócio específicas desta subtarefa: validações, condições de erro, idempotência, transação.}}
- {{Marcar com ⚠️ pontos de incerteza técnica ou de negócio que precisam de validação antes ou durante a implementação — não esconder a incerteza atrás de linguagem definitiva.}}

## Endpoints {{Serviço Externo}} envolvidos

- {{Método + path de cada endpoint externo consumido nesta subtarefa.}}

## Critérios de aceite

- {{Caminho feliz: comportamento observável esperado.}}
- {{Erros de negócio (validação, duplicidade, dependência não satisfeita) — com o código/retorno esperado.}}
- {{Concorrência, idempotência ou autorização, quando relevante.}}
- {{Garantias negativas explícitas — o que NÃO deve acontecer (ex.: não logar dado sensível, não chamar a API externa antes de validar localmente).}}

## Observações

{{Referência à seção correspondente do documento de arquitetura. Decisões já tomadas, para não reabrir debate. Riscos residuais e perguntas em aberto que não bloqueiam o início da subtarefa (usar ⚠️ para as que precisam de validação de negócio antes de ir para produção).}}
