# 05 · MVP final: arquitetura da integração Só Estoque ↔ Locavia Web

Arquitetura do MVP como está implementado hoje nos três sistemas:

- **Plataforma Só Estoque** (externa)
- **`api-locaviaweb-car-inventory`** (integração)
- **`api-locavia-web-ts`** (Locavia)

Os diagramas C4 editáveis estão em [`drawio-diagrams/`](drawio-diagrams/):

| Diagrama | Arquivo |
| --- | --- |
| C4 nível 1: contexto | `05-mvp-final-contexto.drawio` |
| C4 nível 2: contêineres dos três sistemas | `05-mvp-final-conteineres.drawio` |
| C4 nível 3: componentes da integração | `05-mvp-final-car-inventory-componentes.drawio` |
| C4 nível 3: componentes do Locavia usados pela integração | `05-mvp-final-locavia-componentes.drawio` |
| Sequência de uma operação de reserva (5 passos) | `05-mvp-final-fluxo-reserva.drawio` |

O roteiro de validação (collection Postman, queries no banco do Locavia e no DynamoDB) está em [`05-mvp-final-validacao.md`](05-mvp-final-validacao.md).

---

## 1. Escopo entregue no MVP

| Domínio | O que a Só Estoque faz | Como a integração atende |
| --- | --- | --- |
| Autenticação | Obtém o token do cliente de integração | `POST /auth/token`; o token vai no header `x-api-key` |
| Empresas | Lê as locadoras | Leitura direta no SQL Server do Locavia |
| Veículos | Lista, filtra, sincroniza por `updatedSince`, lê o detalhe e as movimentações | Leitura direta no SQL Server do Locavia. Inclui os campos da planilha: versão, FIPE, opcionais, alienação, fornecedor e venda efetiva |
| Vendas | Lê as vendas | Leitura direta no SQL Server do Locavia |
| Ordens de serviço | Lê as manutenções e seus itens | Leitura direta no SQL Server do Locavia |
| Reservas | Reserva, troca o cliente, cancela e retira a reserva de um veículo | Escrita assíncrona (SQS + DynamoDB) aplicada no Locavia por `/reservas-venda`, com auditoria de cada passo e webhook de resultado para a Só Estoque |

**Fora do MVP:**

- **Escrita de vendas pela integração.** O design está aprovado em `03-sales`, mas nada foi implementado.
- **Campos 40 a 42 da planilha** (utilização da frota): adiados.
- **Baixa de veículos:** adiada. Veículos continuam 100% leitura.

Os diagramas mostram a escrita de vendas tracejada em cinza, como "planejado".

---

## 2. Sistemas e responsabilidades

| Sistema | Responsabilidade | Dono dos dados |
| --- | --- | --- |
| Só Estoque | Vitrine de seminovos. Consome a API da integração e recebe o resultado das reservas por webhook. | Anúncios e negociações |
| `api-locaviaweb-car-inventory` | Fachada da Só Estoque: <br>• Faz as leituras no banco do Locavia, somente leitura. <br>• Recebe as reservas, valida, enfileira e aplica no Locavia. <br>• Mantém no DynamoDB a operação, a auditoria e uma cópia da reserva. | Operações assíncronas e cópia das reservas, com histórico |
| `api-locavia-web-ts` | Sistema de registro e dono das regras da reserva (`ReservasVenda`). Também cadastra o cliente lojista (`POST /clientes`) e faz o login do usuário de integração (`POST /sessoes`). | Reservas, clientes, veículos, vendas e OS |
| SQL Server LocaviaWeb | Banco do Locavia. Ganhou a tabela `ReservasVenda` e a coluna `Clientes.Lojista`. | — |

---

## 3. Comunicação entre os três projetos

| # | Origem → destino | Protocolo e autenticação | Chamadas | Modo |
| --- | --- | --- | --- | --- |
| 1 | Só Estoque → integração | HTTPS/JSON. JWT do cliente (`POST /auth/token` com `clientId`/`clientSecret`) enviado no header `x-api-key` | Base `/car-inventory/v1`. Catálogo na seção 7 | Síncrono. Nas escritas a resposta é `201`/`200` com `operationId` |
| 2 | Integração → SQL Server LocaviaWeb | TypeORM, mesmo acesso do Asaas (`TYPEORM_*`), `WITH (NOLOCK)` | Empresas, veículos, movimentações, vendas, OS, cliente por documento, venda em aberto e `GETDATE()` | Síncrono e **somente leitura** |
| 3 | Integração → `api-locavia-web-ts` | HTTPS/JSON. JWT do usuário de integração, obtido em `POST /sessoes` com `LOCAVIA_WEB_LOGIN`, `LOCAVIA_WEB_PASSWORD` e `LOCAVIA_WEB_ORGANIZATION` (CNPJ). O token fica em cache até perto do `exp` e um `401` força novo login. | `POST /clientes` (lojista) <br>`POST /reservas-venda` <br>`PUT /reservas-venda` (cliente) <br>`PUT /reservas-venda/cancelar` <br>`PUT /reservas-venda/retirar` | Assíncrono, executado pelo receiver da fila |
| 4 | Integração → Só Estoque | HTTPS/JSON `POST` no webhook (`API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL`). Envia `Authorization: Bearer API_SO_ESTOQUE_ACCESS_TOKEN` e `Idempotency-Key` = `operationId` da operação de origem. | Um evento por operação: `reservation.create`, `reservation.customer`, `reservation.cancel` ou `reservation.withdraw`, com `success` e a reserva ou o erro | Assíncrono (operação `RESERVATION_NOTIFY`) |
| 5 | `api-locavia-web-ts` → SQL Server | TypeORM em transação | Tabelas `ReservasVenda`, `Clientes`/`Pessoas`, `Veiculos` e `VendasVeiculos` | Síncrono |
| 6 | Telas do Locavia Web → `api-locavia-web-ts` | Sessão do usuário | `PUT /reservas-venda/finalizar` quando a venda do veículo reservado é concluída (reserva `F`) | Síncrono |

**Regras de erro por canal:**

- **Só Estoque → integração:**
  - `400` para body inválido.
  - `401` para token ausente ou inválido.
  - `404` para recurso inexistente.
  - `422` para regra de negócio. Nesse caso nada é gravado nem enfileirado.
  - `503` quando o banco do Locavia está indisponível.
- **Integração → Locavia:**
  - `4xx` é **terminal**: a operação vai para `ERROR`, a mensagem sai da fila e a Só Estoque recebe o erro final.
  - `5xx`, timeout ou ausência de resposta é **transitório**: o SQS entrega a mensagem de novo, até `maxReceiveCount = 3`, e depois a move para a DLQ.
- **Integração → Só Estoque:**
  - `4xx` é recusa terminal.
  - `5xx` ou timeout gera nova entrega.
  - O resultado de cada tentativa fica na timeline da operação de origem.

---

## 4. Contêineres e infraestrutura

### 4.1 `api-locaviaweb-car-inventory`

| Contêiner | Tecnologia | Papel |
| --- | --- | --- |
| API HTTP | NestJS no AWS EKS, credenciais AWS por IRSA | Rotas `/car-inventory/v1`, guard JWT, `ValidationPipe`, pré-validação das regras e publicação na fila |
| Receiver de reservas | Mesmo processo; long polling, até 5 mensagens em paralelo, visibilidade de 60 s | `ProcessReservationUsecase`: aplica no Locavia, atualiza a cópia, audita e notifica |
| SQS FIFO | `locaviaweb-car-inventory-process-reservation.fifo` + DLQ FIFO | A mensagem leva só o ponteiro `{ operationId, type }`. <br>`MessageGroupId` = veículo, para manter a ordem das operações do mesmo veículo; a notificação usa `notify-<externalReference>`. <br>Deduplicação por conteúdo. |
| DynamoDB | `car-inventory-async-operations` | `AsyncOperation`. Chave `operationId`. <br>GSIs `idempotencyKey-index` e `externalCode-index` (SK `createdAt`). TTL opcional em `expiresAt`. |
| DynamoDB | `car-inventory-reservations` | Cópia da `ReservasVenda` com `history[]`. Chave `reservationId` = `CodigoReserva`. <br>GSIs `vehicleId-index` e `organizationId-index` (SK `reservedAt`) e `externalReference-index`. |
| Redis (opcional) | Cache HTTP | Sem `REDIS_HOST`, o cache fica em memória |

Nos ambientes AWS o nome das tabelas recebe `DYNAMODB_TABLE_PREFIX`. Em ambiente local, SQS e DynamoDB rodam no LocalStack (`scripts/localstack/init-aws.sh`).

### 4.2 Locavia Web

| Contêiner | Papel na integração |
| --- | --- |
| `api-locavia-web-ts` | `/sessoes`, `/clientes` e `/reservas-venda` (criar, alterar cliente, consultar, cancelar, retirar e finalizar) |
| Telas do Locavia Web | Venda do veículo; a conclusão finaliza a reserva |
| SQL Server LocaviaWeb | Migrations `CriacaoCampoLojistaTabelaClientes` e `CriacaoTabelaReservasVenda` |

---

## 5. Componentes

### 5.1 Integração (`api-locaviaweb-car-inventory`)

**Leitura:**

- Os controllers `Companies`, `Vehicles`, `Sales` e `ServiceOrders` chamam os use cases `Find*`/`Get*`.
- Os use cases usam os repositórios TypeORM `Locavia*Repository`, sempre com `NOLOCK`.
- Os mappers convertem o resultado para o contrato da Só Estoque.
- `LocaviaOrganizationService` resolve o `CodigoOrganizacao` a partir do CNPJ do ENV e transforma banco offline em `503`.

**Escrita, na requisição:**

- `ReservationsController` chama os use cases `Request*ReservationUseCase`, que herdam de `BaseRequestOperationUseCase`.
- A base resolve a idempotência, chama `prepare()` e grava a `AsyncOperation` com `REQUESTED`.
- `SqsPublisherService` publica a mensagem e a timeline recebe `QUEUED`.
- `ReservationRulesService` antecipa as regras do Locavia e responde `422` na hora.

**Escrita, no receiver:**

- `ProcessReservationUsecase` aplica a operação:
  - `ReservationWriter` coordena a escrita.
  - `LocaviaCustomerWriter` busca o cliente pelo documento ou o cadastra como lojista.
  - `ReservationLocaviaSync` registra `LOCAVIA_REQUEST`/`SUCCESS`/`ERROR` e `COPY_UPDATED`.
  - `LocaviaSaleReservationGateway` chama o Locavia por `LocaviaWebHttpService` e `LocaviaWebAuthService`.
- `ReservationNotifier` e `SoEstoqueHttpService` entregam o webhook.
- `OperationAuditService` e `AsyncOperationErrorService` registram a timeline e classificam os erros.

**Status:** `GET /{módulo}/operations/{operationId}` usa `BaseOperationStatusUseCase`. Cada módulo responde só pelos tipos de operação que são dele; os demais recebem `404`.

### 5.2 Locavia (`api-locavia-web-ts`)

**`ReservaVendaRegrasService`:**

- O veículo deve estar com status `8` (à venda) ou `13` (perda total), não alienado e sem venda em aberto.
- Cada veículo tem no máximo uma reserva `A` ou `F`.
- A expiração é preguiçosa: uma reserva `A` vencida passa para `E` quando o veículo é reservado de novo.
- O cliente não pode estar bloqueado.

**Use cases de `/reservas-venda`:**

- `Create`, `Update`, `Get`, `Encerrar` (cancelar ou retirar) e `Finalizar`.
- Todos rodam em transação.
- São idempotentes: a mesma `ReferenciaExterna`, ou a mesma situação final, devolve a reserva sem alterar nada.

**`CreateCliente`:** cria a pessoa, ou reaproveita a que já tem o documento, com `Lojista = 'S'`.

---

## 6. Fluxos

### 6.1 Leitura

1. A Só Estoque chama um endpoint de leitura com `x-api-key`.
2. A integração consulta o SQL Server do Locavia e responde no contrato.

Nada é gravado. `GET /vehicles?updatedSince=` permite a sincronização incremental, usando `ModificadoEm` e, na falta dele, `InseridoEm`.

### 6.2 Operação de reserva (5 passos)

Consulte `05-mvp-final-fluxo-reserva.drawio`.

1. **Só Estoque requisita** `POST /reservations`, `PUT /reservations/{id}/customer`, `POST /reservations/{id}/cancellation` ou `POST /reservations/{id}/withdrawal`.
2. **A integração registra e enfileira.**
   - Se a requisição for duplicada, devolve a mesma operação com `duplicated: true`.
   - Senão, valida (`400`/`404`/`422`), cria a `AsyncOperation` em `PENDING` com `REQUESTED`, publica na fila (`QUEUED`) e responde o `operationId`.
3. **O receiver processa.**
   - Toma a operação com compare-and-set: `PROCESSING`, `attempts + 1`.
   - Resolve o cliente (`CUSTOMER_RESOLVED`), se houver.
   - Chama o Locavia (`LOCAVIA_REQUEST`).
4. **Audita e copia.**
   - Na resposta `2xx`, registra `LOCAVIA_SUCCESS` com status e corpo, atualiza a cópia e o `history[]` (`COPY_UPDATED`) e finaliza (`FINISHED`, com `result`).
   - No erro, registra `LOCAVIA_ERROR` e `FAILED`, e acrescenta o erro a `lastError` e `errorHistory`.
5. **Notifica a Só Estoque.**
   - Cria a operação `RESERVATION_NOTIFY` (chave `<operationId>-notify`) e registra `SO_ESTOQUE_NOTIFICATION_QUEUED`.
   - O receiver entrega o webhook (`SO_ESTOQUE_NOTIFIED`, ou `SO_ESTOQUE_NOTIFICATION_ERROR` por tentativa).
   - O erro final também é notificado, com `success: false`.

A Só Estoque pode consultar `GET /reservations/operations/{operationId}` a qualquer momento: status, `result`, `lastError` traduzido e `timeline`.

### 6.3 Estados da reserva

| API (`status`) | Locavia (`ReservasVenda.Situacao`) | Como chega |
| --- | --- | --- |
| `ACTIVE` | `A` | `POST /reservations` |
| `CANCELED` | `C` | `POST /reservations/{id}/cancellation` (com motivo) |
| `WITHDRAWN` | `R` | `POST /reservations/{id}/withdrawal` (com motivo) |
| `EXPIRED` | `E` | Na API, é calculado na leitura: `ACTIVE` com `expiresAt` vencido. No Locavia, a reserva só passa para `E` quando o veículo é reservado de novo. |
| `COMPLETED` | `F` | Conclusão da venda no Locavia (`/reservas-venda/finalizar`). A cópia no DynamoDB ainda não acompanha esse estado; consulte a seção 9. |

As reservas `A` (não vencida) e `F` bloqueiam o veículo. As reservas `C`, `R` e `E` liberam o veículo.

### 6.4 Idempotência

| Operação | Chave (`idempotencyKey`) |
| --- | --- |
| Criar reserva | `externalReference` da Só Estoque. No Locavia, `ReferenciaExterna` é única por organização. |
| Trocar cliente | Header `x-idempotency-key`. Sem ele, um UUID novo. |
| Cancelar | `reservation-<id>-cancel` |
| Retirar | `reservation-<id>-withdraw` |
| Notificar | `<operationId>-notify` |

O header `x-idempotency-key` substitui a chave natural quando é enviado. Uma operação em `ERROR` não bloqueia uma nova tentativa com a mesma chave.

### 6.5 Datas

As datas da reserva (`reservedAt`, `expiresAt`, `paymentDate`, `canceledAt`, `withdrawnAt`) são a **hora do banco do Locavia rotulada como UTC (`…Z`)**, sem conversão de fuso. "Agora" é o `GETDATE()` do banco.

Os campos `createdAt`, `updatedAt` e a timeline usam o relógio da integração.

Valores padrão de `expiresAt`:

- Sem `expiresAt`, a reserva expira 72 h depois da criação.
- O máximo permitido é 30 dias.

---

## 7. Catálogo de endpoints

### 7.1 `api-locaviaweb-car-inventory` (`/car-inventory/v1`)

| Método e rota | Descrição |
| --- | --- |
| `GET /health` | Saúde da API (pública) |
| `POST /auth/token` | Token do cliente de integração (pública) |
| `GET /companies`, `GET /companies/{id}` | Locadoras da organização |
| `GET /vehicles` | Veículos. Filtros: `companyId`, `status` (lista separada por vírgula), `reserved`, `licensePlate`, `brandId`, `modelId`, `updatedSince` e paginação |
| `GET /vehicles/{id}`, `GET /vehicles/{id}/movements` | Detalhe e movimentações (mais recente primeiro) |
| `GET /sales`, `GET /sales/{id}` | Vendas. Filtros: `companyId`, `vehicleId`, `status`, `saleDateFrom` e `saleDateTo` |
| `GET /service-orders`, `GET /service-orders/{id}` | OS com itens. Filtros: `companyId`, `vehicleId` e `status` |
| `GET /reservations`, `GET /reservations/{id}` | Reservas (cópia da integração). Filtros: `companyId`, `vehicleId`, `status` e `externalReference` |
| `POST /reservations` | Reservar (assíncrono) |
| `PUT /reservations/{id}/customer` | Informar ou trocar o cliente (assíncrono) |
| `POST /reservations/{id}/cancellation` | Cancelar (assíncrono) |
| `POST /reservations/{id}/withdrawal` | Retirar (assíncrono) |
| `GET /{reservations\|vehicles\|sales\|service-orders}/operations/{operationId}` | Status da operação assíncrona do módulo |

### 7.2 `api-locavia-web-ts` usado pela integração

| Método e rota | Uso |
| --- | --- |
| `POST /sessoes` | Login do usuário de integração |
| `POST /clientes` | Cadastro do cliente novo como lojista (`Lojista = 'S'`) |
| `POST /reservas-venda` | Inclusão (`A`), idempotente por `ReferenciaExterna` |
| `PUT /reservas-venda` | Troca do cliente de uma reserva ativa |
| `PUT /reservas-venda/cancelar` | Cancelamento (`C`) |
| `PUT /reservas-venda/retirar` | Retirada (`R`) |
| `GET /reservas-venda` | Consulta (não usada pela integração; existe para suporte) |
| `PUT /reservas-venda/finalizar` | Finalização pela venda (`F`), chamada pelo Locavia, não pela integração |

---

## 8. Dados

### 8.1 DynamoDB

**`car-inventory-async-operations`**

| Atributo | Conteúdo |
| --- | --- |
| `operationId` | Chave |
| `type` | `RESERVATION_CREATE`, `RESERVATION_SAVE_CUSTOMER`, `RESERVATION_CANCEL`, `RESERVATION_WITHDRAW` ou `RESERVATION_NOTIFY` |
| `status` | `PENDING`, `PROCESSING`, `FINISHED` ou `ERROR` |
| `idempotencyKey` | Chave de idempotência (GSI) |
| `externalCode` | Referência da Só Estoque (GSI) |
| `attempts` / `maxAttempts` | Execuções feitas e limite |
| `inputData` | Payload recebido |
| `result` | `reservationId`, `locaviaSituation`, `customerId`, `notificationOperationId` e outros |
| `lastError` / `errorHistory` | Último erro e histórico de erros |
| `timeline[]` | Um registro por passo, com `step`, `at`, `attempt` e `detail` |

**`car-inventory-reservations`**

| Atributo | Conteúdo |
| --- | --- |
| `reservationId` | Chave: `CodigoReserva` |
| `externalReference`, `vehicleId`, `companyId`, `organizationId` | Identificação da reserva |
| `status` / `locaviaSituation` | Status da API e última `Situacao` respondida pelo Locavia |
| `reservedAt`, `expiresAt`, `agreedPrice`, `paymentDate` | Dados da reserva |
| `customer` / `customerId` | Cliente enviado pela Só Estoque e `CodigoCliente` |
| `cancellation`, `withdrawal`, `saleId`, `completedAt` | Encerramento |
| `history[]` | Por operação aplicada: o payload recebido, a chamada ao Locavia, a resposta, os erros anteriores e o status antes e depois |

### 8.2 Locavia (novos objetos)

**`ReservasVenda`:**

- **Colunas:** `CodigoReserva` (identity), `CodigoVeiculo`, `CodigoEmpresa`, `CodigoCliente`, `ReferenciaExterna`, `DataReserva`, `DataExpiracao`, `ValorReserva`, `DataPagamento`, `Situacao` (`A`/`F`/`R`/`C`/`E`), `Motivo`, `DataHoraSituacao`, `CodigoVenda`, `CodigoOrganizacao` e as colunas de auditoria `InseridoPor`/`Em` e `ModificadoPor`/`Em`.
- **Índices:** `IX_ReservasVenda_CodigoVeiculo_Situacao` e o índice único filtrado `UX_ReservasVenda_CodigoOrganizacao_ReferenciaExterna`.

**`Clientes.Lojista`:** `CHAR(1)`, padrão `'N'`, aceita `'S'` ou `'N'`.

---

## 9. Limitações conhecidas e próximos passos

| Item | Situação |
| --- | --- |
| Escrita de vendas | Design aprovado em `03-sales` (orquestrador `/vendas-veiculos/integracao`, fila `process-sale`, cópia `car-inventory-sales`). Não implementado. |
| Reserva finalizada pela venda (`F`) | O Locavia finaliza a reserva quando a venda é concluída na tela, mas a cópia no DynamoDB continua `ACTIVE` até a escrita de vendas existir. `GET /reservations/{id}` não mostra `COMPLETED` nesse caso. |
| Reserva expirada (`E`) | A API mostra `EXPIRED` na leitura. A cópia no DynamoDB mantém `status = ACTIVE` e `locaviaSituation = A`, e o Locavia só grava `E` quando o veículo é reservado de novo. Essa diferença é esperada. |
| Webhook da Só Estoque | Contrato provisório (POST JSON + Bearer + `Idempotency-Key`) até a plataforma publicar o dela |
| Utilização da frota (campos 40 a 42) | Adiada. Falta definir como calcular o percentual. |
| Baixa de veículos | Adiada para uma fase posterior |
