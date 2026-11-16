### Rebuild - Reservas

- No `api-locavia-web-ts` o banco foi modelado como reserva venda e associada a venda, a entidade de reserva deve estar completamente desassociada de qualquer relação ou validação com venda a entidade de `Venda`, a entidade deve ser renomeada somente para `ReservaVeículo` sem qualquer referência ou relação com `Venda`, isso inclui os usecases. 

- É necessário adicionar no cadastro de veículo os dados da reserva assim como está no padrão do `api-locavia-web-ts` de relacionar as entidades nos usecases. 