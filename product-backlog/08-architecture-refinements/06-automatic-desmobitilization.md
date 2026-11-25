#### Desmobilização Automática 

- Temos um cenário onde a desmobilização ocorre manualmente, onde o usuário coloca o veículo na fila de integração, porém temos a necessidade de disponibilizar esse veículo para a Só Estoque de forma automática do `api-locavia-web-ts` para o `api-locaviaweb-car-inventory` onde o veículo é publicado na mesma fila de integração manual para processamento e posterior disponibilização na Só Estoque. 

- O fluxo automático segue o mesmo caminho do fluxo manual a diferença é que nos eventos de Aberta, Cancelada ou Fechada um evento precisa ser publicado na fila comunicando a desmobilização. 

- Usecase de envio de desmobilização (back): 
■	Publicar mensagem na fila de desmobilização sempre que a desmobilização mudar de situação: Aberta, Cancelada ou Fechada.
■	A mensagem leva: dados do veículo, dados da desmobilização, venda, fipe, compra e  dados da ultima  manutenção (OS e itens), reserva e pagamento existentes.
