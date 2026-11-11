Agora que temos a definição a definição de reserva de venda de veículos, vamos para a definição de vendas no repositório de integração, considerando que a Só Estoque dispara requisições de venda, precisamos implementar todo o fluxo de venda a partir da api de integração refletindo no `api-locavia-web-ts`.

É muito importante reutilizar o que já existe no `api-locavia-web-ts` para não termos retrabalho, porém aqui segue a mesma idea de termos um banco NoSQL DynamoDB armazenando tudo das operações com uma rastreabilidade completa e a operação refletindo no endpoint do `api-locavia-web-ts`. 

O fluxo deve seguir algo parecido com o de reserva onde os três repositórios devem manter-se sincronizados. 

### Output

- Design doc e diagramas para as soluções separando por repositório. 
- Testes unitários no `api-locavia-web-ts`.
- Testes unitários e de integração no `api-locaviaweb-car-inventory`.