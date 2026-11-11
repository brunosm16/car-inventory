# 05 · MVP final: roteiro de validação

Este roteiro valida todos os fluxos do MVP de ponta a ponta. Ele tem três partes:

1. **Collection** `docs/car-inventory-mvp.postman_collection.json`, no repositório `api-locaviaweb-car-inventory`. Segue o padrão das collections da Asaas: 10 pastas, 79 requisições e variáveis já preenchidas com a massa do LocaviaWeb_Debug. Importa no Postman e no Bruno.
2. **Queries no banco do Locavia (SQL Server):** confirmam que cada operação chegou a `api-locavia-web-ts`.
3. **Queries no DynamoDB (PartiQL e AWS CLI):** confirmam a operação, a auditoria (`timeline`) e a cópia da reserva.

A ordem abaixo é a da collection. Rode uma pasta e, ao final dela, execute as queries da seção correspondente.

A arquitetura está em [`05-mvp-final-arquitetura.md`](05-mvp-final-arquitetura.md).

---

## 0. Preparação

### 0.1 Pré-requisitos

| Item | Como conferir |
| --- | --- |
| `api-locaviaweb-car-inventory` no ar | `GET /car-inventory/v1/health` (porta do `.env`, padrão `3001`) |
| SQS e DynamoDB | LocalStack (`docker compose up` + `scripts/localstack/init-aws.sh`) ou a conta AWS do ambiente |
| Banco do Locavia acessível pela integração | `TYPEORM_*` preenchidas. Sem banco, as leituras respondem `503`. |
| `api-locavia-web-ts` no ar, com as migrations `CriacaoCampoLojistaTabelaClientes` e `CriacaoTabelaReservasVenda` aplicadas | `API_LOCAVIA_WEB_URL`, `LOCAVIA_WEB_LOGIN`, `LOCAVIA_WEB_PASSWORD` e `LOCAVIA_WEB_ORGANIZATION` preenchidas |
| Webhook da Só Estoque (opcional) | `API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL`. Para testes, use um receptor que responda `2xx`. Sem ele, os passos de notificação ficam em reprocessamento e falham. |

### 0.2 Massa da collection (LocaviaWeb_Debug, 11/11/2026)

As variáveis da collection já vêm preenchidas:

| Variável | Valor | O que é |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3001/car-inventory/v1` | API local |
| `clientId` / `clientSecret` | do `.env` local | Cliente de integração |
| `codigoEmpresa` | `1` | Empresa 1, organização 1 (CNPJ 07777542000114) |
| `veiculoReservaCliente` | `18270` | ZZY2551, à venda e livre (pasta 5) |
| `veiculoReservaSemCliente` | `18194` | BAC1P71, à venda e livre (pasta 6) |
| `veiculoExpiracao` | `17575` | TST2264, à venda e livre (pasta 7) |
| `veiculoNaoVendavel` | `18405` | QOH9X08, status 1 (alugado) |
| `veiculoAlienado` | `2500` | IMP0002, à venda e alienado |
| `veiculoVendaAberta` | `17166` | IMO3008, venda 1343 em aberto |
| `cpfClienteExistente` | `09989383944` | Cliente 67313 (Gabriel Antonin) |
| `cpfLojistaNovo` | `48173920532` | Não existia: vira lojista na primeira execução |
| `cpfClienteBloqueado` | `33803852048` | Cliente 67222, situação B |
| `cpfNomeLongo` | `62738491022` | Não existe; recusado antes do cadastro |
| `codigoVenda` | `1391` | Venda cancelada do veículo 16632 |
| `codigoOrdemServico` | `61108` | OS 952, concluída, veículo 18302 |

Se algum veículo deixar de estar livre, troque-o por outro da query 0.4.3.

### 0.3 Como executar

1. Importe `docs/car-inventory-mvp.postman_collection.json` no Bruno (*Import Collection → Postman Collection*) ou no Postman.
2. Rode `0 - Preparação / Token` e depois as pastas na ordem, requisição a requisição ou no Runner. Cada "consultar operação" espera 3 s antes de chamar. "Consultar reserva vencida" espera 60 s.
3. As pastas 5, 6 e 7 usam veículos diferentes e terminam com o veículo liberado, então podem ser repetidas.
4. Ao final de cada pasta, rode as queries da seção correspondente. Os valores gerados aparecem nas variáveis da collection:
   - Referências: `externalReferenceCliente`, `externalReferenceSemCliente`, `externalReferenceExpiracao`, `externalReferenceExpiracao2`.
   - Operações: `operationId`, `notificationOperationId`.
   - Reservas: `reservationId`, `reservationIdSemCliente`, `reservationIdExpirada`, `reservationIdExpiracao2`.
   - Cliente: `codigoClienteLojista`.

Nas queries abaixo, `<externalReference>` e `<reservationId>` são os valores da pasta em questão, e `@CodigoVeiculo` é o veículo dela (18270, 18194 ou 17575). Na seção 6, o cliente da reserva é o `09989383944` (já existente, `Lojista` mantido como está) e o lojista novo é o `48173920532`.

### 0.4 Queries de apoio no Locavia

Todas as queries são somente leitura e usam `WITH (NOLOCK)`, como a integração. Troque os valores de exemplo do `DECLARE` antes de rodar.

**0.4.1 Hora do banco.** É o relógio das datas da reserva, que a API devolve com `Z`.

```sql
SELECT GETDATE() AS HoraBanco;
```

**0.4.2 Organização da integração**, a partir do CNPJ de `LOCAVIA_WEB_ORGANIZATION`, e o usuário de integração (`LOCAVIA_WEB_LOGIN`).

```sql
DECLARE @Cnpj VARCHAR(14) = '00000000000000';
DECLARE @Login VARCHAR(100) = 'integracao.soestoque';

SELECT o.CodigoOrganizacao, p.RazaoSocial
FROM Organizacoes o WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = o.CodigoPessoa
WHERE p.CNPJ = @Cnpj;

SELECT u.CodigoUsuario, u.Login
FROM Usuarios u WITH (NOLOCK)
WHERE u.Login = @Login;
```

**0.4.3 Veículo de teste (`vehicleId`).** O veículo precisa atender a todas as condições:

- Status 8 (à venda) ou 13 (perda total).
- Não alienado.
- Fora de grupo de contrato.
- Sem venda em aberto.
- Sem reserva `A` vigente ou `F`.

```sql
DECLARE @CodigoOrganizacao BIGINT = 1;

SELECT TOP 20 v.CodigoVeiculo, v.Placa, v.CodigoEmpresa, v.CodigoStatus
FROM Veiculos v WITH (NOLOCK)
WHERE v.CodigoOrganizacao = @CodigoOrganizacao
  AND v.CodigoStatus IN (8, 13)
  AND ISNULL(v.CodigoSituacaoProprietario, 0) <> 2
  AND v.CodigoGrupoContratoReservado IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM VendasVeiculosPlacas vp WITH (NOLOCK)
      INNER JOIN VendasVeiculos vv WITH (NOLOCK) ON vv.CodigoVenda = vp.CodigoVenda
      WHERE vp.CodigoVeiculo = v.CodigoVeiculo
        AND vv.Situacao <> 'C'
        AND vv.DevolucaoVenda = 'N')
  AND NOT EXISTS (
      SELECT 1
      FROM ReservasVenda r WITH (NOLOCK)
      WHERE r.CodigoVeiculo = v.CodigoVeiculo
        AND (r.Situacao = 'F'
             OR (r.Situacao = 'A' AND (r.DataExpiracao IS NULL OR r.DataExpiracao > GETDATE()))))
ORDER BY v.CodigoVeiculo DESC;
```

**0.5 Massa opcional da pasta 09** (casos de recusa).

```sql
DECLARE @CodigoOrganizacao BIGINT = 1;

-- notSellableVehicleId: status diferente de 8 e 13
SELECT TOP 5 CodigoVeiculo, Placa, CodigoStatus
FROM Veiculos WITH (NOLOCK)
WHERE CodigoOrganizacao = @CodigoOrganizacao AND CodigoStatus NOT IN (8, 13);

-- alienatedVehicleId: vendável e alienado
SELECT TOP 5 CodigoVeiculo, Placa, CodigoStatus
FROM Veiculos WITH (NOLOCK)
WHERE CodigoOrganizacao = @CodigoOrganizacao
  AND CodigoStatus IN (8, 13)
  AND CodigoSituacaoProprietario = 2;

-- openSaleVehicleId: vendável com venda não cancelada e sem devolução
SELECT TOP 5 v.CodigoVeiculo, v.Placa, vv.CodigoVenda, vv.Situacao
FROM Veiculos v WITH (NOLOCK)
INNER JOIN VendasVeiculosPlacas vp WITH (NOLOCK) ON vp.CodigoVeiculo = v.CodigoVeiculo
INNER JOIN VendasVeiculos vv WITH (NOLOCK) ON vv.CodigoVenda = vp.CodigoVenda
WHERE v.CodigoOrganizacao = @CodigoOrganizacao
  AND v.CodigoStatus IN (8, 13)
  AND vv.Situacao <> 'C'
  AND vv.DevolucaoVenda = 'N';

-- blockedCustomerDocument: CPF de cliente bloqueado
SELECT TOP 5 c.CodigoCliente, p.CPF, p.RazaoSocial
FROM Clientes c WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = c.CodigoPessoa
WHERE c.CodigoOrganizacao = @CodigoOrganizacao
  AND c.Situacao = 'B'
  AND p.TipoPessoa = 'F'
  AND p.CPF IS NOT NULL;
```

### 0.6 Como rodar as queries do DynamoDB

As tabelas são `car-inventory-async-operations` e `car-inventory-reservations`. Nos ambientes AWS, os nomes recebem o prefixo `DYNAMODB_TABLE_PREFIX`.

As queries PartiQL deste roteiro funcionam no **PartiQL editor** do console do DynamoDB e na AWS CLI. Os nomes de atributo vão entre aspas duplas, porque `status`, `type` e `result` são palavras reservadas.

```bash
# LocalStack (endpoint de AWS_ENDPOINT no .env)
export DDB="--endpoint-url http://localhost:4567 --region us-east-1"

aws dynamodb list-tables $DDB

# modelo para qualquer query PartiQL do roteiro
aws dynamodb execute-statement $DDB \
  --statement "SELECT * FROM \"car-inventory-async-operations\" WHERE \"operationId\" = '<operationId>'"
```

No PowerShell, troque `export DDB=...` por `$DDB = @('--endpoint-url','http://localhost:4567','--region','us-east-1')` e use `aws dynamodb execute-statement @DDB --statement '...'`. Nos ambientes AWS, retire `--endpoint-url` e use o perfil da conta.

A saída vem em DynamoDB JSON (`{"S": ...}`, `{"N": ...}`). Para ler a `timeline` com facilidade, use o `GET /reservations/operations/{operationId}` da API. Ela devolve o mesmo conteúdo em JSON simples.

### 0.7 Conferência pelas APIs (sem SQL)

As queries SQL deste roteiro continuam valendo, mas a collection já faz as mesmas conferências por API.

**Locavia:** `GET {{locaviaUrl}}/reservas-venda/consulta`, autenticado com o token de `POST /sessoes`.

- **Filtros:** `CodigoReserva`, `ReferenciaExterna`, `CodigoVeiculo` ou `CodigoCliente`. Pelo menos um é obrigatório; sem nenhum, a resposta é `400`.
- **Resposta:** as reservas da organização, mais recentes primeiro, com:
  - `Veiculo`: `CodigoVeiculo` e `Placa`.
  - `Cliente`: `CodigoCliente`, `Situacao` e `Lojista`.
  - `Cliente.Pessoa`: `TipoPessoa`, `CPF`, `CNPJ` e `RazaoSocial`.

As requisições `Locavia - ...` das pastas 5, 6 e 7 conferem:

| O quê | Como |
| --- | --- |
| Reserva criada | `Situacao = A` |
| Cliente novo | Cadastrado com `Lojista = S` |
| Cancelamento | `C` com `Motivo` |
| Retirada | `R` |
| Expiração | A reserva vencida passa a `E` quando o veículo é reservado de novo |

**Só Estoque (mock):** o serviço `so-estoque-mock` do `docker-compose` é um json-server na porta 3020.

- Para subir: `docker compose up -d so-estoque-mock`.
- Configure `API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL=http://localhost:3020/reservation-notifications` e reinicie a API.
- Cada notificação recebida pode ser consultada em `GET http://localhost:3020/reservation-notifications?externalReference=<referência>`.
- As requisições `So Estoque (mock) - ...` conferem os eventos `reservation.create`, `reservation.customer`, `reservation.cancel` e `reservation.withdraw`.
- Os dados do mock são apagados quando o contêiner reinicia.

O serviço `api` do `docker-compose` só sobe com `--profile api`. Ele consome as mesmas filas do LocalStack, então **nunca** rode o contêiner e o `npm run dev` ao mesmo tempo.

---

## 1. Pasta 00: saúde e autenticação

A pasta não grava nada. Confira os resultados dos passos:

| Passo | Resultado esperado |
| --- | --- |
| 01 | `200` |
| 02 | `401` (credencial inválida) |
| 03 | `200`; grava `carInventoryToken` |
| 04 | `401` (sem token) |
| 05 | `401` (token inválido) |

Não há query de banco nesta pasta.

---

## 2. Pasta 01: empresas

O resultado de `GET /companies` deve bater com a query abaixo: mesmas empresas, CNPJ, razão social e situação.

```sql
DECLARE @CodigoOrganizacao BIGINT = 1;

SELECT e.CodigoEmpresa, p.CNPJ, p.RazaoSocial, p.NomeFantasia, e.Ativa
FROM Empresas e WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = e.CodigoPessoa
WHERE e.CodigoOrganizacao = @CodigoOrganizacao
ORDER BY e.CodigoEmpresa;
```

---

## 3. Pasta 02: veículos

**3.1 Detalhe do veículo de teste.** Compare com `GET /vehicles/{vehicleId}`:

| Campo da API | Coluna |
| --- | --- |
| `licensePlate` | `Placa` |
| `chassis` | `Chassi` |
| `renavam` | `Renavam` |
| `odometer` | `Hodometro` |
| `brand` / `model` | Marca e modelo |
| `fipeCode` | `CodigoFipe` |
| `status` | `CodigoStatus` |
| `alienated` | `CodigoSituacaoProprietario = 2` |
| `purchase.*` | Colunas de compra |
| `sale.*` | Colunas de venda prevista |

```sql
DECLARE @CodigoVeiculo BIGINT = 18270;

SELECT v.CodigoVeiculo, v.CodigoEmpresa, v.Placa, v.Chassi, v.Renavam, v.Hodometro,
       v.AnoFabricacaoModelo, v.NumeroPortas, v.CodigoStatus, v.CodigoSituacaoProprietario,
       v.CodigoGrupoContratoReservado, ma.Descricao AS Marca, mo.Descricao AS Modelo,
       mo.CodigoFipe, co.Descricao AS Cor, pa.Descricao AS Patio,
       v.DataCompra, v.NumeroNFCompra, v.ValorCompra,
       v.DataPrevistoVenda, v.ValorPrevistoVenda, v.DataEntradaVenda,
       ISNULL(v.ModificadoEm, v.InseridoEm) AS AtualizadoEm
FROM Veiculos v WITH (NOLOCK)
LEFT JOIN VeiculosModelos mo WITH (NOLOCK) ON mo.CodigoModelo = v.CodigoModelo
LEFT JOIN VeiculosMarcas ma WITH (NOLOCK) ON ma.CodigoMarca = mo.CodigoMarca
LEFT JOIN VeiculosCores co WITH (NOLOCK) ON co.CodigoCor = v.CodigoCor
LEFT JOIN Patios pa WITH (NOLOCK) ON pa.CodigoPatio = v.CodigoPatio
WHERE v.CodigoVeiculo = @CodigoVeiculo;
```

**3.2 Quantidade de vendáveis da empresa.** Deve bater com `meta.total` do passo 02.

```sql
DECLARE @CodigoOrganizacao BIGINT = 1, @CodigoEmpresa BIGINT = 1;

SELECT COUNT(*) AS Vendaveis
FROM Veiculos WITH (NOLOCK)
WHERE CodigoOrganizacao = @CodigoOrganizacao
  AND CodigoEmpresa = @CodigoEmpresa
  AND CodigoStatus IN (8, 13);
```

**3.3 Sincronização incremental.** Deve bater com `meta.total` do passo 03. Use em `@Desde` o mesmo valor de `updatedSince`, convertido para a hora do banco.

```sql
DECLARE @CodigoOrganizacao BIGINT = 1, @Desde DATETIME = '2026-10-12T00:00:00';

SELECT COUNT(*) AS AlteradosDesde
FROM Veiculos WITH (NOLOCK)
WHERE CodigoOrganizacao = @CodigoOrganizacao
  AND ISNULL(ModificadoEm, InseridoEm) >= @Desde;
```

**3.4 Movimentações.** Mesma ordem de `GET /vehicles/{id}/movements`, da mais recente para a mais antiga.

```sql
DECLARE @CodigoVeiculo BIGINT = 18270;

SELECT TOP 20 m.CodigoMovimentacao, m.Tipo, m.DataHora, m.Hodometro, m.NivelCombustivel,
       m.CodigoEmpresa, m.CodigoStatusAnterior, m.CodigoStatusNovo, a.CodigoMotivo
FROM VeiculosMovimentacoes m WITH (NOLOCK)
LEFT JOIN VeiculosAutorizacaoSaida a WITH (NOLOCK) ON a.CodigoAutorizacao = m.CodigoAutorizacao
WHERE m.CodigoVeiculo = @CodigoVeiculo
ORDER BY m.DataHora DESC;
```

---

## 4. Pasta 03: vendas (leitura)

Compare com `GET /sales/{saleId}`:

| Campo da API | Coluna |
| --- | --- |
| `number` | `NumeroVenda` |
| `saleDate` | `DataVenda` |
| `amount` | `ValorVenda` |
| `status` | `Situacao`: `A` = OPEN, `P` = CONCLUDED, `C` = CANCELED |
| `returned` | `DevolucaoVenda` |
| `vehicleId` | Placa da venda |
| `salesChannel` | `TiposMidia` |

```sql
DECLARE @CodigoVenda BIGINT = 310;

SELECT vv.CodigoVenda, vv.NumeroVenda, vv.CodigoEmpresa, vv.DataVenda, vv.ValorVenda,
       vv.Situacao, vv.DevolucaoVenda, vv.CodigoCliente, vv.CodigoTipoMidia,
       tm.Descricao AS CanalVenda, vp.CodigoVeiculo
FROM VendasVeiculos vv WITH (NOLOCK)
LEFT JOIN TiposMidia tm WITH (NOLOCK) ON tm.CodigoTipoMidia = vv.CodigoTipoMidia
LEFT JOIN VendasVeiculosPlacas vp WITH (NOLOCK) ON vp.CodigoVenda = vv.CodigoVenda
WHERE vv.CodigoVenda = @CodigoVenda;
```

---

## 5. Pasta 04: ordens de serviço

Compare com `GET /service-orders/{serviceOrderId}`:

| Campo da API | Coluna |
| --- | --- |
| `status` | `Situacao`: `A` = OPEN, `F` = COMPLETED, `C` = CANCELED |
| `openedAt` / `closedAt` | `DataAbertura` / `DataHoraFecham` |
| `odometer` | `KmAbertura` |
| `items[]` | Itens, com `TipoManutencao` (P/C) e `ProdutosServicos.Tipo` (P/S) |

```sql
DECLARE @CodigoOrdemServico BIGINT = 61104;

SELECT os.CodigoOrdemServico, os.NumeroOS, os.CodigoVeiculo, os.CodigoEmpresa, os.Situacao,
       os.DataAbertura, os.DataHoraFecham, os.KmAbertura, os.TipoManutencao, os.CodigoFornecedor
FROM OrdemServicos os WITH (NOLOCK)
WHERE os.CodigoOrdemServico = @CodigoOrdemServico;

SELECT i.CodigoOrdemServicoItem, i.DescricaoItem, i.TipoManutencao, ps.Tipo AS TipoProduto,
       i.Quantidade, i.ValorTotal
FROM OrdemServicosItens i WITH (NOLOCK)
LEFT JOIN ProdutosServicos ps WITH (NOLOCK) ON ps.CodigoProdutoServico = i.CodigoProdutoServico
WHERE i.CodigoOrdemServico = @CodigoOrdemServico
ORDER BY i.CodigoOrdemServicoItem;
```

---

## 6. Pasta 05: reserva com cliente, troca de cliente e cancelamento

Siga a ordem: primeiro o DynamoDB (a operação e a auditoria), depois o Locavia (o registro) e, por fim, a cópia.

### 6.1 Depois do passo 02 (reserva criada)

**DynamoDB: a operação de criação.** Esperado:

- `status = FINISHED` e `type = RESERVATION_CREATE`.
- `result.locaviaSituation = A`.
- A `timeline` tem, nesta ordem: `REQUESTED`, `QUEUED`, `PROCESSING`, `CUSTOMER_RESOLVED`, `LOCAVIA_REQUEST`, `LOCAVIA_SUCCESS` (`httpStatus` 2xx), `COPY_UPDATED`, `SO_ESTOQUE_NOTIFICATION_QUEUED` e `FINISHED`.

```sql
SELECT "operationId", "type", "status", "attempts", "externalCode", "result", "timeline"
FROM "car-inventory-async-operations"
WHERE "operationId" = '<operationId>'
```

**DynamoDB: idempotência.** O passo 05 reenviou a mesma `externalReference` e deve continuar existindo **uma única** `RESERVATION_CREATE` com essa chave.

```sql
SELECT "operationId", "type", "status", "createdAt"
FROM "car-inventory-async-operations"."idempotencyKey-index"
WHERE "idempotencyKey" = '<externalReference>'
```

**Locavia: a reserva gravada.** Esperado:

- `Situacao = 'A'` e `ValorReserva = 73500`.
- `DataExpiracao` igual ao `expiresAt` enviado (hora do banco, sem fuso).
- `CodigoCliente` igual ao `customerId` do `result`.
- `InseridoPor` igual ao usuário de integração (query 0.4.2).

```sql
DECLARE @ReferenciaExterna VARCHAR(60) = 'SE-RES-1731340000000';

SELECT r.CodigoReserva, r.CodigoVeiculo, r.CodigoEmpresa, r.CodigoCliente, r.ReferenciaExterna,
       r.DataReserva, r.DataExpiracao, r.ValorReserva, r.DataPagamento, r.Situacao, r.Motivo,
       r.DataHoraSituacao, r.CodigoVenda, r.CodigoOrganizacao, r.InseridoPor, r.InseridoEm,
       r.ModificadoPor, r.ModificadoEm
FROM ReservasVenda r WITH (NOLOCK)
WHERE r.ReferenciaExterna = @ReferenciaExterna;
```

**Locavia: o cliente da reserva.** Se o CPF já era cliente, ele é reaproveitado sem alteração. Se não era, foi cadastrado com `Lojista = 'S'`.

```sql
DECLARE @Documento VARCHAR(14) = '09989383944', @CodigoOrganizacao BIGINT = 1;

SELECT c.CodigoCliente, c.Situacao, c.Lojista, p.CodigoPessoa, p.TipoPessoa, p.CPF, p.CNPJ,
       p.RazaoSocial, p.Email, p.Telefone
FROM Clientes c WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = c.CodigoPessoa
WHERE c.CodigoOrganizacao = @CodigoOrganizacao
  AND (p.CPF = @Documento OR p.CNPJ = @Documento);
```

**DynamoDB: a cópia da reserva.** Esperado:

- `status = ACTIVE` e `locaviaSituation = A`.
- `reservedAt`/`expiresAt` iguais a `DataReserva`/`DataExpiracao` do SQL, rotulados com `Z`.
- `customerId = CodigoCliente`.
- `history` com um evento `RESERVATION_CREATE`, que traz `input`, `locaviaRequest` (`POST reservas-venda`) e `locaviaResponse`.

```sql
SELECT "reservationId", "externalReference", "vehicleId", "companyId", "status", "locaviaSituation",
       "reservedAt", "expiresAt", "agreedPrice", "paymentDate", "customerId", "customer", "history"
FROM "car-inventory-reservations"
WHERE "reservationId" = '<reservationId>'
```

A mesma cópia pode ser buscada pela referência da Só Estoque, pelo índice usado na idempotência da criação:

```sql
SELECT "reservationId", "status", "locaviaSituation"
FROM "car-inventory-reservations"."externalReference-index"
WHERE "externalReference" = '<externalReference>'
```

### 6.2 Depois do passo 03 (notificação da criação)

A notificação é uma operação própria, com `type = RESERVATION_NOTIFY`. Esperado:

- `status = FINISHED`.
- `timeline` com `SO_ESTOQUE_NOTIFIED`.
- `result.receiptId` preenchido.
- A operação de origem também ganha `SO_ESTOQUE_NOTIFIED` na sua `timeline`.

```sql
SELECT "operationId", "type", "status", "attempts", "result", "timeline", "inputData"
FROM "car-inventory-async-operations"."idempotencyKey-index"
WHERE "idempotencyKey" = '<operationId da criação>-notify'
```

### 6.3 Depois do passo 06 (segunda reserva recusada com 422)

A recusa acontece antes de enfileirar, então nada é gravado em nenhum dos lados.

**Locavia:** só pode existir uma reserva `A` vigente para o veículo.

```sql
DECLARE @CodigoVeiculo BIGINT = 18270;

SELECT CodigoReserva, ReferenciaExterna, Situacao, DataExpiracao
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoVeiculo = @CodigoVeiculo
  AND Situacao = 'A'
  AND (DataExpiracao IS NULL OR DataExpiracao > GETDATE());
```

**DynamoDB:** não existe operação com a referência `SE-RES-MVP-DUP-…`. É um scan, então use só em desenvolvimento.

```sql
SELECT "operationId", "externalCode"
FROM "car-inventory-async-operations"
WHERE begins_with("externalCode", 'SE-RES-MVP-DUP-')
```

### 6.4 Depois do passo 09 (troca de cliente)

**DynamoDB: a operação.** Esperado:

- `type = RESERVATION_SAVE_CUSTOMER` e `status = FINISHED`.
- `CUSTOMER_RESOLVED` com o novo `customerId`.
- `LOCAVIA_SUCCESS` cuja `request` é `PUT reservas-venda`, com `CodigoReserva` e `CodigoCliente`.

```sql
SELECT "operationId", "type", "status", "result", "timeline"
FROM "car-inventory-async-operations"
WHERE "operationId" = '<operationId>'
```

**Locavia: o novo cliente lojista e a reserva atualizada.** Use o CPF `48173920532` e o `reservationId`. Esperado:

- O cliente existe com `Lojista = 'S'`, a pessoa com a razão social "Lojista MVP Final" e o endereço principal com CEP `01310100`.
- A reserva tem `CodigoCliente` igual a `newCustomerId` e `ModificadoPor`/`ModificadoEm` preenchidos.

```sql
DECLARE @Documento VARCHAR(14) = '48173920532', @CodigoReserva BIGINT = 0;

SELECT c.CodigoCliente, c.Lojista, c.Situacao, p.RazaoSocial, p.CPF, p.Email, p.Telefone,
       e.Cep, e.Logradouro, e.Numero, e.Bairro, e.CodigoMunicipio, e.Principal
FROM Clientes c WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = c.CodigoPessoa
LEFT JOIN PessoasEnderecos e WITH (NOLOCK) ON e.CodigoPessoa = p.CodigoPessoa AND e.Principal = 'S'
WHERE p.CPF = @Documento;

SELECT CodigoReserva, CodigoCliente, Situacao, ModificadoPor, ModificadoEm
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoReserva = @CodigoReserva;
```

**DynamoDB: a cópia.** Esperado:

- `customerId` igual ao novo cliente.
- `customer.document` igual a `48173920532`.
- `history` com 2 eventos (`RESERVATION_CREATE` e `RESERVATION_SAVE_CUSTOMER`).

```sql
SELECT "reservationId", "customerId", "customer", "history"
FROM "car-inventory-reservations"
WHERE "reservationId" = '<reservationId>'
```

### 6.5 Depois do passo 13 (cancelamento)

**DynamoDB: a operação de cancelamento.** A chave é natural, e o passo 16 reenviou o cancelamento: deve existir uma única operação com essa chave, em `FINISHED` e com `result.locaviaSituation = C`.

```sql
SELECT "operationId", "type", "status", "result"
FROM "car-inventory-async-operations"."idempotencyKey-index"
WHERE "idempotencyKey" = 'reservation-<reservationId>-cancel'
```

**Locavia.** Esperado:

- `Situacao = 'C'`.
- `Motivo = 'Cliente desistiu da compra (MVP final)'`.
- `DataHoraSituacao` preenchida (hora do banco).

```sql
DECLARE @CodigoReserva BIGINT = 0;

SELECT CodigoReserva, Situacao, Motivo, DataHoraSituacao, ModificadoPor, ModificadoEm
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoReserva = @CodigoReserva;
```

**DynamoDB: a cópia.** Esperado:

- `status = CANCELED` e `locaviaSituation = C`.
- `cancellation.reason` igual ao `Motivo`.
- `cancellation.canceledAt` igual a `DataHoraSituacao` (com `Z`).
- `history` com 3 eventos; o último tem `statusBefore = ACTIVE` e `statusAfter = CANCELED`.

```sql
SELECT "reservationId", "status", "locaviaSituation", "cancellation", "history"
FROM "car-inventory-reservations"
WHERE "reservationId" = '<reservationId>'
```

**Todas as operações da reserva**, pela referência da Só Estoque. Esperado:

- `RESERVATION_CREATE`, `RESERVATION_SAVE_CUSTOMER` e `RESERVATION_CANCEL`.
- Uma `RESERVATION_NOTIFY` para cada uma delas.
- Todas em `FINISHED`.

```sql
SELECT "operationId", "type", "status", "createdAt"
FROM "car-inventory-async-operations"."externalCode-index"
WHERE "externalCode" = '<externalReference>'
```

---

## 7. Pasta 06: reserva sem cliente e retirada

**Locavia, depois do passo 02.** Esperado:

- `Situacao = 'A'` e `CodigoCliente` nulo.
- `DataExpiracao` 72 h depois de `DataReserva`; a diferença deve ser `72`.

```sql
DECLARE @ReferenciaExterna VARCHAR(60) = '<externalReference>';

SELECT CodigoReserva, CodigoCliente, Situacao, DataReserva, DataExpiracao,
       DATEDIFF(HOUR, DataReserva, DataExpiracao) AS HorasAteExpirar
FROM ReservasVenda WITH (NOLOCK)
WHERE ReferenciaExterna = @ReferenciaExterna;
```

**DynamoDB, depois do passo 02:** a `timeline` da criação **não** tem `CUSTOMER_RESOLVED`.

```sql
SELECT "operationId", "status", "timeline"
FROM "car-inventory-async-operations"
WHERE "operationId" = '<operationId da criação>'
```

**Locavia, depois do passo 05.** Esperado:

- `Situacao = 'R'`.
- `Motivo = 'Veículo retirado do anúncio do lojista (MVP final)'`.
- `DataHoraSituacao` preenchida.

```sql
DECLARE @CodigoReserva BIGINT = 0;

SELECT CodigoReserva, Situacao, Motivo, DataHoraSituacao
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoReserva = @CodigoReserva;
```

**DynamoDB, depois do passo 05.** Esperado:

- A operação de retirada em `FINISHED`.
- A cópia com `status = WITHDRAWN`, `locaviaSituation = R` e `withdrawal.reason`/`withdrawnAt` preenchidos.

```sql
SELECT "operationId", "status", "result"
FROM "car-inventory-async-operations"."idempotencyKey-index"
WHERE "idempotencyKey" = 'reservation-<reservationId>-withdraw'
```

```sql
SELECT "reservationId", "status", "locaviaSituation", "withdrawal", "history"
FROM "car-inventory-reservations"
WHERE "reservationId" = '<reservationId>'
```

O passo 08 tenta trocar o cliente da reserva retirada e recebe `422`. Nada muda: o `history` continua com 2 eventos.

---

## 8. Pasta 07: expiração

A expiração não depende de rotina agendada:

- A API mostra `EXPIRED` assim que `expiresAt` passa.
- O Locavia só grava `E` quando o veículo é reservado de novo.

**8.1 Depois do passo 04 (reserva vencida).** Use `expiredReservationId`.

Esperado no **Locavia**: `Situacao` continua `'A'` e `Vencida = 1`.

```sql
DECLARE @CodigoReserva BIGINT = 0;

SELECT CodigoReserva, Situacao, DataExpiracao, GETDATE() AS HoraBanco,
       CASE WHEN DataExpiracao <= GETDATE() THEN 1 ELSE 0 END AS Vencida
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoReserva = @CodigoReserva;
```

Esperado no **DynamoDB**: a cópia também continua com `status = ACTIVE` e `locaviaSituation = A`. O `EXPIRED` é calculado na leitura.

```sql
SELECT "reservationId", "status", "locaviaSituation", "expiresAt"
FROM "car-inventory-reservations"
WHERE "reservationId" = '<expiredReservationId>'
```

**8.2 Depois do passo 07 (nova reserva do mesmo veículo).** No Locavia, a reserva vencida passou para `E`, com `Motivo = 'Reserva expirada.'`, e a nova está `A`.

```sql
DECLARE @CodigoVeiculo BIGINT = 18270;

SELECT TOP 5 CodigoReserva, ReferenciaExterna, Situacao, Motivo, DataReserva, DataExpiracao, DataHoraSituacao
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoVeiculo = @CodigoVeiculo
ORDER BY CodigoReserva DESC;
```

A cópia da reserva vencida no DynamoDB continua `ACTIVE`/`A`. Essa diferença é esperada e está descrita na seção 9 da arquitetura. A API continua respondendo `EXPIRED` para ela.

**8.3 Depois do passo 09:** a nova reserva fica `R` e o veículo fica livre. Repita a query 0.4.3; o veículo deve voltar a aparecer.

---

## 9. Pasta 08: consultas de reservas

A lista da API vem da cópia no DynamoDB.

**`GET /reservations?vehicleId=`** usa o índice por veículo. `vehicleId` é numérico e vai sem aspas.

```sql
SELECT "reservationId", "externalReference", "status", "locaviaSituation", "reservedAt"
FROM "car-inventory-reservations"."vehicleId-index"
WHERE "vehicleId" = 18270
```

**Locavia: as reservas do mesmo veículo.** Os códigos devem ser os mesmos da query acima. A `Situacao` também deve ser a mesma, exceto nas reservas expiradas (seção 8).

```sql
DECLARE @CodigoVeiculo BIGINT = 18270;

SELECT CodigoReserva, ReferenciaExterna, Situacao, Motivo, DataReserva, DataHoraSituacao
FROM ReservasVenda WITH (NOLOCK)
WHERE CodigoVeiculo = @CodigoVeiculo
ORDER BY DataReserva DESC;
```

**Locavia: integridade geral.** As duas queries devem retornar **vazio**.

```sql
-- no máximo uma reserva bloqueante (A vigente ou F) por veículo
SELECT CodigoVeiculo, COUNT(*) AS Bloqueantes
FROM ReservasVenda WITH (NOLOCK)
WHERE Situacao = 'F'
   OR (Situacao = 'A' AND (DataExpiracao IS NULL OR DataExpiracao > GETDATE()))
GROUP BY CodigoVeiculo
HAVING COUNT(*) > 1;

-- referência externa única por organização
SELECT CodigoOrganizacao, ReferenciaExterna, COUNT(*) AS Quantidade
FROM ReservasVenda WITH (NOLOCK)
WHERE ReferenciaExterna IS NOT NULL
GROUP BY CodigoOrganizacao, ReferenciaExterna
HAVING COUNT(*) > 1;
```

---

## 10. Pasta 09: validações e erros

Todas as recusas desta pasta (`400`, `404` e `422`) acontecem **antes** da fila. Nada é gravado no DynamoDB nem no Locavia.

**Locavia:** não existe reserva de teste de erro, e o cliente com nome longo (CPF `62738491022`) não foi cadastrado. As duas queries devem retornar vazio.

```sql
SELECT CodigoReserva, ReferenciaExterna
FROM ReservasVenda WITH (NOLOCK)
WHERE ReferenciaExterna LIKE 'SE-RES-MVP-ERR-%';

DECLARE @Documento VARCHAR(14) = '62738491022';
SELECT c.CodigoCliente
FROM Clientes c WITH (NOLOCK)
INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = c.CodigoPessoa
WHERE p.CPF = @Documento;
```

**DynamoDB:** não existe operação de teste de erro. É um scan, então use só em desenvolvimento. Deve retornar vazio.

```sql
SELECT "operationId", "type", "externalCode"
FROM "car-inventory-async-operations"
WHERE begins_with("externalCode", 'SE-RES-MVP-ERR-')
```

---

## 11. Fechamento: saúde da fila e das operações

Rode ao final da collection.

**DynamoDB: operações em erro ou presas.** Em uma execução limpa, as duas queries devem retornar vazio. É um scan, então use só em desenvolvimento.

```sql
SELECT "operationId", "type", "status", "attempts", "lastError"
FROM "car-inventory-async-operations"
WHERE "status" = 'ERROR'
```

```sql
SELECT "operationId", "type", "status", "updatedAt"
FROM "car-inventory-async-operations"
WHERE "status" IN ['PENDING', 'PROCESSING']
```

Se uma notificação aparecer em erro, confira `API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL`. A causa fica em `lastError` e em `SO_ESTOQUE_NOTIFICATION_ERROR`, na timeline da operação de origem.

**SQS: fila e DLQ vazias.** As duas devem ter `ApproximateNumberOfMessages = 0`.

```bash
aws sqs get-queue-attributes $DDB \
  --queue-url http://localhost:4567/000000000000/locaviaweb-car-inventory-process-reservation.fifo \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

aws sqs get-queue-attributes $DDB \
  --queue-url http://localhost:4567/000000000000/locaviaweb-car-inventory-process-reservation-dlq.fifo \
  --attribute-names ApproximateNumberOfMessages
```

**Conferência cruzada final.** Para cada reserva do veículo de teste, compare os três lados:

| API (`GET /reservations/{id}`) | DynamoDB (`car-inventory-reservations`) | Locavia (`ReservasVenda`) |
| --- | --- | --- |
| `id` | `reservationId` | `CodigoReserva` |
| `externalReference` | `externalReference` | `ReferenciaExterna` |
| `status` | `status` / `locaviaSituation` | `Situacao`. Pode divergir em `EXPIRED`: veja a seção 8. |
| `reservedAt` / `expiresAt` | `reservedAt` / `expiresAt` | `DataReserva` / `DataExpiracao`, na hora do banco |
| `customerId` | `customerId` | `CodigoCliente` |
| `cancellation` / `withdrawal` | `cancellation` / `withdrawal` | `Motivo` + `DataHoraSituacao` |
