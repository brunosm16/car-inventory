#### Instruções 

- No projeto `api-locaviaweb-car-inventory` é necessário autenticar o repositório de integração com `api-locavia-web-ts` para que o repositório internet possua acesso interno a API do Locavia, porém a Só Estoque não irá prover um login, senha ou organização a autenticação deve ser interna entre  `api-locaviaweb-car-inventory` -> `api-locavia-web-ts` para isso deve-se criar um Usuário no Locavia específico para a integração `api-locaviaweb-car-inventory`, onde esse usuário será logado internamente no repositório para disparar as requisições necessárias para o `api-locavia-web-ts`.

- A criação do usuário deve ser feita diretamente no banco do Locavia, esse usuário deve ser recuperado e autenticado no repositório de integração. 