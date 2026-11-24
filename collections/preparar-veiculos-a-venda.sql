-- Massa de teste do fluxo Só Estoque (LocaviaWeb_Debug): deixa À venda (status 8)
-- os veículos de até 5 desmobilizações abertas, com tipo de venda, que ainda não
-- podem ser reservados. Só esses veículos aparecem no gerenciador e podem ir para a fila.
-- O SELECT final mostra o status anterior de cada veículo, para desfazer se preciso:
--   UPDATE Veiculos SET CodigoStatus = <status anterior> WHERE CodigoVeiculo = <veículo>
SET NOCOUNT ON;

DECLARE @CodigoOrganizacao BIGINT = 1;
DECLARE @Quantidade INT = 5;

DECLARE @Veiculos TABLE (
    CodigoVeiculo BIGINT PRIMARY KEY,
    CodigoDesmobilizacao BIGINT,
    StatusAnterior BIGINT
);

INSERT INTO @Veiculos (CodigoVeiculo, CodigoDesmobilizacao, StatusAnterior)
SELECT TOP (@Quantidade) D.CodigoVeiculo, MAX(D.CodigoDesmobilizacao), MAX(V.CodigoStatus)
FROM Desmobilizacoes D
INNER JOIN Veiculos V ON V.CodigoVeiculo = D.CodigoVeiculo
WHERE D.CodigoOrganizacao = @CodigoOrganizacao
  AND D.Situacao = 'A'
  AND D.CodigoVendaTipo IS NOT NULL
  AND V.CodigoStatus NOT IN (8, 13)
  AND ISNULL(V.CodigoSituacaoProprietario, 0) <> 2
  AND NOT EXISTS (
      SELECT 1 FROM ReservasVeiculo R
      WHERE R.CodigoVeiculo = D.CodigoVeiculo AND R.Situacao IN ('A', 'F')
  )
GROUP BY D.CodigoVeiculo
ORDER BY MAX(D.CodigoDesmobilizacao) DESC;

UPDATE V
SET V.CodigoStatus = 8,
    V.ModificadoEm = GETDATE()
FROM Veiculos V
INNER JOIN @Veiculos X ON X.CodigoVeiculo = V.CodigoVeiculo;

SELECT X.CodigoDesmobilizacao, X.CodigoVeiculo, V.Placa, X.StatusAnterior, V.CodigoStatus AS StatusAtual
FROM @Veiculos X
INNER JOIN Veiculos V ON V.CodigoVeiculo = X.CodigoVeiculo
ORDER BY X.CodigoDesmobilizacao DESC;
