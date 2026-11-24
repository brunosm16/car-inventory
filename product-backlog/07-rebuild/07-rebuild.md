### Rebuild - Desmobilizações - Teste

- Crie a collection no locavia com os endpoints necessário para testar o fluxo de desmobilização, preciso começar o teste via API no LocaviaWeb, em ordem: 

1. Recuperar veículos disponíveis para venda. 
2. Colocar veículo na fila de integração. 


- Cria a collection no repositório de integração com os endpoints necessário para testar o fluxo de desmobilização, em ordem: 

1. Após o `api-locavia-web-ts` publicar a desmobilização do veículo na fila, o repositório de integração deve consumir, processar e enviar para a só estoque. 
2. Ao dar o get no repositório de integração deve ser retornado o veículo que foi enviado para a só estoque. 
