### Rebuild - Desmobilizações - Reserva

- A API da Só Estoque irá disparar o endpoint de POST de reserva para criar reservas no Locavia, dessa forma é necessário um endpoint de POST para /reserva que atualiza a entidade de reservas/veículos do Dynamo e que que coloca isso em uma fila do SQS para o `api-locavia-web-ts` consumir. Lembrando que para reserva existe a necessidade de retorna sua respectiva associação ao veículo, em caso de atualizações advindas da Só Estoque é necessário realizar as operações de cancelamento, atualização de status.

- A comunicação com o Locavia deve ser feito com fila devemos publicar na fila `lw-integracao-reserva-so-estoque` com o evento de reserva, após o `api-locavia-web-ts` consumir essa informação deve ser enviado de volta para a fila a informação do processamento se houve erro ou sucesso e isso deve ser integrado novamente na API da Só Estqoue. 

- Na comunicação final com a Só Estoque é necessário realizar um retry automático com backoff limit. 