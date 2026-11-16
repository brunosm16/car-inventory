### Rebuild - Desmobilizações - Consumo Integração

- O repositório `api-locaviaweb-car-inventory` vai ficar responsável por consumir as mensagens da fila `lw-integracao-desmobilizacao-so-estoque`, hoje já existe uma camada de auditoria mas isso não é suficiente é necessário criar schemas para as entidades de `Reserva`, `Veículos`. 

- Ao consumir os dados da fila esses devem ser salvos no Dynamo da integração em suas respectivas entidades e enviados via webhook para a Só Estoque.Na comunicação final com a Só Estoque é necessário realizar um retry automático com backoff limit. 

- Schema `Veículos`: 

Quando dados do veículo for atualizado precisa existir um update. 

````
CodigoVeiculo: string,
placa: string,
Situacao: ENUM(aberta, cancelada, fechada),
mensagem: {
	dadosDesmobilizacao: {

	},
	dadosManutencao: {

	},
	dadosReserva: {

	}
}
````

- Schema `Reservas`: 

Quando dados da reserva for atualizada precisa existir um update. 

````
CodigoReserva: string,
CodigoVeiculo: string,
CodigoCliente: string,
DataReserva: timestamp,
ValorReserva: number,
DataPagamento: timestamp,
````

- Endpoints: 

1. GET() - Retorna todos os veículos disponibilizados para a Só Estoque e que estão salvos no Dynamo retornando suas associações(Reservas)