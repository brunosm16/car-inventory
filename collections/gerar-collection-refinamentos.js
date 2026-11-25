// Gera a collection de reteste dos refinamentos de arquitetura (08-architecture-refinements):
//   node gerar-collection-refinamentos.js refinamentos-arquitetura-so-estoque.postman_collection.json
const fs = require('fs');
const crypto = require('crypto');
const {
  API_KEY,
  LOCAVIA_AUTH,
  SQS_JSON,
  aguardar,
  colecao,
  descricaoAmbiente,
  encerrarReserva,
  folder,
  ok,
  operacao,
  preparacao,
  req,
  reservar,
  salvarOperacao,
  situacaoDasFilas,
  variable,
  variaveisAmbiente,
  wait,
} = require('./postman-helpers');

const FILA_DESMOBILIZACAO = 'locaviaweb-integracao-desmobilizacao-so-estoque';
const SITUACOES = "['ABERTA', 'FECHADA', 'CANCELADA']";

/**
 * Operação de desmobilização: a integração só a registra quando consome a
 * mensagem, então 404 também é "ainda não chegou"
 */
function operacaoDesmobilizacao(name, variavel, esperado, asserts, description) {
  return req({
    name,
    method: 'GET',
    raw: `{{baseUrl}}/vehicles/operations/{{${variavel}}}`,
    description,
    headers: API_KEY,
    pre: wait(3000),
    test: [
      'const d = pm.response.code === 200 ? ((pm.response.json() || {}).data || {}) : {};',
      ...aguardar(
        "d.status === 'FINISHED' || d.status === 'ERROR'",
        [
          "const erro = d.lastError ? ' - ' + d.lastError.code + ': ' + d.lastError.message : '';",
          `pm.test('VEHICLE_DEMOBILIZATION ${esperado} (atual: ' + (d.status || pm.response.code) + erro + ')', () => {`,
          "  pm.expect(d.type).to.eql('VEHICLE_DEMOBILIZATION');",
          `  pm.expect(d.status).to.eql('${esperado}');`,
          '});',
          "pm.test('saída pela fila (direction OUTBOUND, channel SQS)', () => { pm.expect(d.direction).to.eql('OUTBOUND'); pm.expect(d.channel).to.eql('SQS'); });",
          `pm.test('idempotencyKey = VEHICLE_DEMOBILIZATION:<eventId>', () => pm.expect(d.idempotencyKey).to.eql('VEHICLE_DEMOBILIZATION:' + pm.collectionVariables.get('${variavel}')));`,
          "console.log((d.timeline || []).map((e) => e.step).join(' → '));",
          ...asserts,
          'console.log(d);',
        ],
        'a integração consumir a fila',
      ),
    ],
  });
}

/** Asserções do log de uma operação de entrada (reserva ou pagamento) terminada */
function logDeEntrada(tipo, evento, variavelRef) {
  return [
    "pm.test('entrada por HTTP (direction INBOUND, channel HTTP)', () => { pm.expect(d.direction).to.eql('INBOUND'); pm.expect(d.channel).to.eql('HTTP'); });",
    `pm.test('idempotencyKey = ${tipo}:<referência da Só Estoque>', () => pm.expect(d.idempotencyKey).to.eql('${tipo}:' + pm.collectionVariables.get('${variavelRef}')));`,
    "pm.test('result.action PUBLISHED', () => pm.expect((d.result || {}).action).to.eql('PUBLISHED'));",
    `pm.test('result.publication = mensagem ${evento} publicada ao Locavia', () => { pm.expect(d.result.publication.eventType).to.eql('${evento}'); pm.expect(d.result.publication.ReferenciaExterna).to.eql(pm.collectionVariables.get('${variavelRef}')); });`,
    `pm.test('result.request / result.response = webhook enviado e resposta da Só Estoque', () => { pm.expect(d.result.request.externalReference).to.eql(pm.collectionVariables.get('${variavelRef}')); pm.expect(d.result.response.httpStatus).to.be.within(200, 299); });`,
    "pm.test('sem próxima tentativa nem erro', () => { pm.expect(d.nextAttemptAt).to.be.undefined; pm.expect(d.lastError).to.be.undefined; });",
  ];
}

// ------------------------------------------------------------ collection
const descricao = [
  'Reteste dos refinamentos de arquitetura (`product-backlog/08-architecture-refinements`) nos dois projetos (api-locavia-web-ts e api-locaviaweb-car-inventory), numa collection só. Rode a collection inteira no **Runner** e na ordem: os passos assíncronos se repetem sozinhos até terminar (fora do Runner, envie de novo).',
  '',
  '1. Envio de desmobilização: mensagem completa (veículo, FIPE com valor, compra, venda, opcionais, empresa, alienação, última OS com itens), operação de saída e os novos `GET /vehicles/{id}` e `/maintenances`.',
  '2. Gerenciador de veículos desmobilizados (Locavia): filtro por placa, situação e período; "Incluir na fila" em lote com o `CodigoOperacao`; status da operação na integração.',
  '3. Reserva e pagamento: log de entrada (direction, channel, idempotencyKey `TIPO:id`, `result.action`, `request`, `response` e `publication`). Termina cancelando a reserva para liberar o veículo.',
  '4. Regras do log e valores enumerados: mensagem fora do contrato publicada direto na fila vira operação `ERROR` com categoria `VALIDATION` e destino `DELETE`, sem ir para a DLQ.',
  '5. Endpoints da API: `/healthcheck` (DynamoDB e SQS) e as validações dos endpoints novos.',
  '6. Situação das filas (nomes `locaviaweb-`).',
  '',
  ...descricaoAmbiente,
  '',
  'Antes de rodar:',
  '- recrie o LocalStack dos dois projetos (filas `locaviaweb-...` e índices novos da tabela de operações);',
  '- o veículo é o da primeira desmobilização disponível para venda (ou a do `codigoVeiculo` informado), à venda no Locavia (status 8 ou 13) e sem reserva ativa;',
  '- o valor FIPE só vem preenchido se a organização tiver InfoValor; sem ele, `valorFipe` é `null` e o teste aceita;',
  '- cada pasta roda sozinha: antes de cada requisição a collection renova os tokens e, se a placa estiver vazia, escolhe um veículo da integração sem reserva.',
  '',
  'Fora daqui (cobertos pelos testes unitários): cancelamento/substituição de operação pendente e encerramento em `ERROR` ao esgotar as 5 tentativas, que precisam de falha controlada do webhook.',
  '',
  'O fluxo termina com o veículo à venda e sem reserva: pode ser repetido.',
].join('\n');

const itens = [
  folder(
    '0 - Preparação',
    'Sessão no Locavia, health, healthcheck e token da integração.',
    preparacao([
      req({
        name: 'Integração - healthcheck',
        method: 'GET',
        raw: '{{baseUrl}}/healthcheck',
        description: 'Saúde da API e das dependências: DynamoDB e as filas SQS configuradas. 503 quando alguma está fora.',
        test: [
          ok(200),
          'const h = (pm.response.json() || {}).data || pm.response.json() || {};',
          "pm.test('UP', () => pm.expect(h.status).to.eql('UP'));",
          "pm.test('DynamoDB e filas checados', () => { const nomes = (h.dependencies || []).map((d) => d.name); pm.expect(nomes).to.include('dynamodb'); pm.expect(nomes.filter((n) => n.startsWith('sqs:'))).to.not.be.empty; });",
          "(h.dependencies || []).forEach((d) => pm.test(d.name + ' ' + d.status + ' (' + d.latencyMs + ' ms)' + (d.error ? ' - ' + d.error : ''), () => pm.expect(d.status).to.eql('UP')));",
        ],
      }),
    ]),
  ),
  folder('1 - Envio de desmobilização', 'Locavia → fila `locaviaweb-integracao-desmobilizacao-so-estoque` → integração (DynamoDB) → Só Estoque, com a mensagem completa.', [
    req({
      name: '1.1 Locavia - recuperar veículos disponíveis para venda',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      description: 'Desmobilizações com tipo de venda e veículo À venda ou em Perda total. Grava `codigoDesmobilizacao`, `codigoVeiculo` e `placa` do primeiro veículo sem reserva (ou do `codigoVeiculo` informado).',
      headers: LOCAVIA_AUTH,
      pre: [
        "const codigoVeiculo = pm.collectionVariables.get('codigoVeiculo');",
        "const filtro = { page: 1, limit: 20 };",
        'if (codigoVeiculo) filtro.CodigoVeiculo = [Number(codigoVeiculo)];',
        "pm.collectionVariables.set('filtroDesmobilizacoes', JSON.stringify(filtro));",
      ],
      body: '{{filtroDesmobilizacoes}}',
      test: [
        ok(200),
        'const items = ((pm.response.json() || {}).data || {}).items || [];',
        "pm.test('há desmobilização disponível para venda', () => pm.expect(items).to.not.be.empty);",
        'const item = items.find((i) => !i.DadosReserva);',
        "pm.test('há veículo sem reserva para o teste', () => pm.expect(item, 'todos com reserva: rode preparar-veiculos-a-venda.sql ou informe codigoVeiculo').to.be.an('object'));",
        'if (item) {',
        "  pm.collectionVariables.set('codigoDesmobilizacao', item.CodigoDesmobilizacao);",
        "  pm.collectionVariables.set('codigoVeiculo', item.CodigoVeiculo);",
        "  pm.collectionVariables.set('placa', item.Placa);",
        "  console.log('Desmobilização ' + item.CodigoDesmobilizacao + ' - veículo ' + item.CodigoVeiculo + ' ' + item.Placa);",
        '}',
      ],
    }),
    req({
      name: '1.2 Locavia - colocar veículo na fila de integração',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      description: 'Publica a mensagem e devolve o `CodigoOperacao` (= `eventId` = `operationId` na integração).',
      headers: LOCAVIA_AUTH,
      body: '{\n  "CodigoDesmobilizacao": [{{codigoDesmobilizacao}}]\n}',
      test: [
        ok(200),
        'const r = ((pm.response.json() || {}).data || [])[0] || {};',
        "pm.test('publicada na fila (' + r.Mensagem + ')', () => { pm.expect(r.Sucesso).to.eql(true); pm.expect(r.CodigoMensagemFila).to.be.a('string'); });",
        "pm.test('CodigoOperacao para acompanhar na integração', () => pm.expect(r.CodigoOperacao).to.be.a('string').and.not.empty);",
        "pm.collectionVariables.set('operationIdDesmobilizacao', r.CodigoOperacao);",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
    operacaoDesmobilizacao(
      '1.3 Integração - operação da desmobilização',
      'operationIdDesmobilizacao',
      'FINISHED',
      [
        "pm.test('result.action CREATED ou UPDATED', () => pm.expect(['CREATED', 'UPDATED']).to.include(d.result.action));",
        "pm.test('result.request = veículo enviado à Só Estoque', () => pm.expect(d.result.request.vehicle.placa).to.eql(pm.collectionVariables.get('placa')));",
        "pm.test('result.response = resposta da Só Estoque', () => pm.expect(d.result.response.httpStatus).to.be.within(200, 299));",
        "pm.test('result.publication só nas operações de entrada', () => pm.expect(d.result.publication).to.be.undefined);",
        "pm.test('sem próxima tentativa', () => pm.expect(d.nextAttemptAt).to.be.undefined);",
        "pm.test('timeline até a entrega à Só Estoque', () => pm.expect((d.timeline || []).map((e) => e.step)).to.include.members(['REQUESTED', 'PROCESSING', 'VEHICLE_SAVED', 'SO_ESTOQUE_NOTIFIED', 'FINISHED']));",
      ],
      'GET /vehicles/operations/{operationId} com o `CodigoOperacao` do 1.2. Esperado: `FINISHED`, saída pela fila, chave de idempotência `TIPO:eventId` e o webhook enviado/recebido no resultado.',
    ),
    req({
      name: '1.4 Só Estoque (mock) - veículo com a mensagem completa',
      method: 'GET',
      raw: '{{soEstoqueMockUrl}}/vehicle-notifications',
      description: 'Webhook recebido pela Só Estoque com os blocos novos: veículo, FIPE, compra, venda e a última OS com itens.',
      test: [
        ok(200),
        "const e = (pm.response.json() || []).filter((x) => x.eventId === pm.collectionVariables.get('operationIdDesmobilizacao')).pop();",
        ...aguardar(
          '!!e',
          [
            "pm.test('veículo entregue à Só Estoque', () => pm.expect(e, 'não entregue').to.be.an('object'));",
            'if (e) {',
            '  const m = e.vehicle.mensagem;',
            `  pm.test('situação em maiúsculas', () => pm.expect(${SITUACOES}).to.include(e.vehicle.situacao));`,
            "  pm.test('dadosVeiculo: cadastro, empresa, alienação e opcionais', () => { pm.expect(m.dadosVeiculo).to.include.keys('chassi', 'renavam', 'hodometro', 'anoFabricacao', 'anoModelo', 'marca', 'modelo', 'versao', 'cor', 'tipoCombustivel', 'numeroPortas', 'patio', 'status', 'codigoEmpresa', 'empresa', 'alienacaoFiduciaria'); pm.expect(m.dadosVeiculo.opcionais).to.be.an('array'); });",
            "  pm.test('dadosFipe: código, competência e valor', () => { pm.expect(m.dadosFipe).to.include.keys('codigoFipe', 'competenciaFipe', 'valorFipe'); pm.expect(m.dadosFipe.competenciaFipe).to.match(/^\\d{4}-\\d{2}$/); });",
            "  pm.test('dadosCompra e dadosVenda', () => { pm.expect(m.dadosCompra).to.include.keys('dataCompra', 'numeroNFCompra', 'fornecedor', 'cnpjFornecedor', 'valorCompra'); pm.expect(m.dadosVenda).to.include.keys('dataPrevistaVenda', 'valorPrevistoVenda', 'dataEntradaVenda', 'dataVenda', 'valorVenda', 'tipoMidia'); });",
            "  pm.test('dadosManutencao com a última OS', () => { pm.expect(m.dadosManutencao.ordensServico).to.be.an('array'); pm.expect(m.dadosManutencao).to.have.property('ultimaOrdemServico'); });",
            "  pm.test('reservas e pagamentos', () => { pm.expect(e.vehicle.reservas).to.be.an('array'); pm.expect(e.vehicle.pagamentos).to.be.an('array'); });",
            '  console.log(e);',
            '}',
          ],
          'a entrega à Só Estoque',
        ),
      ],
    }),
    req({
      name: '1.5 Integração - GET /vehicles/{id}',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}',
      description: 'Novo endpoint: o veículo do DynamoDB com o dicionário de dados completo, reservas e pagamentos.',
      headers: API_KEY,
      test: [
        ok(200),
        'const v = (pm.response.json() || {}).data || {};',
        "pm.test('veículo {{placa}}', () => { pm.expect(v.codigoVeiculo).to.eql(String(pm.collectionVariables.get('codigoVeiculo'))); pm.expect(v.placa).to.eql(pm.collectionVariables.get('placa')); });",
        `pm.test('situação em maiúsculas', () => pm.expect(${SITUACOES}).to.include(v.situacao));`,
        'const dv = v.mensagem.dadosVeiculo || {};',
        "pm.test('idLocadora (codigoEmpresa + empresa)', () => { pm.expect(dv.codigoEmpresa).to.be.a('string'); pm.expect(dv).to.have.property('empresa'); });",
        "pm.test('alienacaoFiduciaria false (o gerenciador só publica veículo não alienado)', () => pm.expect(dv.alienacaoFiduciaria).to.eql(false));",
        "pm.test('opcionais com tipo S/O/A', () => (dv.opcionais || []).forEach((o) => { pm.expect(o.codigoEquipamento).to.be.a('string'); pm.expect([null, 'S', 'O', 'A']).to.include(o.tipoEquipamento); }));",
        "pm.test('valor FIPE número ou nulo (sem cotação/InfoValor)', () => { const valor = v.mensagem.dadosFipe.valorFipe; pm.expect(valor === null || typeof valor === 'number').to.eql(true); if (valor !== null) pm.expect(valor).to.be.above(0); });",
        "pm.test('dataAtualizacaoLocavia', () => pm.expect(v.dataAtualizacaoLocavia).to.be.a('string'));",
        "pm.collectionVariables.set('ordensServico', String((v.mensagem.dadosManutencao.ordensServico || []).length));",
        'console.log(v);',
      ],
    }),
    req({
      name: '1.6 Integração - GET /vehicles/{id}/maintenances',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}/maintenances',
      description: 'Novo endpoint: ordens de serviço do veículo e a última OS (não cancelada) com fornecedor, valor total e itens.',
      headers: API_KEY,
      test: [
        ok(200),
        'const m = (pm.response.json() || {}).data || {};',
        "pm.test('ordens de serviço', () => pm.expect(m.ordensServico).to.be.an('array'));",
        'const u = m.ultimaOrdemServico;',
        'if (m.ordensServico.length) {',
        "  pm.test('última OS = a mais recente da lista', () => pm.expect(u.codigoOrdemServico).to.eql(m.ordensServico[0].codigoOrdemServico));",
        "  pm.test('última OS com fornecedor, valor total e itens', () => { pm.expect(u).to.include.keys('numeroOS', 'fornecedor', 'cnpjFornecedor', 'valorTotal', 'itens'); pm.expect(u.itens).to.be.an('array'); });",
        "  pm.test('itens numerados com tipo de serviço e de item', () => u.itens.forEach((item, i) => { pm.expect(item.numeroItem).to.eql(i + 1); pm.expect(item).to.include.keys('descricao', 'tipoManutencao', 'tipoItem', 'quantidade', 'valorUnitario', 'valorTotal'); }));",
        '} else {',
        "  pm.test('sem OS: ultimaOrdemServico nula', () => pm.expect(u).to.be.null);",
        '}',
        'console.log(m);',
      ],
    }),
    req({
      name: '1.7 Integração - filtro por situação aceita minúsculas',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles?situacao=aberta&placa={{placa}}',
      description: 'A situação passou a `ABERTA`/`FECHADA`/`CANCELADA`; o filtro aceita o valor em qualquer caixa.',
      headers: API_KEY,
      test: [
        ok(200),
        'const lista = (pm.response.json() || {}).data || [];',
        "pm.test('só ABERTA', () => lista.forEach((v) => pm.expect(v.situacao).to.eql('ABERTA')));",
      ],
    }),
  ]),
  folder('2 - Gerenciador de veículos desmobilizados', 'Tela do Locavia: listagem filtrável e "Incluir na fila de integração" (individual e em lote). O status da integração é consultado na API de integração pelo `CodigoOperacao`.', [
    req({
      name: '2.1 Locavia - filtro por placa (com máscara e minúsculas)',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      headers: LOCAVIA_AUTH,
      pre: [
        "const placa = pm.collectionVariables.get('placa') || '';",
        "pm.collectionVariables.set('placaComMascara', (placa.slice(0, 3) + '-' + placa.slice(3)).toLowerCase());",
      ],
      body: '{\n  "Placa": "{{placaComMascara}}",\n  "page": 1,\n  "limit": 20\n}',
      test: [
        ok(200),
        'const items = ((pm.response.json() || {}).data || {}).items || [];',
        "pm.test('encontrou a desmobilização da placa {{placa}}', () => pm.expect(items.map((i) => i.CodigoDesmobilizacao)).to.include(pm.collectionVariables.get('codigoDesmobilizacao')));",
        "pm.test('só a placa {{placa}}', () => items.forEach((i) => pm.expect(i.Placa).to.eql(pm.collectionVariables.get('placa'))));",
      ],
    }),
    req({
      name: '2.2 Locavia - filtro por situação e período',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      headers: LOCAVIA_AUTH,
      body: { Situacao: 'A', DataPrevisaoTerminoInicial: '2000-01-01', DataPrevisaoTerminoFinal: '2100-12-31', page: 1, limit: 20 },
      test: [
        ok(200),
        'const r = (pm.response.json() || {}).data || {};',
        "pm.test('só abertas', () => (r.items || []).forEach((i) => { pm.expect(i.IDSituacao).to.eql('A'); pm.expect(i.Situacao).to.eql('aberta'); }));",
        "pm.test('paginada', () => pm.expect(r.meta).to.include.keys('totalItems', 'currentPage', 'itemsPerPage'));",
      ],
    }),
    req({
      name: '2.3 Locavia - incluir na fila em lote',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      description: 'Lote com a desmobilização do teste e uma inexistente: resultado por item; só a publicada tem `CodigoOperacao`.',
      headers: LOCAVIA_AUTH,
      body: '{\n  "CodigoDesmobilizacao": [{{codigoDesmobilizacao}}, 999999999]\n}',
      test: [
        ok(200),
        'const lista = (pm.response.json() || {}).data || [];',
        "const publicada = lista.find((r) => r.CodigoDesmobilizacao === pm.collectionVariables.get('codigoDesmobilizacao')) || {};",
        "const inexistente = lista.find((r) => r.CodigoDesmobilizacao === '999999999') || {};",
        "pm.test('um resultado por item', () => pm.expect(lista).to.have.lengthOf(2));",
        "pm.test('desmobilização do teste publicada com CodigoOperacao', () => { pm.expect(publicada.Sucesso).to.eql(true); pm.expect(publicada.CodigoOperacao).to.be.a('string'); });",
        "pm.test('inexistente recusada sem CodigoOperacao', () => { pm.expect(inexistente.Sucesso).to.eql(false); pm.expect(inexistente.CodigoOperacao).to.be.undefined; });",
        "pm.collectionVariables.set('operationIdLote', publicada.CodigoOperacao);",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
    operacaoDesmobilizacao(
      '2.4 Integração - status da operação pelo CodigoOperacao',
      'operationIdLote',
      'FINISHED',
      ["pm.test('veículo já existia: result.action UPDATED', () => pm.expect(d.result.action).to.eql('UPDATED'));"],
      'O gerenciador acompanha o envio por `GET /vehicles/operations/{CodigoOperacao}`.',
    ),
  ]),
  folder('3 - Reserva e pagamento: log de entrada', 'Operações de entrada com os campos novos do log. Termina cancelando o pagamento e a reserva para liberar o veículo.', [
    reservar('3.1 Integração - reservar o veículo', 'refReserva'),
    operacao('3.2 Integração - operação de reserva', 'reservations', 'RESERVATION_CREATE', [
      "pm.collectionVariables.set('operationIdReserva', d.operationId);",
      ...logDeEntrada('RESERVATION_CREATE', 'reserva.criar', 'refReserva'),
    ]),
    req({
      name: '3.3 Integração - registrar pagamento da reserva',
      method: 'POST',
      raw: '{{baseUrl}}/payments',
      headers: API_KEY,
      pre: [
        "pm.collectionVariables.set('refPagamento', 'SE-PAG-' + Date.now());",
        "pm.collectionVariables.set('dataPagamento', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());",
      ],
      body: JSON.stringify(
        {
          referenciaExterna: '{{refPagamento}}',
          referenciaExternaReserva: '{{refReserva}}',
          valor: 5000,
          dataPagamento: '{{dataPagamento}}',
          formaPagamento: 'PIX',
        },
        null,
        2,
      ),
      test: salvarOperacao,
    }),
    operacao('3.4 Integração - operação de pagamento', 'payments', 'PAYMENT_REGISTER', logDeEntrada('PAYMENT_REGISTER', 'pagamento.registrar', 'refPagamento')),
    req({
      name: '3.5 Integração - veículo com a reserva e o pagamento',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}',
      headers: API_KEY,
      test: [
        ok(200),
        'const v = (pm.response.json() || {}).data || {};',
        "pm.test('reserva Ativa no veículo', () => pm.expect((v.reservas.find((r) => r.referenciaExterna === pm.collectionVariables.get('refReserva')) || {}).situacao).to.eql('Ativa'));",
        "pm.test('pagamento Pago no veículo', () => pm.expect((v.pagamentos.find((p) => p.referenciaExterna === pm.collectionVariables.get('refPagamento')) || {}).situacao).to.eql('Pago'));",
      ],
    }),
    req({
      name: '3.6 Integração - cancelar pagamento',
      method: 'POST',
      raw: '{{baseUrl}}/payments/{{refPagamento}}/cancellation',
      headers: API_KEY,
      body: { motivo: 'Estorno do sinal (reteste)' },
      test: salvarOperacao,
    }),
    operacao('3.7 Integração - operação de cancelamento do pagamento', 'payments', 'PAYMENT_CANCEL', [
      "pm.test('idempotencyKey = PAYMENT_CANCEL:<referência>', () => pm.expect(d.idempotencyKey).to.eql('PAYMENT_CANCEL:' + pm.collectionVariables.get('refPagamento')));",
    ]),
    encerrarReserva('3.8 Integração - cancelar a reserva (libera o veículo)', 'cancellation', 'refReserva', 'Fim do reteste'),
    operacao('3.9 Integração - operação de cancelamento da reserva', 'reservations', 'RESERVATION_CANCEL', [
      "pm.test('idempotencyKey = RESERVATION_CANCEL:<referência>', () => pm.expect(d.idempotencyKey).to.eql('RESERVATION_CANCEL:' + pm.collectionVariables.get('refReserva')));",
    ]),
  ]),
  folder('4 - Regras do log e valores enumerados', 'Mensagem fora do contrato publicada direto na fila de desmobilização (LocalStack): a integração descarta a mensagem e registra a operação em `ERROR`.', [
    req({
      name: '4.1 SQS - publicar desmobilização fora do contrato',
      method: 'POST',
      raw: '{{sqsUrl}}/',
      description: 'Situação `pendente` não existe no contrato: erro de validação.',
      headers: [...SQS_JSON, { key: 'X-Amz-Target', value: 'AmazonSQS.SendMessage', type: 'text' }],
      pre: [
        "const eventId = pm.variables.replaceIn('{{$guid}}');",
        "pm.collectionVariables.set('eventoInvalido', eventId);",
        'const mensagem = {',
        '  eventId,',
        "  eventType: 'desmobilizacao.disponibilizada',",
        '  occurredAt: new Date().toISOString(),',
        "  CodigoOrganizacao: '1',",
        "  CnpjOrganizacao: '00000000000000',",
        "  CodigoVeiculo: '999999999',",
        "  Placa: 'TST0V00',",
        "  Situacao: 'pendente',",
        '  Mensagem: {},',
        '};',
        `pm.collectionVariables.set('corpoSqs', JSON.stringify({ QueueUrl: pm.collectionVariables.get('sqsUrl') + '/000000000000/${FILA_DESMOBILIZACAO}', MessageBody: JSON.stringify(mensagem) }));`,
      ],
      body: '{{corpoSqs}}',
      test: [
        ok(200),
        "pm.test('publicada', () => pm.expect((pm.response.json() || {}).MessageId).to.be.a('string'));",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
    operacaoDesmobilizacao(
      '4.2 Integração - operação ERROR com erro de validação',
      'eventoInvalido',
      'ERROR',
      [
        "pm.test('ultimoErro.categoria VALIDATION, destino DELETE, sem nova tentativa', () => { pm.expect(d.lastError.category).to.eql('VALIDATION'); pm.expect(d.lastError.destination).to.eql('DELETE'); pm.expect(d.lastError.retryable).to.eql(false); });",
        "pm.test('encerrada (finishedAt) e sem próxima tentativa', () => { pm.expect(d.finishedAt).to.be.a('string'); pm.expect(d.nextAttemptAt).to.be.undefined; });",
        "pm.test('entrada recebida guardada no log', () => pm.expect(d.inputData.Situacao).to.eql('pendente'));",
      ],
      'A mensagem inválida vira operação já encerrada em `ERROR`, com o corpo recebido.',
    ),
    req({
      name: '4.3 SQS - mensagem inválida descartada (fora da DLQ)',
      method: 'POST',
      raw: '{{sqsUrl}}/',
      description: 'Erro de validação é descartado (`DELETE`): a DLQ da desmobilização continua sem a mensagem.',
      headers: [...SQS_JSON, { key: 'X-Amz-Target', value: 'AmazonSQS.ReceiveMessage', type: 'text' }],
      body: JSON.stringify({ QueueUrl: `{{sqsUrl}}/000000000000/${FILA_DESMOBILIZACAO}-dlq`, MaxNumberOfMessages: 10, VisibilityTimeout: 0 }),
      test: [
        ok(200),
        "const corpos = ((pm.response.json() || {}).Messages || []).map((m) => m.Body);",
        "pm.test('evento inválido não está na DLQ', () => pm.expect(corpos.some((b) => b.includes(pm.collectionVariables.get('eventoInvalido')))).to.eql(false));",
      ],
    }),
    req({
      name: '4.4 Integração - 404 operação de reserva pelo endpoint de veículos',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/operations/{{operationIdReserva}}',
      description: 'Cada recurso só responde as operações do seu tipo.',
      headers: API_KEY,
      test: [ok(404)],
    }),
  ]),
  folder('5 - Endpoints da API: validações', 'Respostas de erro dos endpoints novos e alterados; não alteram o fluxo.', [
    req({ name: '5.1 Integração - 401 GET /vehicles/{id} sem token', method: 'GET', raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}', test: [ok(401)] }),
    req({ name: '5.2 Integração - 404 veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/999999999', headers: API_KEY, test: [ok(404)] }),
    req({ name: '5.3 Integração - 400 código de veículo inválido', method: 'GET', raw: '{{baseUrl}}/vehicles/abc', headers: API_KEY, test: [ok(400)] }),
    req({ name: '5.4 Integração - 404 manutenção de veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/999999999/maintenances', headers: API_KEY, test: [ok(404)] }),
    req({ name: '5.5 Integração - 404 operação de veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/operations/00000000-0000-0000-0000-000000000000', headers: API_KEY, test: [ok(404)] }),
    req({ name: '5.6 Integração - 400 situação inválida', method: 'GET', raw: '{{baseUrl}}/vehicles?situacao=Vendida', headers: API_KEY, test: [ok(400)] }),
    req({ name: '5.7 Integração - 404 empresas (melhoria futura)', method: 'GET', raw: '{{baseUrl}}/companies/1', headers: API_KEY, test: [ok(404)] }),
    req({ name: '5.8 Locavia - 400 placa maior que 10 caracteres', method: 'POST', raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador', headers: LOCAVIA_AUTH, body: { Placa: 'ABCDEFGHIJK', page: 1, limit: 1 }, test: [ok(400)] }),
    req({ name: '5.9 Locavia - 400 incluir na fila sem desmobilização', method: 'POST', raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao', headers: LOCAVIA_AUTH, body: { CodigoDesmobilizacao: [] }, test: [ok(400)] }),
  ]),
  folder('6 - Situação das filas', 'Mensagens esperando, em processamento e na DLQ de cada fila `locaviaweb-...` do LocalStack (`sqsUrl`). Mensagem esperando = consumidor parado; em processamento por muito tempo = falha e nova tentativa; na DLQ = falhou 5 vezes (o corpo aparece no console).', situacaoDasFilas()),
];

const variaveis = [
  ...variaveisAmbiente(),
  variable('codigoVeiculo', '', 'Opcional: veículo do teste; vazio = primeira desmobilização disponível'),
  variable('cpfCliente', '52998224725', 'Cliente das reservas'),
  variable('locaviaToken', '', 'Gravado por 0 - Preparação'),
  variable('token', '', 'Gravado por 0 - Preparação'),
  variable('codigoDesmobilizacao', '', 'Gravado por 1.1'),
  variable('placa', '', 'Gravado por 1.1'),
  variable('filtroDesmobilizacoes', '', 'Montado por 1.1'),
  variable('operationIdDesmobilizacao', '', 'CodigoOperacao gravado por 1.2'),
  variable('ordensServico', '', 'Quantidade de OS do veículo, gravada por 1.5'),
  variable('placaComMascara', '', 'Montado por 2.1'),
  variable('operationIdLote', '', 'CodigoOperacao gravado por 2.3'),
  variable('refReserva', '', 'Gravado por 3.1'),
  variable('operationIdReserva', '', 'Gravado por 3.2'),
  variable('refPagamento', '', 'Gravado por 3.3'),
  variable('eventoInvalido', '', 'eventId da mensagem inválida, gravado por 4.1'),
  variable('corpoSqs', '', 'Montado por 4.1'),
  variable('dataExpiracao', '', 'Montado na reserva'),
  variable('dataPagamento', '', 'Montado no pagamento'),
  variable('operationId', '', 'Última operação assíncrona'),
  variable('tentativas', '0', 'Controle das consultas repetidas'),
];

const destino = process.argv[2];
if (!destino) throw new Error('Informe o arquivo de saída');
const idAtual = fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, 'utf8')).info._postman_id : undefined;
fs.writeFileSync(
  destino,
  JSON.stringify(colecao('Refinamentos de arquitetura Só Estoque - Locavia e Integração', descricao, itens, variaveis, idAtual || crypto.randomUUID()), null, 2) + '\n',
);
console.log('ok: ' + destino);
