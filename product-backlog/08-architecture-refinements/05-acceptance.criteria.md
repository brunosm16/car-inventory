#### Critérios de Aceite 

Para finalizarmos, precisamos revalidar os critérios de aceite da aplicação

1.	Dado que a integração Só Estoque está habilitada, quando o usuário salva a configuração, então uma mensagem com os dados da empresa é publicada na fila de empresas e o webhook de empresa é disparado.
2.	Dado um veículo com desmobilização Aberta, Cancelada ou Fechada, quando a situação muda, então uma mensagem com veículo, desmobilização, manutenção, reserva e pagamento é publicada na fila de desmobilização.
3.	Dado uma mensagem de desmobilização consumida, quando a API processa, então o veículo é gravado no DynamoDB e o webhook é disparado para a plataforma.
4.	Dado um webhook disparado, quando a plataforma retorna 200 ou 201, então não há novas tentativas e o status fica "Enviado".
5.	Dado um webhook com erro, quando atinge X tentativas, então os reenvios param e o status fica "Falha", visível no gerenciador.
6.	Dado o gerenciador de veículos desmobilizados, quando o usuário clica em "Incluir na fila de integração", então a mensagem de desmobilização é republicada.
7.	Dado um POST /reservas válido, quando a API recebe, então a reserva é persistida, publicada na fila de reserva e criada no Locavia, aparecendo no cadastro do veículo.
8.	Dado um POST /pagamentos válido, quando a API recebe, então o pagamento é persistido, publicado na fila de pagamento e registrado no Locavia.
9.	Todos os GET retornam dados do DynamoDB da integração e exigem token obtido em /auth.
10.	Todo evento de entrada e saída gera registro no schema de logs de integração.
