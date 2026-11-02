### 01-initial-phase

Let's implement the initial phase of `api-locaviaweb-car-inventory`, a project that allows the management of car inventory in LocaviaWeb represented by repositories `api-locavia-web-ts` and `front-locavia-web-angular`, this project communicates with an external API called "Só Estoque". 


1. Project Setup 

- The project setup follows the same structure of `api-locaviaweb-integracao-asaas` a microservice that has DynamoDB, SQS. EKS, SQL Server and communication with `api-locavia-web-ts`. 

- The endpoints must follow CRUD patterns that has the mainly operations for car inventory management.  

- Arquitetura de integração Estoque-1 1.pdf is the architecture for the project. Also the contracts is in a Excel spreadsheet Campos_Integracao_So_Estoque.xlsx.

- The database for now is not USED, this is very important, in this initial-phase all the data from all endpoints are mock not with a real database everything is mocked. 

- The main goal here is to generate a Swagger that has the defined contract for the client that is going to used this API(api-locaviaweb-car-inventory).  

- Since the client is foreign the idea is to build a 100% English US project wih International support in portuguese-BR. 

- The initial commit from asaas project is 5ef11bc (origin/dev-inicial) Configurações inicias do projeto. You need to the same husky configuration and other configurations that are not defined in initial branch, also you need to exclude any reference to asaas. 

2. External API - "Só Estoque"

- Send and receive events. 
- Consult vehicles, reservations, register client reservation, cancellation and sells. 
- Update status and move vehicles. 
- Send inventory of vehicles. 
- Save client reservation data. 

- Consulta de veículos, reservas, cadastro do cliente de reserva, cancelamentos e vendas. 
- Atualização de status e movimentações de veículos. 
- Envio do estoque de veículos. 
- Salva os dados do cliente de reserva. 

3. Integration with `api-locavia-web-ts`

- The business rules, the database is based on what exists in `api-locavia-web-ts` so this project needs to start having in mind all of the business rules defined in `api-locavia-web-ts`, this new project do not exist by itself, the DynamoDB is a reflect from the SQL Server `api-locavia-web-ts`. 

- Events are sent to `api-locaviaweb-car-inventory` and queued in a SQS that process information that interacts directly with the main database of `api-locavia-web-ts` and that obeys to the rules defined in `api-locavia-web-ts`. 