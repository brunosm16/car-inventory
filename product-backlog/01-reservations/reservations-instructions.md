### Implementação - api-locavia-web-ts

No `api-locavia-web-ts` precisa existir uma entidade nova `reserva-venda` que armazena as seguintes informações: CodigoReserva, CodigoVeiculo, DataReserva, ValorReserva, DataPagamento, Situacao, Motivo(em caso de retirada ou de cancelamento), outros campos também podem existir nessa entidade caso você veja a necessidade para isso, porém é importante hoje ter no Locavia essa entidade sendo disponibilizada para a realização de reservas de venda de veículos. 

O veículo pode ter mais de uma reserva desde que tenha apenas uma ativa ou uma finalizada, ou seja, ele não pode ter duas ativas ou então uma ativa e outra finalizada, só pode o cenário de uma ativa/finalizada e outras canceladas. 

É necessário criar os usecases de CRUD para o `reserva-venda` com as regras necessárias, visto que esses endpoints serão utilizados pelo projeto de integração para atualizar a reserva no Locavia. As regras de negócio precisam ser devidamente implementadas para permitir a reserva de veículos para venda no Locavia esse é um fluxo novo que deve ser implementado com todo cuidado. 

No fluxo de reservas hoje existente no repositório de integração `api-locaviaweb-car-inventory` quando o cliente não existir no Locavia a integração será responsável por realizar a criação dele com os dados advindos da requisição do Só Estoque, dessa forma é necessário criar uma flag no cliente para identificá-lo como "Lojista". 

### Implementação - api-locaviaweb-car-inventory  

Garantir que os endpoints estejam de acordo com o contrato inicial pois o cliente já desenvolveu baseado na primeira versão do swagger então o contrato tem que ser mantido.

Nenhum dado deve ser mockado mais no código de produção, visto que agora a aplicação deve interagir com os dados reais da aplicação. 

Cadastrar cliente no momento da reserva caso não exista no Locavia macando sempre com a flag "Logista". 

Deve ser fornecida a possibilidade de Criar, Cancelar, Retirar reserva sempre mantendo de acordo com o que já existe no fluxo do Locavia. 

A criação de reserva é feita a partir do Só Estoque que cria a requisição, o projeto de integração faz o processamento assíncrono via SQS e DynamoDB, porém agora a comunicação final precisa ser com o `api-locavia-web-ts` com os endpoints definidos para `reserva-venda`, é necessário ter um controle exímio com registro de histórico das operações de reserva no DynamoDB da integração, visto que esses dados do DynamoDB da integração serão usados posteriormente, eles serão a verdade dentro da integração então precisam estar atualizados, porém continua sendo necessário refletir a operação nos endpoints do `api-locavia-web-ts`. 

### Output 

- Design doc e diagramas para as soluções separando por repositório. 
- Testes unitários no `api-locavia-web-ts`.
- Testes unitários e de integração no `api-locaviaweb-car-inventory`.
- Criação de collections do postman para validação do fluxo completo via API. 

