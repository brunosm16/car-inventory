#### Dicionário de dados

A aplicação possui um dicionário de dados definidos, lembre-se sempre de seguir a notação em inglês, hoje a aplicação está funcionando corretamente e está mapeada perfeitamente, porém existem tabelas com os dicionários dos dados, preciso que você faça a validação somente altere aquilo for de extrema necessidade, somente aquilo que realmente precisa alterar. Jamais faça alterações que quebrem o que foi devidamente implementado. 

5. Dicionário de dados
Campos definidos na planilha Campos_Integracao_So_Estoque.xlsx. A coluna "Chave sugerida" é uma proposta de nome técnico para o JSON e o DynamoDB, a validar com a plataforma.

Empresa (locadora)
Enviada pelo webhook de empresa e retornada em GET /empresas.
Grupo	Campo	Chave sugerida	Descrição	Exemplo	Observação
Identificação	ID Locadora	idLocadora	Identificador único da locadora no Locavia; chave com Veículo e OS	600	Chave estável para reconciliar envios; CNPJ não cobre matriz/filiais
Identificação	Razão Social	razaoSocial	Razão social registrada	Locadora Exemplo Ltda	
Identificação	Nome Fantasia	nomeFantasia	Nome comercial	Exemplo Rent a Car	
Identificação	CNPJ	cnpj	CNPJ da locadora	12345678000195	Texto, para manter zeros à esquerda
Endereço	CEP	cep	CEP	01310100	Necessário para frete e localização do estoque
Endereço	Logradouro	logradouro	Rua, avenida etc.	Av. Paulista	
Endereço	Número	numero	Número	1000	
Endereço	Complemento	complemento	Complemento	Conj. 52	
Endereço	Bairro	bairro	Bairro	Bela Vista	
Endereço	Cidade	cidade	Município	São Paulo	
Endereço	Código IBGE	codigoIbgeMunicipio	Código IBGE de 7 dígitos	3550308	Evita divergência de grafia da cidade
Endereço	Estado	uf	UF	SP	
Endereço	País	pais	País	Brasil	Definir se a plataforma espera nome ou código ISO
Contato	Telefone	telefone	Telefone com DDD	11999998888	
Contato	Contato	contatoNome	Nome do responsável	Maria Silva	
Contato	E-mail de Contato	contatoEmail	E-mail do responsável	contato@exemplo.com.br	
Status	Ativo	ativo	Locadora ativa na integração	true	


Veículo
Enviado pelo webhook de veículos desmobilizados e retornado em GET /veiculos/{id}. Utilização é uma lista (1 veículo : N períodos de uso).
Grupo	Campo	Chave sugerida	Descrição	Exemplo	Observação
Cadastro	ID Locadora	idLocadora	Locadora proprietária (FK de Empresa)	LOC-000123	
Cadastro	Placa	placa	Placa	ABC1D23	
Cadastro	Chassi	chassi	Chassi (VIN)	9BWZZZ377VT004251	
Cadastro	Renavam	renavam	Código RENAVAM	00123456789	
Cadastro	Hodômetro	hodometro	Quilometragem atual	45230	
Cadastro	Cor	cor	Cor predominante	Prata	
Cadastro	Ano/Modelo	anoFabricacao, anoModelo	Ano de fabricação / modelo	2024/2025	Enviar em dois campos numéricos
Cadastro	Combustível	combustivel	Tipo de combustível	Flex	
Cadastro	Portas	portas	Número de portas	4	
Cadastro	Marca	marca	Fabricante	Volkswagen	
Cadastro	Modelo	modelo	Modelo	Polo	
Cadastro	Versão	versao	Versão/motorização	1.0 TSI Comfortline	Principal diferenciador de preço de revenda
Cadastro	FIPE	codigoFipe	Código FIPE (não o valor)	007056-4	
Cadastro	Opcionais	opcionais	Itens de série e acessórios	Ar-condicionado; Direção elétrica	Definir separador ou enviar como lista
Cadastro	Localização	localizacao	Unidade/pátio do veículo	Filial São Paulo – Pátio 2	Enviar também o código da unidade
Cadastro	Status	status	Situação do veículo na frota	À venda	
Cadastro	Alienação Fiduciária	alienacaoFiduciaria	Há gravame/alienação	false	Impacta possibilidade e prazo de venda
Cadastro	Data de Atualização	dataAtualizacao	Timestamp da última alteração	2026-10-22T11:58:00-03:00	Base da sincronização incremental
Compra	Data Compra	compra.data	Data da aquisição	2023-03-10	
Compra	NF Compra	compra.notaFiscal	Número da NF de compra	123456	
Compra	Fornecedor Compra	compra.fornecedor	Razão social do fornecedor	Concessionária X Ltda	
Compra	CNPJ Fornecedor Compra	compra.cnpjFornecedor	CNPJ do fornecedor	98765432000110	
Compra	Valor Compra	compra.valor	Valor pago	72500.00	
Venda	Data Prevista Venda	venda.dataPrevista	Data planejada	2026-12-15	
Venda	Valor Previsto Venda	venda.valorPrevisto	Preço-alvo	68000.00	
Venda	Data Entrada Venda	venda.dataEntrada	Entrada no estoque de venda	2026-10-01	Obrigatória quando Status = À venda
Venda	Data Venda	venda.data	Data efetiva da venda	2026-11-20	Obrigatória quando Status = Vendido
Venda	Valor Venda	venda.valor	Valor efetivo da venda	66500.00	Obrigatória quando Status = Vendido
Venda	Tipo de Mídia	venda.canal	Canal/local da venda	Leilão	Sugestão: renomear para Canal de Venda
Utilização	Tipo de Operação	utilizacoes[].tipoOperacao	Rent a Car, CaaS ou Fleet	Fleet	
Utilização	Perfil de Uso	utilizacoes[].perfilUso	Normal, Severo ou Misto	Severo	Obrigatório quando Tipo de Operação = Fleet
Utilização	Percentual de Utilização	utilizacoes[].percentual	Participação no uso total	60.00	Soma por veículo = 100


Manutenção (OS e itens)
Retornada em GET /veiculos/{id}/manutencoes e enviada na mensagem de desmobilização. Sugere-se estrutura aninhada: OS com lista de itens.
Grupo	Campo	Chave sugerida	Descrição	Exemplo	Observação
OS	ID OS	idOs	Número da ordem de serviço	OS-2026-001234	Agrupa itens e reconcilia o valor total
OS	ID Veículo	idVeiculo	Veículo atendido (FK)	VEI-004521	
OS	Data	dataAbertura, dataConclusao	Data da OS	2026-09-12	Enviar abertura e conclusão
OS	Hodômetro na OS	hodometro	Km no momento do serviço	44120	Base para custo por km
OS	Fornecedor	fornecedor	Oficina/fornecedor	Auto Center Y Ltda	
OS	CNPJ Fornecedor	cnpjFornecedor	CNPJ da oficina	11222333000144	
OS	Valor Total OS	valorTotal	Valor total da OS	1850.00	Igual à soma dos itens, menos descontos
OS	Status da OS	status	Situação da OS	Concluída	Excluir OS canceladas do custo
Item	Nº do Item	itens[].numero	Sequencial do item	1	Chave composta: ID OS + Nº Item
Item	Descrição do Item	itens[].descricao	Produto ou serviço	Troca de óleo e filtro	
Item	Tipo de Serviço	itens[].tipoServico	Preventivo ou Corretivo	Preventivo	
Item	Tipo de Produto/Serviço	itens[].tipoItem	Material ou Serviço	Material	
Item	Quantidade	itens[].quantidade	Quantidade	4.000	Valor Total = Quantidade × Valor Unitário
Item	Valor Unitário	itens[].valorUnitario	Preço unitário	45.00	
Item	Valor Total Item	itens[].valorTotal	Valor total do item	180.0