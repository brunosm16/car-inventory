### 02-vehicles

1. Implementation

- Let's start with first entity of the integration: Vehicles. The endpoints for the entity is already implemented with mocked communication with Database, the idea right now is to communicate with the real database with the real business rules. 

- Start by defining a design-doc with draw.io diagrams, concise and direct similar to those defined in `Workspace/asaas-integration`. 

- The business rules for Vehicles must be aligned with what already exists in api-locavia-web-ts for Vehicles, you can reuse endpoints of `api-locavia-web-ts` to not reimplement existing logic. 

- Enqueue operations to ensure async processing, keep the pattern that already exist for POST, PUT, PATCH methods. 

- The authentication for `api-locavia-web-ts` is done via ENV, since the user will not login with a username and password this will be configured by Infra team with a default username, password and organization that will have access to all data in `api-locavia-web-ts`, the way authentication is going to happen still to be aligned but let's consider the username, password and organization will be set by default in ENV to authenticate. 

2. Validation 

- Implement integration and e2e tests. 
- Create a postman collection like it was in Asaas to test endpoints. 