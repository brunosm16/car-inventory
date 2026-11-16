1. Do lado da Só Estoque -> Todo o back-end está pronto e agora eles estão no desenvolvimento do front. 
2. Temos duas entidades importantes Revendedor: vende o carro e Frotista: compra o carro. 
3. Informações que chegam na API externa fazem a validação da data prevista para desmobilização de frota, 90 dias antes da confirmação validar com o frotista para realizar a pré-venda, o ato da pré-venda configura-se como a ação da Só Estoque consumir em nossa API para validar 90 dias antes a desmobilização da frota. 
4. Devem ser enviados para a API da Só Estoque -> Dados de manutenção, tipo de uso e auxiliamos no processo da precificação do carro, vindo ou não vindo é consultado com histórico de FIPE de 12 meses. Iremos auxiliar no processo de desmobilização e não de fato fazer o processo de ponta a ponta. 
5. Deve visualizar carros que estão a venda. 
6. Emissão de Nota Fiscal pode ser feito do nosso lado é uma decisão a ser tomada, cancelamento de notas 24 horas. 