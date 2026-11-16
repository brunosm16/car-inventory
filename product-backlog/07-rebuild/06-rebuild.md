### Rebuild - Desmobilizações - Venda

- A API da Só Estoque irá disparar o endpoint de POST de venda para criar vendas no Locavia, dessa forma é necessário um endpoint de POST para /venda que atualiza a entidade de vendas/veículos do Dynamo e que chama a API do locavia para refletir a venda no banco do Locavia. Lembrando que para venda existe a necessidade de retorna sua respectiva associação ao veículo, em caso de atualizações advindas da Só Estoque é necessário realizar as operações de cancelamento, atualização de status no Dynamo e refletir via fila SQS no Locavia.

- A comunicação com o Locavia deve ser feito com fila devemos publicar na fila `lw-integracao-venda-so-estoque` com o evento de venda, após o `api-locavia-web-ts` consumir essa informação deve ser enviado de volta para a fila a informação do processamento se houve erro ou sucesso e isso deve ser integrado novamente na API da Só Estoque. 

- Na comunicação final com a Só Estoque é necessário realizar um retry automático com backoff limit. 