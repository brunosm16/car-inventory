#### Envio de Desmobilização 

Os dados do veículo a serem enviados nos eventos de desmobilização são o seguinte: 

```
dados do veículo 
dados da desmobilização 
venda 
fipe 
compra 
dados da ultima  manutenção (OS e itens) 
reserva 
pagamento existentes
```

Os eventos de desmobilização em questão são: Aberta, Cancelada ou Fechada.

#### Gerenciador de Veículos Desmobilizados

As ações abaixo já foram implementadas mas preciso que você faça um double check para confirmar: 

- Endpoint de listagem paginada e filtrável (placa, situação da desmobilização, status da integração, período) 

- Ação "Incluir na fila de integração" (individual e em lote), que reenvia a mensagem de desmobilização.

#### Schemas Entidades

### **Schemas de Integração**

Os schemas da Integração já estão definidos porém quero ter uma dupla confirmação para garantir que tudo está devidamente mapeado, evite ao máximo modificar somente caso seja necessário para alinhar

| Schema                 | Finalidade                                       | Campos mínimos sugeridos                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logs de integração** | Rastrear cada evento e tentativa de integração.  | Ver seção "Schema de logs de integração" abaixo.                                                                                                                                                                                                        |
| **Veículos**           | Armazenar um snapshot do veículo desmobilizado.  | `veiculoId`, `empresaId`, `placa`, `chassi`, `renavam`, `dados do veículo`, `FIPE`, `opcionais`, `dados de compra`, `dados de venda`, `tipo de utilização`, `situação da desmobilização`, `manutenção (OS e itens)`, `statusIntegracao`, `atualizadoEm` |
| **Reservas**           | Armazenar as reservas recebidas da plataforma.   | `reservaId`, `veiculoId`, `empresaId`, `comprador`, `valor`, `status`, `dataReserva`, `recebidoEm`                                                                                                                                                      |
| **Pagamentos**         | Armazenar os pagamentos recebidos da plataforma. | `pagamentoId`, `reservaId`, `veiculoId`, `empresaId`, `valor`, `forma`, `status`, `dataPagamento`, `recebidoEm`                                                                                                                                         |

#### Valores dos Campos Enumerados

Atualmente temos a integração em conjunto com o api-locavia-web-ts com todos os eventos definidos, ações e está tudo perfeito porém tenho uma tabela do projeto referente aos valores dos campos entre os três projetos(api-locavia-web-ts, api-locaviaweb-car-inventory, api externa só estoque). Garante que os valores estejam sendo obedecidos. 

ATENCAO: faça o mínimo de ajuste, evite ao máximo ajustes, apenas faça aqueles que sejam os mais necessários possíveis.

| Campo                      | Valores                                                      | Quando usar                                                                                   |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **tipo**                   | `SO_ESTOQUE_ENVIAR_VEICULO`, `SO_ESTOQUE_ENVIAR_EMPRESA`     | Webhooks disparados para a plataforma a partir das filas de desmobilização e empresas.        |
| **tipo**                   | `SO_ESTOQUE_RECEBER_RESERVA`, `SO_ESTOQUE_RECEBER_PAGAMENTO` | `POST /reservas` e `POST /pagamentos` recebidos e publicados nas filas do Locavia.            |
| **direcao**                | `SAIDA`, `ENTRADA`                                           | `SAIDA` = API → plataforma; `ENTRADA` = plataforma → API.                                     |
| **status**                 | `PENDENTE`, `PROCESSANDO`, `SUCESSO`, `FALHA`, `CANCELADA`   | `FALHA` somente após esgotar `maxTentativas` ou ocorrer erro não retentável.                  |
| **situacaoDesmobilizacao** | `ABERTA`, `CANCELADA`, `FECHADA`                             | Situação que gerou a mensagem de desmobilização.                                              |
| **resultado.acao**         | `CRIADO`, `ATUALIZADO`, `PUBLICADO`, `IGNORADO`              | `IGNORADO` = evento duplicado identificado pela `idempotencyKey`.                             |
| **origem.canal**           | `SQS`, `HTTP`                                                | `SQS` para mensagens do Locavia; `HTTP` para chamadas da plataforma.                          |
| **ultimoErro.categoria**   | `NEGOCIO`, `VALIDACAO`, `INTEGRACAO`, `INFRA`                | `INTEGRACAO` = erro da plataforma (4xx/5xx, timeout).                                         |
| **ultimoErro.destino**     | `RETENTAR`, `DLQ`, `DESCARTAR`                               | `DLQ` ao esgotar tentativas; `DESCARTAR` para erros de validação.                             |
| **cancelamento.acao**      | `CANCELADA`, `SUBSTITUIDA`                                   | Operação pendente cancelada por desmobilização cancelada ou substituída por evento mais novo. |

#### Regras do Log 

Já existe uma camada para auditar, porém preciso da garantia de todas as regras, mais uma vez peço que faça o mínimo possível de ajuste, somente o necessário: 

■	idempotencyKey = tipo + idEvento da mensagem (saída) ou tipo + id da reserva/pagamento na plataforma (entrada). Evento repetido não cria nova operação.
■	Os webhooks param de tentar com 200 ou 201 (status SUCESSO) ou ao atingir maxTentativas (status FALHA, destino DLQ).
■	A cada tentativa: incrementar tentativas, atualizar ultimoErro, proximaTentativaEm e modificadoEm.
■	resultado.requisicao e resultado.resposta guardam o que foi enviado à plataforma e o que ela devolveu; resultado.publicacao só é preenchido nas operações de ENTRADA.
■	Uma desmobilização CANCELADA cancela a operação de envio ainda PENDENTE do mesmo veículo, registrando o vínculo em cancelamento.operacaoId.

#### Chaves Sugeridas do DynamoDB

O banco do DynamoDB já está devidamente modelado porém temos chaves sugeridas do DynamoDB, mais uma vez faça apenas o que é extremamente necessário, evite ao máximo mudanças bruscas no que foi implementado, implemente apenas o necessário. 

| Índice                  | Partition Key    | Sort Key             | Uso                                                       |
| ----------------------- | ---------------- | -------------------- | --------------------------------------------------------- |
| **Tabela**              | `operacaoId`     | —                    | Leitura direta da operação.                               |
| **GSI idempotencia**    | `idempotencyKey` | —                    | Evitar duplicidade.                                       |
| **GSI veiculo**         | `idVeiculo`      | `inseridoEm`         | Histórico de um veículo no gerenciador de desmobilizados. |
| **GSI locadora**        | `idLocadora`     | `inseridoEm`         | Operações por empresa e período.                          |
| **GSI reprocessamento** | `status`         | `proximaTentativaEm` | Buscar operações `PENDENTE` prontas para nova tentativa.  |

Definir o tempo de retenção dos logs (TTL) e o limite de tamanho de payload e corpo, já que um item do DynamoDB tem no máximo 400 KB.

#### Recursos Expostos pela API 


