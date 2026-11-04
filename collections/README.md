# collections

Coleções Postman/Insomnia para exercitar os endpoints da API do car-inventory (um arquivo por ambiente, ex.: `car-inventory-dev.postman_collection.json`, `car-inventory.postman_collection.json`).

| Arquivo | Uso |
| --- | --- |
| `02-vehicles-gerar-collection.cjs` | Gera `02-vehicles.postman_collection.json` com os dados do banco de dev do LocaviaWeb. Na raiz do `car-inventory`: `node collections/02-vehicles-gerar-collection.cjs` (usa o `.env` e os pacotes do `api-locaviaweb-car-inventory` ao lado; outro caminho em `CAR_INVENTORY_API_DIR`). A collection leva o `AUTH_CLIENT_SECRET` e não é versionada. |
| `02-vehicles-de-para.sql` | De/para do `GET /vehicles?page=1&limit=10` (e do `GET /vehicles/{id}`) com o SQL Server do LocaviaWeb: cada coluna tem o nome do campo no JSON. |
