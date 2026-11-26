---
titulo: "09 - Backlog 254650 - Configuração da Integração Só Estoque"
tipo: Design Doc
autor: "Bruno Silveira - (assistido por AI - Claude)"
data: 2026-11-26
status: proposta
---

> Base: fluxo assíncrono já existente (filas SQS + `AsyncOperation` no DynamoDB + webhooks), descrito em `Fluxo_Integracao_Locavia_So_Estoque 2.pdf`. Somente backend: o `front-locavia-web-angular` não é alterado.

# 09 — Documento de Design: Configuração da Integração Só Estoque

## 1. Considerações

#### 1.1 Premissas

- A configuração é **por Empresa** (`CodigoEmpresa` = `idLocadora` do dicionário), e o veículo usa a configuração da sua empresa.
- O Locavia é a fonte da verdade da configuração. O car-inventory guarda uma cópia (snapshot) atualizada pelo evento de empresa.
- Campos de conexão, todos da Só Estoque e por empresa:
  - `Endpoint API`: URL base da API da Só Estoque.
  - `URL Webhook`: URL da Só Estoque que recebe os webhooks de empresa e veículo enviados pelo car-inventory. Substitui as env vars `API_SO_ESTOQUE_*_WEBHOOK_URL`.
  - `Chave`: credencial usada nos dois.
- Margem por veículo no gerenciador fica fora deste escopo.

#### 1.2 Pontos em aberto

| # | Ponto | Impacto enquanto aberto |
| --- | --- | --- |
| 1 | Endpoints do parceiro para empresa e para desativar todos os veículos ainda não existem | Webhook de empresa e desativação ficam atrás de `SoEstoqueHttpService`; a operação é registrada, e o envio é ligado quando o parceiro publicar |
| 2 | Comportamento quando o prazo de cancelamento acaba (ex.: confirmação automática da venda) | Só a recusa de cancelamento pela locadora após `DataLimiteCancelamento` é implementada |
| 3 | Mudança de status ou de data prevista no cadastro do veículo não gera evento | O snapshot do car-inventory pode ficar defasado até a próxima desmobilização ou reenvio manual |

#### 1.3 Restrições

- Sem mudança de frontend: o backend entrega endpoints e contratos prontos para a tela futura.
- Contratos de fila: só mudanças **aditivas**. O campo `Origem` é opcional na mensagem de desmobilização.
- O Locavia só fala com a integração por SQS. O car-inventory lê o Locavia apenas por HTTP, como `INTEGRACAO_CAR_INV`, nunca pelo banco.
- Regras de venda da reserva ficam no Locavia, que é o dono da `ReservasVeiculo`.
- Trabalho com data marcada usa EventBridge Scheduler one-time, como no Asaas. Sem cron.

#### 1.4 Ambiente do Sistema

- `api-locavia-web-ts`: NestJS + TypeORM + SQL Server.
- `api-locaviaweb-car-inventory`: NestJS no EKS, com SQS, DynamoDB e EventBridge Scheduler.
- Reaproveita a infraestrutura existente. As únicas peças novas são: fila de empresas, fila de retorno da desmobilização, tabela `car-inventory-companies` e o Scheduler.

## 2. Arquitetura

#### 2.1 Visão Geral

| Decisão | Motivo |
| --- | --- |
| Nova tabela `IntegracaoSoEstoque` (+ `IntegracaoSoEstoqueStatusVeiculo`) no Locavia | `PortalSeminovosParametros` e `EmpresasIntegracoes` não comportam os parâmetros |
| Toda mudança relevante publica na fila **empresas** (`ativada`, `alterada`, `parametros`, `desativada`) | Um único canal mantém o snapshot do car-inventory e o envio para a Só Estoque |
| `Chave` não trafega na fila; o car-inventory a busca em `GET /integracoes/so-estoque/configuracao` | Segredo fora da fila e da DLQ |
| Webhooks vão para a `URL Webhook` da empresa, e chamadas à API da Só Estoque usam o `Endpoint API` | Configuração por empresa no lugar de env vars globais |
| Política de disponibilização (status, data prevista + antecedência, preço, automático/manual) avaliada no **car-inventory** | Ele tem o snapshot do veículo e da empresa e reavalia tudo quando um parâmetro muda, sem o Locavia reprocessar |
| Antecedência via **Schedule one-time por veículo** (`so-estoque-veiculo-{id}`), que reentrega a mensagem na fila de desmobilização | Sem job. Evento mais novo substitui o agendamento, e `upsert` por `occurredAt` descarta o antigo |
| Nova fila `locaviaweb-integracao-desmobilizacao-so-estoque-retorno` | Leva a situação "Enviado/Falha" ao gerenciador e alimenta o histórico. Segue o padrão `reserva/pagamento-retorno` |
| Regras de venda (preço mínimo = `ValorPrevistoVenda × margem %`, bloqueio abaixo do mínimo, `DataLimiteCancelamento` em dias úteis) em `ReservaVeiculoRegrasService` | O Locavia é o dono da reserva, e as regras usam `Feriados` da empresa |
| Histórico em tabela própria do Locavia (`IntegracaoSoEstoqueHistorico`) | A guia Venda não lê o DynamoDB, e o Locavia não chama a integração |
| Alteração da margem com integração ativa exige `confirmarImpactoVeiculos=true` (senão 422) | Garante no backend a confirmação de "afeta todos os veículos enviados" |

**Endpoints novos**

| API | Rota | Uso |
| --- | --- | --- |
| Locavia | `GET/POST /integracoes/so-estoque/configuracoes`, `GET/PUT /integracoes/so-estoque/configuracoes/:codigo` | Tela de configuração |
| Locavia | `GET /integracoes/so-estoque/status-veiculo` | Status permitidos, sem Perda total, Roubado, Sinistrado e Sub-locado devolvido |
| Locavia | `GET /integracoes/so-estoque/configuracao` | Configuração da empresa do usuário de integração (para o car-inventory) |
| Locavia | `GET /veiculos/:codigo/integracao-so-estoque` | Resumo e histórico na guia Venda |
| car-inventory | `GET /companies/:id` | Consulta da locadora pela Só Estoque (snapshot DynamoDB) |

#### 2.2 Diagramas de Componentes

- C4 Nível 2 — Contêineres: [drawio-diagrams/09-backlog-254650-conteineres.drawio](drawio-diagrams/09-backlog-254650-conteineres.drawio)
- C4 Nível 3 — Locavia: [drawio-diagrams/09-backlog-254650-locavia-componentes.drawio](drawio-diagrams/09-backlog-254650-locavia-componentes.drawio)
- C4 Nível 3 — car-inventory: [drawio-diagrams/09-backlog-254650-car-inventory-componentes.drawio](drawio-diagrams/09-backlog-254650-car-inventory-componentes.drawio)

Componentes novos:

- **Locavia:** `IntegracaoSoEstoqueController` e use cases, `PublicarEmpresaIntegracaoUseCase`, `ConsumidorRetornoDesmobilizacaoSoEstoque`, `HistoricoIntegracaoSoEstoqueService`.
- **car-inventory:** `ProcessCompanyEventUseCase`, `CompanyRepository`, `VehiclePublicationPolicy`, `PublicationWindowScheduler`, `DemobilizationReturnPublisher`, `CompaniesController`.
- **Alterados:**
  - `Create/UpdateEmpresa`: publica quando a integração está ativa.
  - `PublicarDesmobilizacaoIntegracao`: checa `Ativo` e preenche `Origem`.
  - `ReservaVeiculoRegrasService`.
  - `ProcessVehicleDemobilizationUseCase`.
  - `SoEstoqueHttpService`: URL e chave por empresa, mais `sendCompany`.

#### 2.3 Diagramas de Classes

Não se aplica: as classes seguem o padrão mecânico dos dois repositórios (use case, repositório, consumidor), já mostrado nos componentes (2.2) e no modelo de dados (2.6).

#### 2.4 Diagramas de Sequência

Arquivo [drawio-diagrams/09-backlog-254650-fluxos.drawio](drawio-diagrams/09-backlog-254650-fluxos.drawio), uma página por fluxo:

1. **Configuração e empresa:** salvar a configuração, publicar o evento, buscar a chave, gravar o snapshot e enviar o webhook de empresa. Idempotência por `COMPANY_EVENT:eventId`.
2. **Disponibilização:** a política decide entre `NOT_ELIGIBLE`, `SCHEDULED` (Schedule) e envio. Veículo de empresa sem envio `FINISHED` aguarda via retry. O resultado volta pela fila de retorno.
3. **Reserva com regras de venda:** preço mínimo e data limite de cancelamento aplicados no Locavia. A recusa é erro de negócio pelo `reserva-retorno` existente.
4. **Histórico do veículo:** resumo e eventos lidos só do SQL Server do Locavia.

#### 2.5 Diagramas de Implantação

Sem novo contêiner: os novos recursos de AWS aparecem no diagrama de contêineres (2.2). Infra a solicitar:

- Filas `empresas-so-estoque` e `desmobilizacao-so-estoque-retorno`, com DLQ.
- Tabela `car-inventory-companies`.
- GSI `companyId-index` em `vehicles` e `async-operations`.
- Permissão `scheduler:CreateSchedule/UpdateSchedule/DeleteSchedule`, mais uma role do Scheduler com `sqs:SendMessage` na fila de desmobilização.
- Migrations no Locavia.

#### 2.6 Outros Diagramas

Modelo de dados: [drawio-diagrams/09-backlog-254650-modelo-dados.drawio](drawio-diagrams/09-backlog-254650-modelo-dados.drawio).

- `IntegracaoSoEstoque`: 1 por empresa (`CodigoEmpresa` UNIQUE), com os campos das guias Principal e Parâmetros.
- `IntegracaoSoEstoqueStatusVeiculo`: status permitidos (N:N com `VeiculosStatus`).
- `IntegracaoSoEstoqueHistorico`: eventos por veículo com `Tipo` = filtro do protótipo.
- `ReservasVeiculo` ganha duas colunas:
  - `ValorMinimoVenda`, para auditar o mínimo vigente na reserva.
  - `DataLimiteCancelamento`.
- DynamoDB:
  - Nova tabela `car-inventory-companies`.
  - Novos status `NOT_ELIGIBLE` e `SCHEDULED` em `async-operations`.
  - `publication` no snapshot do veículo.

## 3. Design de Interface do Usuário

Protótipos de referência, implementados futuramente pelo frontend:

- `Configuração Integração SóEstoque.html`: guias Principal e Parâmetros.
- `Cadastro do Veículo — Histórico SóEstoque.html`: guia Venda, bloco "Integração SóEstoque" com filtro por tipo.

Este backlog entrega apenas os endpoints que alimentam essas telas.

## 4. Consequências e Riscos

| # | Risco / Consequência | Severidade | Mitigação |
| --- | --- | --- | --- |
| 1 | APIs do parceiro (empresa, desativação em massa) inexistentes (aberto #1) | Alta | Webhook de empresa atrás de `SoEstoqueHttpService`; desativação fica pendente com operação registrada |
| 2 | Snapshot defasado por mudança de status/data prevista sem evento (aberto #3) | Média | Reenvio manual pelo gerenciador |
| 3 | Mudança de parâmetro reavalia todos os veículos da empresa (rajada de webhooks) | Média | Processamento pela própria fila, com concorrência limitada do `BaseReceiver` |
| 4 | Chave guardada no DynamoDB | Média | Criptografia em repouso, nunca logada nem devolvida em GET |
| 5 | Regra de negócio dividida: disponibilização no car-inventory, venda no Locavia | Baixa | Fronteira explícita: dados de anúncio na integração, reserva no dono da reserva |
| 6 | Env vars de URL de webhook substituídas por configuração por empresa | Baixa | Remover após a migração de todas as empresas ativas |

## 5. Apêndices e Referências

#### 5.1 Definições e Abreviações

| Termo | Definição |
| --- | --- |
| Margem de venda | % do `ValorPrevistoVenda` aceito; define o preço mínimo |
| Antecedência | Dias antes da data prevista em que o veículo passa a ser enviado |
| Snapshot | Cópia no DynamoDB do último estado recebido (empresa/veículo) |
| `Origem` | `automatica` (mudança de situação da desmobilização) ou `manual` (gerenciador) |

#### 5.2 Referências

- [backlog-254650.md](backlog-254650.md)
- `Fluxo_Integracao_Locavia_So_Estoque 2.pdf`
- [04-sqs-queues.md](../08-architecture-refinements/04-sqs-queues.md)
- [06-automatic-desmobitilization.md](../08-architecture-refinements/06-automatic-desmobitilization.md)
- Locavia:
  - `src/modules/integracoes/soEstoque/`
  - `src/modules/desmobilizacao/desmobilizacoesIntegracaoGerenciador/useCase/PublicarDesmobilizacaoIntegracao/`
  - `src/modules/cadastros/reservasVeiculo/services/ReservaVeiculoRegras/`
  - `src/modules/sistema/empresas/useCase/`
- car-inventory:
  - `src/modules/vehicles/usecases/process-vehicle-demobilization.usecase.ts`
  - `src/modules/so-estoque/so-estoque-http.service.ts`
  - `src/common/usecases/base-receiver.usecase.ts`
