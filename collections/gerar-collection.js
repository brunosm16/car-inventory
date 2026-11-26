// Gera a collection única do fluxo Locavia → Integração → Só Estoque:
//   node gerar-collection.js fluxo-completo-so-estoque.postman_collection.json
const fs = require('fs');
const crypto = require('crypto');
const {
  API_KEY,
  LOCAVIA_AUTH,
  SQS_JSON,
  aguardar,
  cliente,
  clienteNoLocavia,
  colecao,
  descricaoAmbiente,
  encerrarReserva,
  folder,
  notificacaoSoEstoque,
  ok,
  operacao,
  preparacao,
  req,
  reservaNaIntegracao,
  reservaNoLocavia,
  reservar,
  salvarOperacao,
  situacaoDasFilas,
  variable,
  variaveisAmbiente,
  veiculoNaIntegracao,
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

const chaveIdempotencia = (tipo, variavelRef) =>
  `pm.test('idempotencyKey = ${tipo}:<referência>', () => pm.expect(d.idempotencyKey).to.eql('${tipo}:' + pm.collectionVariables.get('${variavelRef}')));`;

// ------------------------------------------------------------ desmobilização automática
/** Guarda quantas entregas o mock já tem, para esperar só as que vierem depois da ação */
const marcarEntregas = [
  "pm.sendRequest(pm.collectionVariables.get('soEstoqueMockUrl') + '/vehicle-notifications', (erro, resposta) => {",
  "  let lista = [];",
  '  try { lista = resposta.json() || []; } catch (e) {}',
  "  pm.collectionVariables.set('entregasAntes', String(lista.length));",
  '});',
];

function acaoDesmobilizacao({ name, method = 'PUT', raw, body, description, situacao }) {
  return req({
    name,
    method,
    raw,
    description,
    headers: LOCAVIA_AUTH,
    body,
    pre: marcarEntregas,
    test: [
      'const r = pm.response.json() || {};',
      `pm.test('desmobilização ${situacao} no Locavia' + (r.erros ? ' - ' + JSON.stringify(r.erros) : ''), () => pm.expect(pm.response.code).to.eql(200));`,
      "pm.collectionVariables.set('tentativas', '0');",
    ],
  });
}

function eventoDesmobilizacao(name, situacao) {
  return req({
    name,
    method: 'GET',
    raw: '{{soEstoqueMockUrl}}/vehicle-notifications',
    description: `O Locavia publicou a desmobilização sozinho na fila; a integração consumiu, gravou e entregou \`vehicle.demobilization\` com o veículo \`${situacao}\`.`,
    pre: wait(3000),
    test: [
      ok(200),
      "const novas = (pm.response.json() || []).slice(Number(pm.collectionVariables.get('entregasAntes') || 0));",
      `const e = novas.filter((x) => x.vehicle && x.vehicle.placa === pm.collectionVariables.get('placa') && x.vehicle.situacao === '${situacao}').pop();`,
      ...aguardar(
        '!!e',
        [
          `pm.test('evento ${situacao} entregue à Só Estoque', () => pm.expect(e, 'não entregue: veja a pasta 8 - Situação das filas e o log do Locavia').to.be.an('object'));`,
          'if (e) {',
          "  pm.test('vehicle.demobilization da desmobilização ' + pm.collectionVariables.get('codigoDesmobilizacao'), () => {",
          "    pm.expect(e.event).to.eql('vehicle.demobilization');",
          "    pm.expect(String(e.vehicle.mensagem.dadosDesmobilizacao.codigoDesmobilizacao)).to.eql(String(pm.collectionVariables.get('codigoDesmobilizacao')));",
          '  });',
          "  pm.collectionVariables.set('operationId', e.eventId);",
          '  console.log(e);',
          '}',
        ],
        'o Locavia publicar e a integração entregar',
      ),
    ],
  });
}

const concluir = (name, description) =>
  acaoDesmobilizacao({
    name,
    raw: '{{locaviaUrl}}/desmobilizacoes/conclusao?CodigoDesmobilizacao={{codigoDesmobilizacao}}',
    description,
    situacao: 'fechada',
  });

const operacaoEvento = (name) =>
  operacaoDesmobilizacao(
    name,
    'operationId',
    'FINISHED',
    ["pm.test('timeline até a entrega à Só Estoque', () => pm.expect((d.timeline || []).map((e) => e.step)).to.include.members(['REQUESTED', 'PROCESSING', 'VEHICLE_SAVED', 'SO_ESTOQUE_NOTIFIED', 'FINISHED']));"],
    'GET /vehicles/operations/{eventId} do evento entregue. Esperado: `FINISHED`.',
  );

const desmobilizacaoAutomatica = [
  veiculoNaIntegracao(
    '5.1 Integração - desmobilização do veículo do teste',
    'Situação atual da desmobilização. Aberta: começa concluindo (5.2); fechada: vai direto para a reabertura (5.5).',
    [
      "pm.collectionVariables.set('codigoDesmobilizacao', v.mensagem.dadosDesmobilizacao.codigoDesmobilizacao);",
      "pm.test('desmobilização ' + v.situacao + ' (não cancelada)', () => pm.expect(['ABERTA', 'FECHADA']).to.include(v.situacao));",
      "if (v.situacao === 'FECHADA' && typeof postman !== 'undefined') postman.setNextRequest('5.5 Locavia - reabrir desmobilização');",
    ],
  ),
  concluir('5.2 Locavia - concluir desmobilização aberta', 'Só roda quando a desmobilização está aberta. Situação Fechada e veículo À venda (status 8); o Locavia publica a mudança depois do commit.'),
  eventoDesmobilizacao('5.3 Só Estoque (mock) - evento fechada', 'FECHADA'),
  operacaoEvento('5.4 Integração - operação do evento fechada'),
  acaoDesmobilizacao({
    name: '5.5 Locavia - reabrir desmobilização',
    raw: '{{locaviaUrl}}/desmobilizacoes/reabertura',
    description: 'Situação Aberta e veículo em Preparação Venda (status 11); o Locavia publica a mudança depois do commit.',
    body: '{\n  "CodigoDesmobilizacao": {{codigoDesmobilizacao}},\n  "Justificativa": "Teste da desmobilização automática"\n}',
    situacao: 'aberta',
  }),
  eventoDesmobilizacao('5.6 Só Estoque (mock) - evento aberta', 'ABERTA'),
  operacaoEvento('5.7 Integração - operação do evento aberta'),
  veiculoNaIntegracao('5.8 Integração - veículo com a desmobilização aberta', 'O DynamoDB reflete a reabertura.', [
    "pm.test('situação ABERTA', () => pm.expect(v.situacao).to.eql('ABERTA'));",
  ]),
  concluir('5.9 Locavia - concluir desmobilização (volta à venda)', 'Situação Fechada e veículo À venda de novo (status 8): o fluxo pode ser repetido.'),
  eventoDesmobilizacao('5.10 Só Estoque (mock) - evento fechada', 'FECHADA'),
  operacaoEvento('5.11 Integração - operação do evento fechada'),
  veiculoNaIntegracao('5.12 Integração - veículo com a desmobilização fechada', 'O DynamoDB reflete a conclusão.', [
    "pm.test('situação FECHADA', () => pm.expect(v.situacao).to.eql('FECHADA'));",
    "pm.test('mesma desmobilização', () => pm.expect(String(v.mensagem.dadosDesmobilizacao.codigoDesmobilizacao)).to.eql(String(pm.collectionVariables.get('codigoDesmobilizacao'))));",
  ]),
];

// ------------------------------------------------------------ collection
const descricao = [
  'Teste de ponta a ponta da integração com a Só Estoque, com os endpoints do Locavia (api-locavia-web-ts) e da integração (api-locaviaweb-car-inventory) numa collection só. Rode a collection inteira no **Runner** e na ordem: os passos assíncronos se repetem sozinhos até terminar (fora do Runner, envie de novo).',
  '',
  '1. Desmobilização: o Locavia publica o veículo, a integração consome, grava e envia para a Só Estoque com a mensagem completa (veículo, FIPE, compra, venda, opcionais, empresa, alienação, última OS com itens); `GET /vehicles/{id}` e `/maintenances`; gerenciador de veículos desmobilizados (filtros e "Incluir na fila" em lote com o `CodigoOperacao`).',
  '2. Reserva: criada, atualizada e cancelada pela integração; o Locavia processa pela fila e devolve o resultado. As operações conferem o log de entrada (direction, channel, idempotencyKey `TIPO:id`, `result.action`, `request`, `response` e `publication`).',
  '3. Reserva retirada.',
  '4. Pagamento: reserva + pagamento da reserva (o Locavia grava em PagamentosReservaVeiculo, ligado à reserva e ao veículo) + cancelamento do pagamento; a reserva é cancelada no fim.',
  '5. Desmobilização automática: reabrir e concluir a desmobilização no Locavia publicam o veículo na fila sozinhos (sem a disponibilização manual), e a integração entrega cada mudança à Só Estoque.',
  '6. Regras do log: mensagem fora do contrato publicada direto na fila vira operação `ERROR` com categoria `VALIDATION` e destino `DELETE`, sem ir para a DLQ.',
  '7. Validações e 8. Situação das filas (esperando, em processamento e DLQ).',
  '',
  ...descricaoAmbiente,
  '',
  'Antes de rodar: recrie o LocalStack dos dois projetos (filas `locaviaweb-...` e índices da tabela de operações).',
  '',
  'Dados:',
  '- o valor FIPE só vem preenchido se a organização tiver InfoValor; sem ele, `valorFipe` é `null` e o teste aceita;',
  '- `locaviaSenha` e `clientSecret` vêm preenchidos com os valores do `.env` local; troque se o seu ambiente for outro;',
  '- o veículo é o da primeira desmobilização disponível para venda (ou a do `codigoVeiculo` informado); ele precisa estar à venda no Locavia (status 8 ou 13) e sem reserva ativa;',
  '- 2.1 reserva com um cliente que não existe no Locavia (CPF novo a cada execução): o Locavia cadastra o cliente como lojista (conferido em 2.4a); as reservas seguintes usam o mesmo cliente, já existente.',
  '',
  '- cada pasta roda sozinha: antes de cada requisição a collection faz login no Locavia e pega o token da integração quando faltam ou venceram e, se a placa estiver vazia, escolhe um veículo da integração sem reserva (por exemplo, a pasta 4 pode ser rodada direto).',
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
  folder('1 - Desmobilização', 'Locavia → fila `locaviaweb-integracao-desmobilizacao-so-estoque` → integração (DynamoDB) → Só Estoque, com a mensagem completa; depois o gerenciador de veículos desmobilizados do Locavia.', [
    req({
      name: '1.1 Locavia - recuperar veículos disponíveis para venda',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      description: 'Desmobilizações com tipo de venda e veículo À venda ou em Perda total (só essas podem ir para a Só Estoque). Grava `codigoDesmobilizacao`, `codigoVeiculo` e `placa` do primeiro veículo sem reserva (ou do `codigoVeiculo` informado).',
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
        "  pm.collectionVariables.set('situacaoDesmobilizacao', item.IDSituacao);",
        "  pm.collectionVariables.set('dataPrevisaoTermino', String((item.DadosDesmobilizacao || {}).DataPrevisaoTermino || '').slice(0, 10));",
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
      description: 'Webhook `vehicle.demobilization` recebido pela Só Estoque: veículo, FIPE, compra, venda, desmobilização e a última OS com itens.',
      test: [
        ok(200),
        "const e = (pm.response.json() || []).filter((x) => x.eventId === pm.collectionVariables.get('operationIdDesmobilizacao')).pop();",
        ...aguardar(
          '!!e',
          [
            "pm.test('veículo entregue à Só Estoque', () => pm.expect(e, 'não entregue').to.be.an('object'));",
            'if (e) {',
            '  const m = e.vehicle.mensagem;',
            "  pm.test('evento vehicle.demobilization', () => pm.expect(e.event).to.eql('vehicle.demobilization'));",
            `  pm.test('situação em maiúsculas', () => pm.expect(${SITUACOES}).to.include(e.vehicle.situacao));`,
            "  pm.test('desmobilização do teste', () => pm.expect(String(m.dadosDesmobilizacao.codigoDesmobilizacao)).to.eql(String(pm.collectionVariables.get('codigoDesmobilizacao'))));",
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
      description: 'O veículo do DynamoDB com o dicionário de dados completo, reservas e pagamentos.',
      headers: API_KEY,
      test: [
        ok(200),
        'const v = (pm.response.json() || {}).data || {};',
        "pm.test('veículo {{placa}}', () => { pm.expect(v.codigoVeiculo).to.eql(String(pm.collectionVariables.get('codigoVeiculo'))); pm.expect(v.placa).to.eql(pm.collectionVariables.get('placa')); });",
        `pm.test('situação em maiúsculas', () => pm.expect(${SITUACOES}).to.include(v.situacao));`,
        "pm.test('desmobilização do teste', () => pm.expect(String(v.mensagem.dadosDesmobilizacao.codigoDesmobilizacao)).to.eql(String(pm.collectionVariables.get('codigoDesmobilizacao'))));",
        "pm.test('reservas e pagamentos', () => { pm.expect(v.reservas).to.be.an('array'); pm.expect(v.pagamentos).to.be.an('array'); });",
        'const dv = v.mensagem.dadosVeiculo || {};',
        "pm.test('idLocadora (codigoEmpresa + empresa)', () => { pm.expect(dv.codigoEmpresa).to.be.a('string'); pm.expect(dv).to.have.property('empresa'); });",
        "pm.test('alienacaoFiduciaria false (o gerenciador só publica veículo não alienado)', () => pm.expect(dv.alienacaoFiduciaria).to.eql(false));",
        "pm.test('opcionais com tipo S/O/A', () => (dv.opcionais || []).forEach((o) => { pm.expect(o.codigoEquipamento).to.be.a('string'); pm.expect([null, 'S', 'O', 'A']).to.include(o.tipoEquipamento); }));",
        "pm.test('valor FIPE número ou nulo (sem cotação/InfoValor)', () => { const valor = v.mensagem.dadosFipe.valorFipe; pm.expect(valor === null || typeof valor === 'number').to.eql(true); if (valor !== null) pm.expect(valor).to.be.above(0); });",
        "pm.test('dataAtualizacaoLocavia', () => pm.expect(v.dataAtualizacaoLocavia).to.be.a('string'));",
        "if (v.situacao) pm.collectionVariables.set('situacaoVeiculo', v.situacao);",
        'console.log(v);',
      ],
    }),
    req({
      name: '1.6 Integração - GET /vehicles/{id}/maintenances',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}/maintenances',
      description: 'Ordens de serviço do veículo e a última OS (não cancelada) com fornecedor, valor total e itens.',
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
      raw: '{{baseUrl}}/vehicles?situacao={{situacaoMinuscula}}&placa={{placa}}',
      description: 'A situação é `ABERTA`/`FECHADA`/`CANCELADA`; o filtro aceita o valor em qualquer caixa. Filtra pela situação do veículo do teste (gravada no 1.5) em minúsculas.',
      headers: API_KEY,
      pre: ["pm.collectionVariables.set('situacaoMinuscula', String(pm.collectionVariables.get('situacaoVeiculo') || 'ABERTA').toLowerCase());"],
      test: [
        ok(200),
        'const lista = (pm.response.json() || {}).data || [];',
        "const esperada = String(pm.collectionVariables.get('situacaoMinuscula')).toUpperCase();",
        "pm.test('veículo {{placa}} encontrado com situacao=' + pm.collectionVariables.get('situacaoMinuscula'), () => pm.expect(lista.map((v) => v.placa)).to.include(pm.collectionVariables.get('placa')));",
        "pm.test('só ' + esperada, () => lista.forEach((v) => pm.expect(v.situacao).to.eql(esperada)));",
      ],
    }),
    req({
      name: '1.8 Locavia - gerenciador: filtro por placa',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      headers: LOCAVIA_AUTH,
      body: { Placa: 'KHP0394', page: 1, limit: 20 },
      test: [
        ok(200),
        'const items = ((pm.response.json() || {}).data || {}).items || [];',
        "pm.test('encontrou a placa KHP0394', () => pm.expect(items).to.not.be.empty);",
        "pm.test('só a placa KHP0394', () => items.forEach((i) => pm.expect(i.Placa).to.eql('KHP0394')));",
      ],
    }),
    req({
      name: '1.9 Locavia - gerenciador: filtro por situação e período',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador',
      description: 'Filtra pela situação e pela data de previsão de término da desmobilização do teste (gravadas no 1.1): ela tem de aparecer no resultado.',
      headers: LOCAVIA_AUTH,
      pre: [
        "const filtro = { Situacao: pm.collectionVariables.get('situacaoDesmobilizacao'), page: 1, limit: 100 };",
        "const data = pm.collectionVariables.get('dataPrevisaoTermino');",
        'if (data) { filtro.DataPrevisaoTerminoInicial = data; filtro.DataPrevisaoTerminoFinal = data; }',
        "else console.warn('Desmobilização sem DataPrevisaoTermino: filtro só por situação');",
        "pm.collectionVariables.set('filtroSituacaoPeriodo', JSON.stringify(filtro));",
      ],
      body: '{{filtroSituacaoPeriodo}}',
      test: [
        ok(200),
        'const r = (pm.response.json() || {}).data || {};',
        'const items = r.items || [];',
        "const situacao = pm.collectionVariables.get('situacaoDesmobilizacao');",
        "const data = pm.collectionVariables.get('dataPrevisaoTermino');",
        "pm.test('desmobilização do teste encontrada', () => pm.expect(items.map((i) => String(i.CodigoDesmobilizacao))).to.include(String(pm.collectionVariables.get('codigoDesmobilizacao'))));",
        "pm.test('só situação ' + situacao, () => items.forEach((i) => pm.expect(i.IDSituacao).to.eql(situacao)));",
        "if (data) pm.test('só previsão de término em ' + data, () => items.forEach((i) => pm.expect(String(i.DadosDesmobilizacao.DataPrevisaoTermino).slice(0, 10)).to.eql(data)));",
        "pm.test('paginada', () => pm.expect(r.meta).to.include.keys('totalItems', 'currentPage', 'itemsPerPage'));",
      ],
    }),
    req({
      name: '1.10 Locavia - gerenciador: incluir na fila em lote',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      description: 'Lote com a desmobilização do teste e uma inexistente: resultado por item; só a publicada tem `CodigoOperacao`.',
      headers: LOCAVIA_AUTH,
      body: '{\n  "CodigoDesmobilizacao": [{{codigoDesmobilizacao}}, 999999999]\n}',
      test: [
        ok(200),
        'const lista = (pm.response.json() || {}).data || [];',
        "const publicada = lista.find((r) => String(r.CodigoDesmobilizacao) === String(pm.collectionVariables.get('codigoDesmobilizacao'))) || {};",
        "const inexistente = lista.find((r) => String(r.CodigoDesmobilizacao) === '999999999') || {};",
        "pm.test('um resultado por item', () => pm.expect(lista).to.have.lengthOf(2));",
        "pm.test('desmobilização do teste publicada com CodigoOperacao', () => { pm.expect(publicada.Sucesso).to.eql(true); pm.expect(publicada.CodigoOperacao).to.be.a('string'); });",
        "pm.test('inexistente recusada sem CodigoOperacao', () => { pm.expect(inexistente.Sucesso).to.eql(false); pm.expect(inexistente.CodigoOperacao).to.be.undefined; });",
        "pm.collectionVariables.set('operationIdLote', publicada.CodigoOperacao);",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
    operacaoDesmobilizacao(
      '1.11 Integração - status da operação pelo CodigoOperacao',
      'operationIdLote',
      'FINISHED',
      ["pm.test('veículo já existia: result.action UPDATED', () => pm.expect(d.result.action).to.eql('UPDATED'));"],
      'O gerenciador acompanha o envio por `GET /vehicles/operations/{CodigoOperacao}`.',
    ),
  ]),
  folder('2 - Reserva: criar, atualizar e cancelar', 'Integração → fila `locaviaweb-integracao-reserva-so-estoque` → Locavia → `-retorno` → integração → Só Estoque. A reserva é feita com um cliente novo (CPF gerado a cada execução), que o Locavia cadastra como lojista.', [
    reservar('2.1 Só Estoque - reservar com cliente que não existe no Locavia', 'refReserva', true),
    operacao('2.2 Integração - operação de reserva', 'reservations', 'RESERVATION_CREATE', [
      "if (d.result && d.result.reservationId) pm.collectionVariables.set('codigoReserva', d.result.reservationId);",
      "pm.collectionVariables.set('operationIdReserva', d.operationId);",
      ...logDeEntrada('RESERVATION_CREATE', 'reserva.criar', 'refReserva'),
    ]),
    req({
      name: '2.3a Integração - 409 segunda reserva do mesmo veículo',
      method: 'POST',
      raw: '{{baseUrl}}/reservations',
      description: 'O veículo já está reservado: a integração recusa na hora, sem enviar ao Locavia.',
      headers: API_KEY,
      pre: ["pm.collectionVariables.set('refDuplicada', 'SE-RES-DUP-' + Date.now());"],
      body: JSON.stringify({ referenciaExterna: '{{refDuplicada}}', placa: '{{placa}}', dataExpiracao: '{{dataExpiracao}}', valorAcordado: 70000, cliente }, null, 2),
      test: [ok(409), "pm.test('mensagem cita a reserva vigente', () => pm.expect(pm.response.text()).to.include(pm.collectionVariables.get('refReserva')));"],
    }),
    reservaNaIntegracao('2.3 Integração - reserva com o veículo', 'refReserva', 'Ativa', [
      "pm.test('código da reserva no Locavia', () => pm.expect(r.codigoReserva).to.eql(pm.collectionVariables.get('codigoReserva')));",
      "pm.test('cliente do Locavia na reserva', () => pm.expect(r.codigoCliente).to.be.a('number'));",
      "pm.collectionVariables.set('codigoCliente', String(r.codigoCliente));",
    ]),
    reservaNoLocavia('2.4 Locavia - conferir reserva criada', 'refReserva', 'A'),
    clienteNoLocavia('2.4a Locavia - cliente cadastrado como lojista', 'O Locavia não tinha o CPF e cadastrou o cliente como lojista ao processar a reserva.', [
      "pm.test('cliente criado com o CPF da reserva', () => pm.expect(clientes).to.have.lengthOf(1));",
      'const cliente = clientes[0] || {};',
      "pm.test('lojista', () => pm.expect(cliente.Lojista).to.eql('S'));",
      "pm.test('mesmo cliente da reserva (' + cliente.CodigoCliente + ')', () => pm.expect(String(cliente.CodigoCliente)).to.eql(pm.collectionVariables.get('codigoCliente')));",
    ]),
    notificacaoSoEstoque('2.5 Só Estoque (mock) - reserva criada', 'reservation-notifications', 'refReserva', 'reservation.create', [
      "pm.test('reserva Ativa', () => pm.expect(e.reservation.situacao).to.eql('Ativa'));",
    ]),
    veiculoNaIntegracao('2.6 Integração - veículo com a reserva', 'O veículo mostra a reserva que o segura no Locavia.', [
      "pm.test('dadosReserva = reserva ativa', () => pm.expect(v.mensagem.dadosReserva.codigoReserva).to.eql(pm.collectionVariables.get('codigoReserva')));",
      "pm.test('reserva na lista do veículo', () => pm.expect(v.reservas.map((x) => x.referenciaExterna)).to.include(pm.collectionVariables.get('refReserva')));",
    ]),
    req({
      name: '2.7 Integração - atualizar valor da reserva',
      method: 'PUT',
      raw: '{{baseUrl}}/reservations/{{refReserva}}',
      headers: API_KEY,
      body: { valorAcordado: 68000 },
      test: [ok(200), ...salvarOperacao.slice(1)],
    }),
    operacao('2.8 Integração - operação de atualização', 'reservations', 'RESERVATION_UPDATE'),
    reservaNaIntegracao('2.9 Integração - reserva atualizada', 'refReserva', 'Ativa', [
      "pm.test('valor 68000', () => pm.expect(r.valorAcordado).to.eql(68000));",
    ]),
    encerrarReserva('2.10 Integração - cancelar reserva', 'cancellation', 'refReserva', 'Cliente desistiu (teste)'),
    operacao('2.11 Integração - operação de cancelamento', 'reservations', 'RESERVATION_CANCEL', [chaveIdempotencia('RESERVATION_CANCEL', 'refReserva')]),
    reservaNaIntegracao('2.12 Integração - reserva cancelada', 'refReserva', 'Cancelada', [
      "pm.test('motivo', () => pm.expect(r.motivo).to.eql('Cliente desistiu (teste)'));",
    ]),
    reservaNoLocavia('2.13 Locavia - conferir reserva cancelada', 'refReserva', 'C'),
    notificacaoSoEstoque('2.14 Só Estoque (mock) - reserva cancelada', 'reservation-notifications', 'refReserva', 'reservation.cancel'),
    veiculoNaIntegracao('2.15 Integração - veículo liberado', 'Sem reserva segurando o veículo.', [
      "pm.test('dadosReserva nulo', () => pm.expect(v.mensagem.dadosReserva).to.be.null);",
    ]),
  ]),
  folder('3 - Reserva: retirar', 'Nova reserva retirada pelo lojista.', [
    reservar('3.1 Integração - reservar o veículo', 'refReservaRetirada'),
    operacao('3.2 Integração - operação de reserva', 'reservations', 'RESERVATION_CREATE'),
    encerrarReserva('3.3 Integração - retirar reserva', 'withdrawal', 'refReservaRetirada', 'Lojista retirou (teste)'),
    operacao('3.4 Integração - operação de retirada', 'reservations', 'RESERVATION_WITHDRAW'),
    reservaNaIntegracao('3.5 Integração - reserva retirada', 'refReservaRetirada', 'Retirada'),
    reservaNoLocavia('3.6 Locavia - conferir reserva retirada', 'refReservaRetirada', 'R'),
    notificacaoSoEstoque('3.7 Só Estoque (mock) - reserva retirada', 'reservation-notifications', 'refReservaRetirada', 'reservation.withdraw'),
  ]),
  folder('4 - Pagamento da reserva: registrar e cancelar', 'Integração → fila `locaviaweb-integracao-pagamento-so-estoque` → Locavia (grava em PagamentosReservaVeiculo, ligado à reserva e ao veículo) → `-retorno` → integração → Só Estoque. Termina cancelando a reserva para liberar o veículo.', [
    reservar('4.1 Integração - reservar o veículo', 'refReservaPagamento'),
    operacao('4.2 Integração - operação de reserva', 'reservations', 'RESERVATION_CREATE'),
    req({
      name: '4.3 Integração - registrar pagamento da reserva',
      method: 'POST',
      raw: '{{baseUrl}}/payments',
      description: 'Pagamento feito na Só Estoque: a integração grava pendente e publica `pagamento.registrar` com o `CodigoReserva` e o veículo da reserva.',
      headers: API_KEY,
      pre: [
        "pm.collectionVariables.set('refPagamento', 'SE-PAG-' + Date.now());",
        "pm.collectionVariables.set('dataPagamento', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());",
      ],
      body: JSON.stringify(
        {
          referenciaExterna: '{{refPagamento}}',
          referenciaExternaReserva: '{{refReservaPagamento}}',
          valor: 5000,
          dataPagamento: '{{dataPagamento}}',
          formaPagamento: 'PIX',
        },
        null,
        2,
      ),
      test: salvarOperacao,
    }),
    operacao('4.4 Integração - operação de pagamento', 'payments', 'PAYMENT_REGISTER', [
      "if (d.result && d.result.paymentId) pm.collectionVariables.set('codigoPagamento', d.result.paymentId);",
      ...logDeEntrada('PAYMENT_REGISTER', 'pagamento.registrar', 'refPagamento'),
    ]),
    req({
      name: '4.5 Integração - pagamento com a reserva e o veículo',
      method: 'GET',
      raw: '{{baseUrl}}/payments/{{refPagamento}}',
      headers: API_KEY,
      test: [
        ok(200),
        'const g = (pm.response.json() || {}).data || {};',
        "pm.test('pagamento Pago no Locavia (' + g.codigoPagamento + ')', () => pm.expect(g.situacao).to.eql('Pago'));",
        "pm.test('valor, data e forma de pagamento', () => { pm.expect(g.valor).to.eql(5000); pm.expect(g.formaPagamento).to.eql('PIX'); pm.expect(g.dataPagamento).to.be.a('string'); });",
        "pm.test('ligado à reserva e ao veículo', () => { pm.expect(g.reserva.referenciaExterna).to.eql(pm.collectionVariables.get('refReservaPagamento')); pm.expect(g.reserva.codigoReserva).to.be.a('string'); pm.expect(g.veiculo.placa).to.eql(pm.collectionVariables.get('placa')); });",
        'console.log(g);',
      ],
    }),
    notificacaoSoEstoque('4.6 Só Estoque (mock) - pagamento registrado', 'payment-notifications', 'refPagamento', 'payment.register', [
      "pm.test('pagamento Pago', () => pm.expect(e.payment.situacao).to.eql('Pago'));",
    ]),
    veiculoNaIntegracao('4.7 Integração - veículo com o pagamento', 'O pagamento aparece no veículo, com a reserva paga.', [
      "const pagamento = v.pagamentos.find((x) => x.referenciaExterna === pm.collectionVariables.get('refPagamento')) || {};",
      "pm.test('pagamento Pago no veículo', () => pm.expect(pagamento.situacao).to.eql('Pago'));",
      "pm.test('da reserva ' + pm.collectionVariables.get('refReservaPagamento'), () => pm.expect(pagamento.referenciaExternaReserva).to.eql(pm.collectionVariables.get('refReservaPagamento')));",
    ]),
    reservaNaIntegracao('4.8 Integração - reserva continua ativa', 'refReservaPagamento', 'Ativa'),
    req({
      name: '4.9 Integração - cancelar pagamento',
      method: 'POST',
      raw: '{{baseUrl}}/payments/{{refPagamento}}/cancellation',
      headers: API_KEY,
      body: { motivo: 'Estorno do sinal (teste)' },
      test: salvarOperacao,
    }),
    operacao('4.10 Integração - operação de cancelamento do pagamento', 'payments', 'PAYMENT_CANCEL', [chaveIdempotencia('PAYMENT_CANCEL', 'refPagamento')]),
    req({
      name: '4.11 Integração - pagamento cancelado',
      method: 'GET',
      raw: '{{baseUrl}}/payments/{{refPagamento}}',
      headers: API_KEY,
      test: [
        ok(200),
        'const g = (pm.response.json() || {}).data || {};',
        "pm.test('pagamento Cancelado com o motivo', () => { pm.expect(g.situacao).to.eql('Cancelado'); pm.expect(g.motivo).to.eql('Estorno do sinal (teste)'); pm.expect(g.dataCancelamento).to.be.a('string'); });",
        'console.log(g);',
      ],
    }),
    notificacaoSoEstoque('4.12 Só Estoque (mock) - pagamento cancelado', 'payment-notifications', 'refPagamento', 'payment.cancel'),
    encerrarReserva('4.13 Integração - cancelar a reserva (libera o veículo)', 'cancellation', 'refReservaPagamento', 'Fim do teste de pagamento'),
    operacao('4.14 Integração - operação de cancelamento da reserva', 'reservations', 'RESERVATION_CANCEL', [chaveIdempotencia('RESERVATION_CANCEL', 'refReservaPagamento')]),
  ]),
  folder(
    '5 - Desmobilização automática',
    'Locavia (reabertura ou conclusão da desmobilização) → fila `locaviaweb-integracao-desmobilizacao-so-estoque` → integração (DynamoDB) → Só Estoque, sem passar pela disponibilização manual. Termina com a desmobilização fechada e o veículo À venda. O cancelamento também publica, mas não entra aqui: não tem volta e tiraria o veículo do teste.',
    desmobilizacaoAutomatica,
  ),
  folder('6 - Regras do log', 'Mensagem fora do contrato publicada direto na fila de desmobilização (LocalStack): a integração descarta a mensagem e registra a operação em `ERROR`.', [
    req({
      name: '6.1 SQS - publicar desmobilização fora do contrato',
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
      '6.2 Integração - operação ERROR com erro de validação',
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
      name: '6.3 SQS - mensagem inválida descartada (fora da DLQ)',
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
      name: '6.4 Integração - 404 operação de reserva pelo endpoint de veículos',
      method: 'GET',
      raw: '{{baseUrl}}/vehicles/operations/{{operationIdReserva}}',
      description: 'Cada recurso só responde as operações do seu tipo (a operação de reserva é a do 2.2).',
      headers: API_KEY,
      test: [ok(404)],
    }),
  ]),
  folder('7 - Validações', 'Respostas de erro dos dois lados; não alteram o fluxo.', [
    req({ name: 'Locavia - 401 sem token', method: 'POST', raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador', body: { page: 1, limit: 1 }, test: [ok(401)] }),
    req({
      name: 'Locavia - 400 disponibilizar sem desmobilização',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      headers: LOCAVIA_AUTH,
      body: { CodigoDesmobilizacao: [] },
      test: [ok(400)],
    }),
    req({
      name: 'Locavia - desmobilização inexistente não é publicada',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      headers: LOCAVIA_AUTH,
      body: { CodigoDesmobilizacao: [999999999] },
      test: [ok(200), "pm.test('Sucesso false', () => pm.expect((((pm.response.json() || {}).data || [])[0] || {}).Sucesso).to.eql(false));"],
    }),
    req({ name: 'Integração - 401 sem token', method: 'GET', raw: '{{baseUrl}}/vehicles', test: [ok(401)] }),
    req({ name: 'Integração - 401 credencial inválida', method: 'POST', raw: '{{baseUrl}}/auth/token', body: { clientId: 'invalido', clientSecret: 'invalido' }, test: [ok(401)] }),
    req({ name: 'Integração - 400 situação inválida', method: 'GET', raw: '{{baseUrl}}/vehicles?situacao=Vendida', headers: API_KEY, test: [ok(400)] }),
    req({
      name: 'Integração - 404 reserva de placa sem desmobilização',
      method: 'POST',
      raw: '{{baseUrl}}/reservations',
      headers: API_KEY,
      body: { referenciaExterna: 'SE-RES-404', placa: 'ZZZ9Z99', dataExpiracao: '2099-01-01T00:00:00.000Z', cliente },
      test: [ok(404)],
    }),
    req({ name: 'Integração - 400 reserva sem cliente', method: 'POST', raw: '{{baseUrl}}/reservations', headers: API_KEY, body: { referenciaExterna: 'SE-RES-400', placa: '{{placa}}', dataExpiracao: '2099-01-01T00:00:00.000Z' }, test: [ok(400)] }),
    req({ name: 'Integração - 404 reserva inexistente', method: 'GET', raw: '{{baseUrl}}/reservations/SE-RES-INEXISTENTE', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 404 pagamento inexistente', method: 'GET', raw: '{{baseUrl}}/payments/SE-PAG-INEXISTENTE', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 404 cancelar pagamento inexistente', method: 'POST', raw: '{{baseUrl}}/payments/SE-PAG-INEXISTENTE/cancellation', headers: API_KEY, body: { motivo: 'x' }, test: [ok(404)] }),
    req({ name: 'Integração - 404 operação inexistente', method: 'GET', raw: '{{baseUrl}}/reservations/operations/00000000-0000-0000-0000-000000000000', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 404 operação de veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/operations/00000000-0000-0000-0000-000000000000', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 401 GET /vehicles/{id} sem token', method: 'GET', raw: '{{baseUrl}}/vehicles/{{codigoVeiculo}}', test: [ok(401)] }),
    req({ name: 'Integração - 404 veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/999999999', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 400 código de veículo inválido', method: 'GET', raw: '{{baseUrl}}/vehicles/abc', headers: API_KEY, test: [ok(400)] }),
    req({ name: 'Integração - 404 manutenção de veículo inexistente', method: 'GET', raw: '{{baseUrl}}/vehicles/999999999/maintenances', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Integração - 404 empresas (melhoria futura)', method: 'GET', raw: '{{baseUrl}}/companies/1', headers: API_KEY, test: [ok(404)] }),
    req({ name: 'Locavia - 400 placa maior que 10 caracteres', method: 'POST', raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador', headers: LOCAVIA_AUTH, body: { Placa: 'ABCDEFGHIJK', page: 1, limit: 1 }, test: [ok(400)] }),
  ]),
  folder('8 - Situação das filas', 'Quantas mensagens estão esperando, em processamento e na DLQ em cada fila do LocalStack (`sqsUrl`). Use quando um passo ficar esperando: mensagem esperando = consumidor parado (Locavia ou integração fora do ar ou com o `.env` errado); em processamento por muito tempo = falha e nova tentativa (veja o log); na DLQ = falhou 5 vezes (o corpo aparece no console).', situacaoDasFilas()),
];

const variaveis = [
  ...variaveisAmbiente(),
  variable('codigoVeiculo', '6525', 'Veículo do teste (6525 KHP0394: À venda, com OS e itens na última OS); vazio = primeira desmobilização disponível'),
  variable('cpfCliente', '52998224725', 'Cliente das reservas; 2.1 troca por um CPF novo a cada execução (cliente cadastrado como lojista pelo Locavia)'),
  variable('codigoCliente', '', 'Gravado por 2.3'),
  variable('locaviaToken', '', 'Gravado por 0 - Preparação'),
  variable('token', '', 'Gravado por 0 - Preparação'),
  variable('codigoDesmobilizacao', '', 'Gravado por 1.1'),
  variable('placa', '', 'Gravado por 1.1'),
  variable('filtroDesmobilizacoes', '', 'Montado por 1.1'),
  variable('operationIdDesmobilizacao', '', 'CodigoOperacao gravado por 1.2'),
  variable('situacaoVeiculo', '', 'Situação do veículo na integração, gravada por 1.5'),
  variable('situacaoMinuscula', '', 'Montado por 1.7'),
  variable('situacaoDesmobilizacao', '', 'IDSituacao da desmobilização do teste (A/L/N), gravada por 1.1'),
  variable('dataPrevisaoTermino', '', 'Previsão de término da desmobilização do teste (AAAA-MM-DD), gravada por 1.1'),
  variable('filtroSituacaoPeriodo', '', 'Montado por 1.9'),
  variable('operationIdLote', '', 'CodigoOperacao gravado por 1.10'),
  variable('operationIdReserva', '', 'Gravado por 2.2'),
  variable('eventoInvalido', '', 'eventId da mensagem inválida, gravado por 6.1'),
  variable('corpoSqs', '', 'Montado por 6.1'),
  variable('refReserva', '', 'Gravado por 2.1'),
  variable('refDuplicada', '', 'Gravado por 2.3a'),
  variable('codigoReserva', '', 'Gravado por 2.2'),
  variable('refReservaRetirada', '', 'Gravado por 3.1'),
  variable('refReservaPagamento', '', 'Gravado por 4.1'),
  variable('refPagamento', '', 'Gravado por 4.3'),
  variable('codigoPagamento', '', 'Gravado por 4.4'),
  variable('dataExpiracao', '', 'Montado na reserva'),
  variable('dataPagamento', '', 'Montado no pagamento'),
  variable('entregasAntes', '0', 'Entregas no mock antes da ação da pasta 5'),
  variable('operationId', '', 'Última operação assíncrona'),
  variable('tentativas', '0', 'Controle das consultas repetidas'),
];

const destino = process.argv[2];
if (!destino) throw new Error('Informe o arquivo de saída');
const idAtual = fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, 'utf8')).info._postman_id : undefined;
fs.writeFileSync(
  destino,
  JSON.stringify(colecao('Fluxo completo Só Estoque - Locavia e Integração', descricao, itens, variaveis, idAtual || crypto.randomUUID()), null, 2) + '\n',
);
console.log('ok: ' + destino);
