#### Recursos Expostos pela API 

Preciso que os endpoints da aplicação obedeçam o contrato da tabela abaixo, porém a nomenclatura precisa sempre estar em conformidade com o Inglês, lembre-se de expor os endpoints relacionados a operação, pois a Só Estoque irá recuperar o status da operação assíncrona na API de integração. 

| Recurso                      | Método | Descrição                                                                                                    |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `/healthcheck`               | `GET`  | Saúde da API e das dependências (DynamoDB, SQS).                                                             |
| `/auth`                      | `POST` | Autenticação da plataforma e emissão de token.                                                               |
| `/veiculos/{id}`             | `GET`  | Dados do veículo, FIPE, opcionais, dados de compra, dados de venda, tipo de utilização, reserva e pagamento. |
| `/veiculos/{id}/manutencoes` | `GET`  | Dados de OS e itens de OS.                                                                                   |
| `/veiculos`                  | `GET`  | Lista de veículos desmobilizados, lida do banco da integração.                                               |
| `/empresas/{id}`             | `GET`  | Dados da empresa.                                                                                            |
| `/reservas`                  | `POST` | Recebe reserva, persiste e publica em `locaviaweb-integracao-reserva-so-estoque`.                            |
| `/pagamentos`                | `POST` | Recebe pagamento, persiste e publica em `locaviaweb-integracao-pagamento-so-estoque`.                        |

Todos os GET leem do banco da integração (DynamoDB), nunca diretamente do Locavia Web