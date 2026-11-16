### Instruções - Business Management

Após reunião com o cliente algumas alterações no projeto `api-locaviaweb-car-inventory` são necessárias e precisamos refinar determinados pontos que irão ficar detalhados abaixo e que precisam ser replanejados, melhorados ou implementados. A regra de negócio principal da aplicação foi alterada, nós não iremos fazer a gestão de reservas e vendas, tudo isso irá ficar do lado da Só Estoque o nosso papel aqui é sempre consumir a informação da Só Estoque que irá chegar via Webhook e termos um controle do nosso lado, então seguem as seguintes regras: 

- Só Estoque cria uma reserva ou venda -> Enviam a informação para nós através do webhook -> Consumimos a informação e criamos um controle do nosso lado relacionado a Reserva/Venda do Veículo sem fazer validações extras de regra de negócio, uma vez que o controle da reserva ou venda irá ficar do lado da Só Estoque mas precisamos registrar do nosso lado para garantir a persistência das informações entre os sistemas, a ponta final continua sendo o banco do Locavia.

- As regras de negócio de seminovos, de vendas, de reservas não devem ser validadas considerando o que já existe hoje no Locavia uma vez que essa operação de Reserva ou a operação de Venda irá partir da Só Estoque, será administrada por eles porém devemos manter os registros aqui para efeito de persistência entre integrações. 

- Os veículos usados para gestão de reserva e venda serão do Locavia, e todas as operação devem sempre serem persistidas no Locavia, refletindo as operações que ocorrem do lado da Só Estoque é estritamente proibido que ocorra uma falta de sincronização entre os produtos, ambos precisam estar alinhados com os dados refletido de forma igual. 

- Para operações relacionadas a reserva venda e outras operações que persistiam dados no Locavia, não modifique nada no `api-locavia-web-ts`, porém vamos considerar que a partir de agora o `api-locaviaweb-car-inventory` usa o banco do Locavia diretamente para persistir os dados necessários sem disparar endpoints no `api-locavia-web-ts`, as validações ocorrem no próprio projeto de integração. 
