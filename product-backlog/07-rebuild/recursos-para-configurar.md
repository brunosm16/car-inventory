# Recursos para configurar — integração Só Estoque

Recursos de cada ambiente para o fluxo api-locavia-web-ts ↔ api-locaviaweb-car-inventory.

## Filas SQS

Filas Standard, cada uma com sua própria DLQ `<fila>-dlq`.

1. `locaviaweb-integracao-desmobilizacao-so-estoque` → api-locavia-web-ts publica / api-locaviaweb-car-inventory consome
2. `locaviaweb-integracao-reserva-so-estoque` → api-locaviaweb-car-inventory publica / api-locavia-web-ts consome
3. `locaviaweb-integracao-reserva-so-estoque-retorno` → api-locavia-web-ts publica / api-locaviaweb-car-inventory consome
4. `locaviaweb-integracao-pagamento-so-estoque` → api-locaviaweb-car-inventory publica / api-locavia-web-ts consome
5. `locaviaweb-integracao-pagamento-so-estoque-retorno` → api-locavia-web-ts publica / api-locaviaweb-car-inventory consome

## Tabelas DynamoDB

6. `car-inventory-async-operations` → api-locaviaweb-car-inventory
   - Chave `operationId` (S).
   - Índices `idempotencyKey-index` e `externalCode-index`, ambos com SK `createdAt` (S).
   - `vehicleId-index`: `vehicleId` (N) + `createdAt` (S).
   - `organizationId-index`: `organizationId` (S) + `createdAt` (S).
   - `status-nextAttemptAt-index`: `status` (S) + `nextAttemptAt` (S). É um índice esparso: só entram as operações aguardando nova tentativa.
   - TTL ligado em `expiresAt`. A operação expira 180 dias depois de encerrada (`FINISHED`, `ERROR` ou `CANCELED`).
7. `car-inventory-vehicles` (índice `plate-index`) → api-locaviaweb-car-inventory
8. `car-inventory-reservations` (índice `vehicleId-index`) → api-locaviaweb-car-inventory
9. `car-inventory-payments` (índice `vehicleId-index`) → api-locaviaweb-car-inventory

## Variáveis de pipeline

14. `Sqs_Vehicle_Demobilization_Url` e `Sqs_Vehicle_Demobilization_Dlq_Url` → api-locaviaweb-car-inventory
15. `Sqs_Reservation_Url`, `Sqs_Reservation_Result_Url` e `Sqs_Reservation_Result_Dlq_Url` → api-locaviaweb-car-inventory
16. `Sqs_Payment_Url`, `Sqs_Payment_Result_Url` e `Sqs_Payment_Result_Dlq_Url` → api-locaviaweb-car-inventory
17. `Api_So_Estoque_Vehicle_Webhook_Url`, `Api_So_Estoque_Reservation_Webhook_Url`, `Api_So_Estoque_Payment_Webhook_Url` e `Api_So_Estoque_Access_Token` → api-locaviaweb-car-inventory
18. `Dynamodb_Table_Prefix` e `Aws_Region` → api-locaviaweb-car-inventory
19. `AWS_REGION` e `AWS_SQS_BASE_URL` (URL base da conta SQS) → api-locavia-web-ts. Estas variáveis não estão no `secrets.yml` e precisam vir do ambiente. Os nomes das 5 filas já estão como literais no `secrets.yml`.

## Permissões IAM

20. SQS: publicar em 1, 3 e 5; consumir e apagar em 2 e 4; `GetQueueUrl`, `GetQueueAttributes` e `CreateQueue` para o provisionamento no boot → api-locavia-web-ts
21. SQS: publicar em 2 e 4; consumir e apagar em 1, 3 e 5; publicar nas DLQs de 1, 3 e 5; `GetQueueAttributes` em 1 a 5 e nas DLQs, usado pelo `GET /healthcheck` → api-locaviaweb-car-inventory
22. DynamoDB: leitura e escrita nas tabelas 6 a 9 e nos índices delas → api-locaviaweb-car-inventory

## Banco do Locavia (cada ambiente)

23. Migrations `CriacaoCampoLojistaTabelaClientes`, `CriacaoTabelaReservasVeiculo`, `CriarUsuarioIntegracaoCarInventoryNasOrganizacoes` (usuário `INTEGRACAO_CAR_INV`) e `CriacaoTabelaPagamentosReservaVeiculo` → api-locavia-web-ts
