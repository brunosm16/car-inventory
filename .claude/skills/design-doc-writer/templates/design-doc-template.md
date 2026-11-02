---
titulo: "{{Número}} - {{Nome do Épico/Feature}}"
tipo: Design Doc
autor: "{{Nome do autor}} - (assistido por AI - Claude)"
data: { { AAAA-MM-DD } }
status: { { proposta | aprovado | implementado } }
---

> {{Uma frase de contexto: em que arquitetura/padrão já existente no repositório este design se baseia, se houver.}}

# {{Número}} — Documento de Design: {{Título da Feature}}

## 1. Considerações

#### 1.1 Premissas

_Descreva aqui quaisquer premissas, contexto de fundo ou dependências do software, do seu uso, do ambiente operacional, ou questões relevantes do projeto. Inclua explicitamente pontos de negócio ainda não confirmados com o time de produto/stakeholders — marcados para validação, não tratados como decididos._

#### 1.2 Restrições

_Descreva aqui quaisquer restrições no sistema que tenham impacto significativo no design — limites impostos por APIs/serviços de terceiros, requisitos de integridade e rastreabilidade de estoque de veículos, janelas de tempo ou SLAs, e decisões técnicas já tomadas que não podem ser revisitadas nesta entrega._

#### 1.3 Ambiente do Sistema

_Descreva aqui o ambiente no qual o software vai executar (linguagem, framework, banco de dados, infraestrutura de nuvem). Inclua o motivo pelo qual esse ambiente foi escolhido — por que reaproveitar (ou não) infraestrutura já existente — e se há planos de incluir novos ambientes/seções à lista atual._

## 2. Arquitetura

#### 2.1 Visão Geral

_Forneça aqui uma visão geral descritiva da arquitetura do software/sistema/aplicação: o escopo da história/feature, a cadeia de chamada (call chain) entre atores e sistemas, as decisões centrais que moldam a arquitetura e a justificativa de cada uma (uma tabela Decisão → Motivo é útil aqui)._

#### 2.2 Diagramas de Componentes

_Forneça aqui o(s) diagrama(s) C4 (Contexto e/ou Componentes, em Mermaid) e uma descrição detalhada das partes mais relevantes. Pode haver múltiplos diagramas — inclua uma descrição para cada um. Use subseções para listar componentes e suas responsabilidades quando necessário._

#### 2.3 Diagramas de Classes

_Forneça aqui quaisquer diagramas de classes necessários para ilustrar a aplicação, organizados por componente. Se o módulo não introduzir nenhuma estrutura orientada a objetos além do padrão mecânico já estabelecido no repositório, declare explicitamente que o diagrama não se aplica e justifique — não produza um diagrama sem informação nova além do que os componentes (2.2) e o modelo de dados (2.6) já mostram._

#### 2.4 Diagramas de Sequência

_Forneça aqui os diagramas de sequência (Mermaid), um por fluxo/caso de uso relevante. Para cada fluxo, descreva o caso de uso que ele resolve e as decisões não óbvias envolvidas (idempotência, tratamento de erro esperado vs. técnico, ordenação, autenticação)._

#### 2.5 Diagramas de Implantação

_Forneça aqui o diagrama de implantação do sistema (novo contêiner? mesmo processo? nova infraestrutura de nuvem?), incluindo qualquer informação necessária para descrevê-lo. Inclua também as implicações de escalabilidade futura do sistema e quaisquer riscos operacionais (ex.: sincronização de estoque entre lojas/pátios ficando defasada)._

#### 2.6 Outros Diagramas

_Forneça aqui quaisquer diagramas adicionais (ex.: modelo de dados/ER) e suas descrições em subseções. Liste as decisões de modelagem e o motivo de cada tabela/coluna nova._

## 3. Design de Interface do Usuário

_Forneça aqui quaisquer mock-ups ou protótipos de interface do usuário, com explicações do fluxo/progressão de telas. Se não houver mock-ups visuais desenhados para esta entrega, descreva o fluxo de telas inferido dos diagramas de sequência (2.4) e declare explicitamente que o desenho visual fica a cargo do time de UX/Frontend._

## 4. Apêndices e Referências

#### 4.1 Definições e Abreviações

_Liste aqui, em tabela, quaisquer definições ou abreviações que ajudem um novo membro do time a entender o jargão frequentemente referenciado neste documento (termos de domínio, termos de APIs de terceiros, nomes de mecanismos já existentes no repositório)._

#### 4.2 Referências

_Liste aqui quaisquer referências que deem informação extra sobre um tópico do documento: documentação oficial de APIs externas consultada, código-fonte relevante do repositório (classes/arquivos base reaproveitados), e as subtarefas/histórias do épico que detalham escopo técnico e critérios de aceite por operação._
