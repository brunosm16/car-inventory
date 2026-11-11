# Double-check da planilha de campos (Só Estoque)

Conferência de cada campo de `spreadsheet-fields-so-estoque.xlsx` contra as respostas dos endpoints de leitura da `api-locaviaweb-car-inventory`. A planilha continua só neste repositório de documentação e não é copiada nem citada na API.

**Legenda:** ✅ já atendido · 🆕 incluído nesta revisão · ⏸️ adiado

## Empresa (`GET /companies`, `GET /companies/:id`)

| Nº | Campo da planilha | Campo na API | Situação |
|---|---|---|---|
| 1 | ID Locadora | `id` (CodigoEmpresa) | ✅ |
| 2 | Razão Social | `legalName` | ✅ |
| 3 | Nome Fantasia | `tradeName` | ✅ |
| 4 | CNPJ | `cnpj` (texto, só dígitos) | ✅ |
| 8 | CEP | `address.zipCode` | ✅ |
| 9 | Logradouro | `address.street` | ✅ |
| 10 | Número | `address.number` | ✅ |
| 11 | Complemento | `address.complement` | ✅ |
| 12 | Bairro | `address.district` | ✅ |
| 13 | Cidade | `address.city` | ✅ |
| 14 | Código IBGE do Município | `address.ibgeCityCode` | ✅ |
| 15 | Estado | `address.state` | ✅ |
| 16 | País | `address.country` (ISO 3166-1 alfa-2, ex.: `BR`) | ✅ A planilha deixou em aberto "nome ou ISO". Usamos ISO. |
| 17 | Telefone | `phone` | ✅ |
| 18 | Contato | `contactName` | ✅ |
| 19 | E-mail de Contato | `contactEmail` | ✅ |
| 20 | Ativo | `active` | ✅ |

## Veículo (`GET /vehicles`, `GET /vehicles/:id`)

Os campos novos aparecem tanto na lista quanto no detalhe.

| Nº | Campo da planilha | Campo na API | Origem no Locavia | Situação |
|---|---|---|---|---|
| 2 | ID Locadora | `companyId` | `Veiculos.CodigoEmpresa` | ✅ |
| 3 | Placa | `licensePlate` | `Veiculos.Placa` | ✅ |
| 4 | Chassi | `chassis` | `Veiculos.Chassi` | ✅ |
| 5 | Renavam | `renavam` | `Veiculos.Renavam` | ✅ |
| 6 | Hodômetro | `odometer` | `Veiculos.Hodometro` | ✅ |
| 8 | Cor | `color` (código + descrição) | `VeiculosCores` | ✅ |
| 9 | Ano/Modelo | `manufactureYear`, `modelYear` | `Veiculos.AnoFabricacaoModelo` | ✅ Dois campos numéricos, como a planilha recomenda. |
| 10 | Combustível | `fuelType` | `VeiculosTiposCombustivel` | ✅ |
| 11 | Portas | `doors` | `Veiculos.NumeroPortas` | ✅ |
| 12 | Marca | `brand` | `VeiculosMarcas` | ✅ Agora vem antes de `model`. |
| 13 | Modelo | `model` | `VeiculosModelos` | ✅ |
| 14 | Versão | `version` | `VeiculosModelosEspecificacoes.Versao` | 🆕 Fica ausente quando o modelo não tem ficha cadastrada. |
| 17 | FIPE | `fipeCode` | `VeiculosModelos.CodigoFipe` | 🆕 É o código FIPE, não o valor. |
| 20 | Opcionais (itens de série e acessórios) | `optionals[]` (`id`, `description`, `type` `STANDARD`/`OPTIONAL`) | `VeiculosEquipamentos` + `Equipamentos.TipoEquipamento` | 🆕 Lista JSON, então não precisamos combinar separador. Mesma fonte do relatório de equipamentos do Locavia. |
| 21 | Localização | `yard` (código + descrição) | `Patios` | ✅ Envia também o código, como a planilha pede. |
| 22 | Status | `status` + `locaviaStatus` | `Veiculos.CodigoStatus` | ✅ |
| 23 | Alienação Fiduciária | `alienated` | `Veiculos.CodigoSituacaoProprietario = 2` | 🆕 Mesma regra que bloqueia reserva e venda. |
| 24 | Data de Atualização | `updatedAt` (+ filtro `updatedSince`) | `ModificadoEm` / `InseridoEm` | ✅ |
| 25 | Data Compra | `purchase.date` | `Veiculos.DataCompra` | ✅ |
| 26 | NF Compra | `purchase.invoiceNumber` | `Veiculos.NumeroNFCompra` | ✅ |
| 27 | Fornecedor Compra | `purchase.supplierName` | `Fornecedores` → `Pessoas.Nome` | 🆕 Antes só saía o código (`supplierId`). |
| 28 | CNPJ Fornecedor Compra | `purchase.supplierCnpj` (só dígitos) | `Fornecedores` → `Pessoas.CNPJ` | 🆕 |
| 29 | Valor Compra | `purchase.amount` | `Veiculos.ValorCompra` | ✅ |
| 31 | Data Prevista Venda | `sale.expectedDate` | `Veiculos.DataPrevistoVenda` | ✅ |
| 32 | Valor Previsto Venda | `sale.expectedAmount` | `Veiculos.ValorPrevistoVenda` | ✅ |
| 33 | Data Entrada Venda | `sale.listedAt` | `Veiculos.DataEntradaVenda` | ✅ |
| 34 | Data Venda | `sale.soldAt` (+ `sale.saleId`) | `VendasVeiculos.DataVenda` | 🆕 |
| 35 | Valor Venda | `sale.amount` | `VendasVeiculos.ValorVenda` | 🆕 |
| 38 | Tipo de Mídia (local da venda) | `sale.salesChannel` (código + descrição) | `TiposMidia` | 🆕 Usa o nome "canal de venda" que a planilha sugere. |
| 40 | Tipo de Operação | — | — | ⏸️ Adiado |
| 41 | Perfil de Uso | — | — | ⏸️ Adiado |
| 42 | Percentual de Utilização | — | — | ⏸️ Adiado |

**Venda efetiva no veículo:** os campos 34, 35 e 38 vêm da venda mais recente com situação `P` (aprovada) e sem devolução. Se o veículo não foi vendido, eles ficam ausentes. O detalhe completo da venda continua em `GET /sales`.

**Utilização (40 a 42), adiada:** o dado existe no Locavia, mas espalhado:
- Rent a Car vem de `Contratos`.
- Fleet vem de `ContratosGrupos` com `CodigoContratoGrupoTipo = 1` (Terceirização de Frota). O perfil Normal, Severo ou Misto está em `ContratosGruposOperacional.UtilizacaoFrota` (`N`/`S`/`M`).
- CaaS vem de `ContratosGrupos` com `CodigoContratoGrupoTipo = 2` (Carro por assinatura).

Ainda falta decidir como calcular o percentual de cada tipo, para que a soma por veículo dê 100.

## Manutenção (`GET /service-orders`, `GET /service-orders/:id`)

| Nº | Campo da planilha | Campo na API | Situação |
|---|---|---|---|
| 1 | ID OS | `id` (+ `number`) | ✅ |
| 2 | ID Veículo | `vehicleId` | ✅ |
| 3 | Data | `openedAt` e `closedAt` | ✅ Envia as duas datas, como a planilha sugere. |
| 5 | Hodômetro na OS | `odometer` | ✅ |
| 6 | Fornecedor | `supplierName` (+ `supplierId`) | ✅ |
| 7 | CNPJ Fornecedor | `supplierCnpj` | 🆕 Agora sai só com dígitos, como nos outros CNPJs. |
| 8 | Valor Total OS | `totalAmount` (+ `discountAmount`) | ✅ |
| 9 | Status da OS | `status` (`CANCELED` não entra no custo) | ✅ |
| 10 | Nº do Item | `items[].itemNumber` | ✅ |
| 11 | Descrição do Item | `items[].description` | ✅ |
| 12 | Tipo de Serviço (Preventivo ou Corretivo) | `items[].serviceType` | ✅ |
| 13 | Tipo de Produto/Serviço (Material ou Serviço) | `items[].itemType` | ✅ |
| 14 | Quantidade | `items[].quantity` | ✅ |
| 15 | Valor Unitário | `items[].unitPrice` | ✅ |
| 16 | Valor Total Item | `items[].totalAmount` | ✅ |

## Mudanças na API

- **Entidades:** `VeiculosModelos.CodigoFipe`. Novas: `VeiculosModelosEspecificacoes`, `Equipamentos`, `VeiculosEquipamentos`. Nova relação `Veiculos.CodigoFornecedorCompra` → `Fornecedores`.
- **`LocaviaVehicleRepository`:**
  - A página e o detalhe passam a ler também o FIPE e o fornecedor da compra. São relações N:1, então a paginação continua com OFFSET/FETCH.
  - Novo `findDetails`: lê versão, equipamentos e venda efetiva com uma consulta por tabela para a página inteira. Todas usam `WITH (NOLOCK)`.
- **Mappers e modelos:** veículo e OS, conforme as tabelas acima. Os campos novos estão documentados no Swagger.
- **Testes:** SQL do repositório, mapper e e2e de veículos (no módulo fake). Passam 191 testes unitários e 63 e2e.
