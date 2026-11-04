/*
  De/para do GET {{baseUrl}}/vehicles?page=1&limit=10 com o banco do LocaviaWeb (SQL Server).

  Mesma regra do endpoint: veículos da organização do LOCAVIA_WEB_ORGANIZATION (CNPJ do .env do
  car-inventory), ordenados por CodigoVeiculo, página @Page com @Limit itens.
  Cada coluna tem o nome do campo no JSON da resposta (data[].*); meta.itemCount é o total.
  Datas: a mesma hora gravada no SQL Server, no formato UTC (Z), sem conversão; mesma convenção
  do api-locavia-web-ts (InseridoEm 19:25:27 → "2026-11-03T19:25:27.000Z").

  Para o GET /vehicles/{id}, descomente o filtro por CodigoVeiculo no WHERE.
  Para "Estoque de venda e sincronização incremental"
  (?status=FOR_SALE,TOTAL_LOSS&companyId=1&updatedSince=2026-01-01T00:00:00Z),
  descomente os três filtros de baixo e use em @UpdatedSince o valor da request sem o Z.
*/
DECLARE @Cnpj  VARCHAR(14) = '07777542000114';  -- LOCAVIA_WEB_ORGANIZATION
DECLARE @Page  INT = 1;
DECLARE @Limit INT = 10;
DECLARE @UpdatedSince DATETIME = '2026-01-01T00:00:00';  -- updatedSince da request, sem o Z

SELECT
    v.CodigoVeiculo                                         AS [id],
    v.CodigoEmpresa                                         AS [companyId],
    v.Placa                                                 AS [licensePlate],
    v.Chassi                                                AS [chassis],
    v.Renavam                                               AS [renavam],
    v.CodigoMVA                                             AS [mva],
    v.CodigoModelo                                          AS [model.id],
    mo.Descricao                                            AS [model.description],
    mo.CodigoMarca                                          AS [brand.id],
    ma.Descricao                                            AS [brand.description],
    v.CodigoCor                                             AS [color.id],
    co.Descricao                                            AS [color.description],
    v.CodigoTipoCombustivel                                 AS [fuelType.id],
    tc.Descricao                                            AS [fuelType.description],
    CASE WHEN LEN(REPLACE(v.AnoFabricacaoModelo, '/', '')) = 4
         THEN 2000 + CAST(LEFT(REPLACE(v.AnoFabricacaoModelo, '/', ''), 2) AS INT) END  AS [manufactureYear],
    CASE WHEN LEN(REPLACE(v.AnoFabricacaoModelo, '/', '')) = 4
         THEN 2000 + CAST(RIGHT(REPLACE(v.AnoFabricacaoModelo, '/', ''), 2) AS INT) END AS [modelYear],
    v.NumeroPortas                                          AS [doors],
    v.NumeroPassageiros                                     AS [passengers],
    v.Hodometro                                             AS [odometer],
    v.NivelCombustivel                                      AS [fuelLevel],
    v.CodigoPatio                                           AS [yard.id],
    pa.Descricao                                            AS [yard.description],
    v.CodigoVeiculosClassificacao                           AS [classificationId],
    v.CodigoSituacaoProprietario                            AS [ownershipSituationId],
    v.RestricaoVenda                                        AS [saleRestriction],
    CASE v.CodigoStatus
        WHEN 1 THEN 'RENTED'            WHEN 2 THEN 'AVAILABLE'
        WHEN 3 THEN 'IN_PREPARATION'    WHEN 4 THEN 'IN_MAINTENANCE'
        WHEN 5 THEN 'BLOCKED'           WHEN 6 THEN 'STOLEN'
        WHEN 7 THEN 'SUBLEASE_RETURNED' WHEN 8 THEN 'FOR_SALE'
        WHEN 9 THEN 'SOLD'              WHEN 10 THEN 'INSURANCE_CLAIM'
        WHEN 11 THEN 'SALE_PREPARATION' WHEN 12 THEN 'INTERNAL_USE'
        WHEN 13 THEN 'TOTAL_LOSS'       WHEN 14 THEN 'REPOSSESSION'
    END                                                     AS [status],
    v.CodigoStatus                                          AS [locaviaStatus.code],
    st.Status                                               AS [locaviaStatus.letter],
    st.Descricao                                            AS [locaviaStatus.description],
    v.CodigoStatusAntesRestricao                            AS [statusBeforeRestriction (código)],
    v.CodigoRestricao                                       AS [restrictionId],
    CASE WHEN v.CodigoGrupoContratoReservado IS NULL THEN 'false' ELSE 'true' END AS [reserved],
    v.CodigoGrupoContratoReservado                          AS [reservedContractGroupId],
    FORMAT(v.DataCompra, 'yyyy-MM-dd''T''HH:mm:ss.fff''Z''')        AS [purchase.date],
    v.NumeroNFCompra                                        AS [purchase.invoiceNumber],
    v.CodigoFornecedorCompra                                AS [purchase.supplierId],
    v.CodigoEmpresaCompra                                   AS [purchase.companyId],
    v.ValorCompra                                           AS [purchase.amount],
    FORMAT(v.DataPrevistoVenda, 'yyyy-MM-dd''T''HH:mm:ss.fff''Z''') AS [sale.expectedDate],
    v.ValorPrevistoVenda                                    AS [sale.expectedAmount],
    FORMAT(v.DataEntradaVenda, 'yyyy-MM-dd''T''HH:mm:ss.fff''Z''')  AS [sale.listedAt],
    v.Observacao                                            AS [notes],
    FORMAT(v.InseridoEm, 'yyyy-MM-dd''T''HH:mm:ss.fff''Z''')        AS [createdAt],
    FORMAT(ISNULL(v.ModificadoEm, v.InseridoEm), 'yyyy-MM-dd''T''HH:mm:ss.fff''Z''') AS [updatedAt],
    COUNT(1) OVER ()                                        AS [meta.itemCount]
FROM Veiculos v                         WITH (NOLOCK)
LEFT JOIN VeiculosModelos mo            WITH (NOLOCK) ON mo.CodigoModelo = v.CodigoModelo
LEFT JOIN VeiculosMarcas ma             WITH (NOLOCK) ON ma.CodigoMarca = mo.CodigoMarca
LEFT JOIN VeiculosCores co              WITH (NOLOCK) ON co.CodigoCor = v.CodigoCor
LEFT JOIN VeiculosTiposCombustivel tc   WITH (NOLOCK) ON tc.CodigoTipoCombustivel = v.CodigoTipoCombustivel
LEFT JOIN Patios pa                     WITH (NOLOCK) ON pa.CodigoPatio = v.CodigoPatio
LEFT JOIN VeiculosStatus st             WITH (NOLOCK) ON st.CodigoStatus = v.CodigoStatus
WHERE v.CodigoOrganizacao = (
        SELECT TOP 1 o.CodigoOrganizacao
          FROM Organizacoes o WITH (NOLOCK)
         INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = o.CodigoPessoa
         WHERE p.CNPJ = @Cnpj)
  -- AND v.CodigoVeiculo = 18208   -- GET /vehicles/{id}
  -- AND v.CodigoStatus IN (8, 13)  -- status=FOR_SALE,TOTAL_LOSS
  -- AND v.CodigoEmpresa = 1        -- companyId
  -- AND (v.ModificadoEm >= @UpdatedSince OR (v.ModificadoEm IS NULL AND v.InseridoEm >= @UpdatedSince))  -- updatedSince
ORDER BY v.CodigoVeiculo
OFFSET (@Page - 1) * @Limit ROWS FETCH NEXT @Limit ROWS ONLY;
