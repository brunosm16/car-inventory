A reserva precisa seguir um fluxo assíncrono, o passo a passo é o seguinte: 

1. Só Estoque dispara uma requisição de reserva de veículo para o repositório de integração. 

2. O repositório de integração enfileira a mensagem e manda o operationId. 

3. A integração faz o processamento assíncrono, com a auditoria no DynamoDB de todas as operações e se comunica com a api do locavia para finalizar a reserva. 

4. Ao se comunicar com a api do locavia é esperado que seja retornado um código 200 informado que a operação disparou no locavia com sucesso em caso de erro isso é registrado no DynamoDB, em caso de sucesso também. A ideia é sempre manter sincronizado os três produtos. Só Estoque -> api-locaviaweb-car-inventory -> api-locavia-web-ts

5. Enviar mensagem para a Só Estoque informando que a reserva foi feita com sucesso no Locavia. 