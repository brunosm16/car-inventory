### Rebuild - Desmobilizações - Produção Locavia

- No `api-locavia-web-ts` o usuário vai realizar ações de desmobilização do veículo essas ações já existem e não devem ser alterados hoje existe um fluxo de desmobilização completa, o que deve ser feito é criar usescases de gerenciador de desmobilização onde os veículos desmobilizados, aqueles disponibilizados para vendas, serão retornadas em um gerenciador e o usuário terá um endpoint para disponibilizar na fila de integração o veículo para Só Estoque, nessa ação a desmobilização será levada para `lw-integracao-desmobilizacao-so-estoque`, onde o `api-locaviaweb-car-inventory` consome as mensagens que estão na fila e integram no Só Estoque.

- Deve ser criado no `api-locavia-web-ts` os usecases para a mensagem do SQS de desmobilização com situação (Aberta, Cancelada, fechada), dados da manutençào, dados de desmobilização e reserva(nulo quando não existe reserva ainda para o determinado veículo).

- A reserva deve ser associada ao veículo desmobilizado quando houver reserva para o veículo, ou seja, se tem reserva tem que puxar as reservas associadas aos veículos. 