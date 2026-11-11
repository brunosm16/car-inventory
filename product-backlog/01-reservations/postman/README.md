# 01-reservations — Collections Postman

| Arquivo | O que valida |
| --- | --- |
| `01-reservations-car-inventory.postman_collection.json` | Fluxo completo pela integração: token, reservar, acompanhar a operação, ler a reserva, informar o cliente (lojista), cancelar, retirar e validações (404, 400, 422, 401). |
| `01-reservations-api-locavia-web-ts.postman_collection.json` | Endpoints `/reservas-venda` do Locavia: sessão, cliente lojista, inclusão idempotente, consulta, alteração, cancelamento, retirada e finalização. |
| `01-reservations.postman_environment.json` | Variáveis do ambiente local. Preencha as credenciais e um `vehicleId` com status "À venda" (8) ou "Perda total" (13). |

## Como executar

1. Importe as duas collections e o ambiente no Postman e selecione o ambiente `01-reservations - local`.
2. Preencha as variáveis:
   - `clientId` e `clientSecret`: credenciais da integração.
   - `locaviaLogin`, `locaviaSenha` e `locaviaOrganizacao`: usuário de integração do Locavia.
   - `vehicleId`: um veículo à venda sem reserva ativa.
3. Rode a collection da integração no **Collection Runner**, na ordem. Ela usa o veículo de `vehicleId`:
   - O passo `00` grava o token.
   - Cada reserva usa uma `externalReference` nova (`SE-RES-<timestamp>`).
   - Os passos de status consultam a operação até ela sair de `PENDING`/`PROCESSING` (até 10 tentativas), porque as escritas são assíncronas.
   - O fluxo `01` termina com a reserva cancelada e o fluxo `02` com a reserva retirada. O veículo fica liberado nos dois casos.
   - Os passos de status também conferem a auditoria (`timeline`):
     - Passo 3: `PROCESSING` e `LOCAVIA_REQUEST`.
     - Passo 4: `LOCAVIA_SUCCESS` com status 2xx e `COPY_UPDATED`.
     - Enfileiramento do passo 5: `SO_ESTOQUE_NOTIFICATION_QUEUED`.
   - Os passos `02b`, `09b` e `04b` acompanham a operação de notificação (`RESERVATION_NOTIFY`) até `SO_ESTOQUE_NOTIFIED`. Para isso, a integração precisa ter `API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL` configurada. Sem ela, a notificação fica em reprocessamento e esses passos falham.
4. A collection do Locavia testa os endpoints diretamente:
   - O passo `13 - Finalizar` exige uma reserva ativa e uma venda do mesmo veículo. Preencha `codigoReservaFinalizar` e `codigoVenda`.

> As datas (`expiresAt`, `dataExpiracao`) são a hora do banco do Locavia no formato UTC (`...Z`), sem conversão de fuso.
