## Objetivo

Permitir que cada locadora configure como seus veículos serão disponibilizados e reservados na Só Estoque e Locavia.

Como administrador da locadora
Quero habilitar a integração e definir os parâmetros de disponibilização, preço e reserva
Para adequar a integração ao processo de venda da minha locadora.

ATENÇÃO: AS ALTERAÇÕES DESTE BACKLOG DEVEM SER APENAS DE BACKEND O FRONTEND(FRONT-LOCAVIA-WEB-ANGULAR) NÃO DEVE SER ALTERADO!

Cenário 1 — Configuração dos parâmetros

    Locavia HUB >> Integrações >> Integração Só Estoque

    Guia Principal

        Empresa
        Ativo
        Endpoint API
        URL Webhook
        Chave

    Parâmetros

        Disponibilização dos veículos
            Validar status do veículo: selecionar os status que permitem a disponibilização, usando os status nativos do Locavia.
                Não exibir os status:
                    Perda total
                    Roubado
                    Sinistrado
                    Sub-locado devolvido
            Disponibilizar veículo na Só Estoque automaticamente: se não habilitar o envio automaticamente, os veículos devem ser enviados manualmente pelo gerenciador.
            Validar data prevista de venda: habilitado, deve verificar a data prevista para envio ao parceiro. Sem data, o veículo não é enviado.
            Antecedência: somente será habilitado se  campo anterior estiver habilitado. Se estiver nulo, o envio será realizado exatamente na data prevista da venda.

        Preço
            Permitir envio sem preço.

        Configuração de regras de venda
            % do preço previsto para venda aceito (margem de venda).
            Não permitir reserva abaixo do preço mínimo.
            Prazo para a locadora cancelar a reserva (dias úteis).

- Protótipo encontra-se em `Configuração Integração SóEstoque.html`

Cenário 2 — Exibir histórico da integração no cadastro de veículos


- Protótipo encontra-se em `Cadastro do Veículo — Histórico SóEstoque.html`

Regras gerais

    Ao ativar a integração, enviar os dados da empresa para a Só Estoque (aguardando api do Parceiro).
        Caso a integração esteja ativa, as alterações no cadastro da empresa devem ser enviadas para a Só Estoque.
        menu Sistema >> Segurança e Acesso >> Empresas
    Os parâmetros de 'Disponibilização dos veículos', irão impactar nos veículos que serão enviados para a Só Estoque  (aguardando api do Parceiro).
        Exibir informações da integração com a Só Estoque na aba de vendas no cadastro do veículo para exibir todo o histórico.
    Os parâmetros de 'Configuração de regras de venda' irão impactar na reserva dos veículos, quando o parceiro chamar a api do Locavia (https://dev.locaviaweb.com.br/car-inventory/docs#/reservations/ReservationsController_requestCreate)
    Atualizações dos parâmetros:
        As atualizações dos parâmetros devem refletir na Só Estoque. Ex.: Ao atualizar o % do preço previsto para venda (margem de venda), exibir mensagem de confirmação para o usuário que irá afetar todos os veículos enviados à So Estoque.
        Demais campos também devem enviar os veículos para a So Estoque, caso alguma alteração impacte, ex. marcar campo para disponibilizar o veículo automaticamente.
    Ao desativar a integração, todos os veículos devem ser desativados na Só Estoque
        Aguardando endpoint do parceiro

- Evento de Empresas: 

1. O fluxo de envio de dados de empresa ocorre em `Caso a integração esteja ativa, as alterações no cadastro da empresa devem ser enviadas para a Só Estoque. menu Sistema >> Segurança e Acesso >> Empresas`. Onde o Locavia salva os dados de integração para uma determinada empresa, em seguida publica o evento de alteração em uma fila e o projeto de integração `api-locaviaweb-car-inventory` consome esse evento de empresa. 

2. Ao consumir o evento de empresa o dado também é devidamente disponibilizado para a Só Estoque, assim como ocorre nos eventos de desmobilização, esses dados são mais dados que teremos integrados entre Locavia e Só Estoque passando pela integração de car-inventory. 

3. Nome da fila `locaviaweb-integracao-empresas-so-estoque`. 

4. Muito importante, o fluxo de empresas que você deve seguir é o seguinte -> `Fluxo_Integracao_Locavia_So_Estoque 2.pdf` nele possui o que é necessário no fluxo de empresas da integração. 

O dicionário de Empresas: 

Empresa (locadora)
Enviada pelo webhook de empresa e retornada em GET /empresas.
Grupo	Campo	Chave sugerida	Descrição	Exemplo	Observação
Identificação	ID Locadora	idLocadora	Identificador único da locadora no Locavia; chave com Veículo e OS	600	Chave estável para reconciliar envios; CNPJ não cobre matriz/filiais
Identificação	Razão Social	razaoSocial	Razão social registrada	Locadora Exemplo Ltda	
Identificação	Nome Fantasia	nomeFantasia	Nome comercial	Exemplo Rent a Car	
Identificação	CNPJ	cnpj	CNPJ da locadora	12345678000195	Texto, para manter zeros à esquerda
Endereço	CEP	cep	CEP	01310100	Necessário para frete e localização do estoque
Endereço	Logradouro	logradouro	Rua, avenida etc.	Av. Paulista	
Endereço	Número	numero	Número	1000	
Endereço	Complemento	complemento	Complemento	Conj. 52	
Endereço	Bairro	bairro	Bairro	Bela Vista	
Endereço	Cidade	cidade	Município	São Paulo	
Endereço	Código IBGE	codigoIbgeMunicipio	Código IBGE de 7 dígitos	3550308	Evita divergência de grafia da cidade
Endereço	Estado	uf	UF	SP	
Endereço	País	pais	País	Brasil	Definir se a plataforma espera nome ou código ISO
Contato	Telefone	telefone	Telefone com DDD	11999998888	
Contato	Contato	contatoNome	Nome do responsável	Maria Silva	
Contato	E-mail de Contato	contatoEmail	E-mail do responsável	contato@exemplo.com.br	
Status	Ativo	ativo	Locadora ativa na integração	true	
