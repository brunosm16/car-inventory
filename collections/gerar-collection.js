// Gera a collection única do fluxo Locavia → Integração → Só Estoque:
//   node gerar-collection.js fluxo-completo-so-estoque.postman_collection.json
const fs = require('fs');
const crypto = require('crypto');

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const JSON_HEADER = { key: 'Content-Type', value: 'application/json', type: 'text' };
const LOCAVIA_AUTH = [{ key: 'Authorization', value: 'Bearer {{locaviaToken}}', type: 'text' }];
const API_KEY = [{ key: 'x-api-key', value: '{{token}}', type: 'text' }];

function url(raw) {
  const [base, query] = raw.split('?');
  const [host, ...path] = base.split('/');
  const out = { raw, host: [host], path };
  if (query) {
    out.query = query.split('&').map((pair) => {
      const i = pair.indexOf('=');
      return i < 0 ? { key: pair, value: '' } : { key: pair.slice(0, i), value: pair.slice(i + 1) };
    });
  }
  return out;
}

function req({ name, method, raw, description, body, headers = [], test = [], pre = [] }) {
  const event = [];
  if (pre.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  if (test.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: test } });
  const hasJson = body !== undefined && !headers.some((h) => h.key === 'Content-Type');
  const request = { method, header: [...(hasJson ? [JSON_HEADER] : []), ...headers], url: url(raw), description };
  if (body !== undefined) {
    request.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  return { name, event, request, response: [] };
}

const folder = (name, description, item) => ({ name, description, item });
const variable = (key, value, description) => ({ key, value, type: 'string', ...(description ? { description } : {}) });
const wait = (ms) => [`const pausa = Date.now() + ${ms};`, 'while (Date.now() < pausa) {}'];
const ok = (code) => `pm.test('${code}', () => pm.expect(pm.response.code).to.eql(${code}));`;

/**
 * Repete a requisição (no Runner) enquanto `pronto` for falso, até 15 vezes com
 * 3 s de intervalo; quando pronto, roda `asserts`
 */
function aguardar(pronto, asserts, motivo) {
  return [
    `const pronto = ${pronto};`,
    "const tentativa = Number(pm.collectionVariables.get('tentativas') || 0) + 1;",
    'if (!pronto && tentativa < 15) {',
    "  pm.collectionVariables.set('tentativas', String(tentativa));",
    "  if (typeof postman !== 'undefined') postman.setNextRequest(pm.info.requestName);",
    `  pm.test('aguardando ${motivo} (tentativa ' + tentativa + '/15; fora do Runner, envie de novo)', () => true);`,
    '} else {',
    "  pm.collectionVariables.set('tentativas', '0');",
    ...asserts.map((linha) => '  ' + linha),
    '}',
  ];
}

// ------------------------------------------------------------ integração: operações
function operacao(name, recurso, tipo, aoTerminar = [], esperado = 'FINISHED') {
  return req({
    name,
    method: 'GET',
    raw: `{{baseUrl}}/${recurso}/operations/{{operationId}}`,
    description: `Operação assíncrona \`${tipo}\`: espera o Locavia processar pela fila e a integração aplicar o resultado e avisar a Só Estoque. Esperado: \`${esperado}\`.`,
    headers: API_KEY,
    pre: wait(3000),
    test: [
      ok(200),
      'const d = (pm.response.json() || {}).data || {};',
      ...aguardar(
        "d.status === 'FINISHED' || d.status === 'ERROR'",
        [
          "const erro = d.lastError ? ' - ' + d.lastError.code + ': ' + d.lastError.message + (d.lastError.detail ? ' (' + d.lastError.detail + ')' : '') : '';",
          `pm.test('${tipo} ${esperado} (atual: ' + d.status + erro + ')', () => {`,
          `  pm.expect(d.type).to.eql('${tipo}');`,
          `  pm.expect(d.status).to.eql('${esperado}');`,
          '});',
          "console.log((d.timeline || []).map((e) => e.step).join(' → '));",
          ...aoTerminar,
        ],
        'o Locavia processar',
      ),
    ],
  });
}

const salvarOperacao = [
  ok(201),
  'const d = (pm.response.json() || {}).data || {};',
  "pm.test('operação registrada e enviada ao Locavia', () => pm.expect(d.operationId).to.be.a('string').and.not.empty);",
  "pm.collectionVariables.set('operationId', d.operationId);",
  "pm.collectionVariables.set('tentativas', '0');",
];

const cliente = {
  tipoPessoa: 'Fisica',
  documento: '{{cpfCliente}}',
  nome: 'Cliente Teste So Estoque',
  email: 'cliente.teste@email.com',
  telefone: '11988887777',
};

function reservar(name, variavelRef, clienteNovo = false) {
  return req({
    name,
    method: 'POST',
    raw: '{{baseUrl}}/reservations',
    description: clienteNovo
      ? 'Reserva feita na Só Estoque com um cliente que NÃO existe no Locavia (CPF novo gerado a cada execução): o Locavia cadastra o cliente como lojista ao processar a reserva.'
      : 'Reserva feita na Só Estoque: a integração grava pendente e publica `reserva.criar` em `lw-integracao-reserva-so-estoque`.',
    headers: API_KEY,
    pre: [
      ...(clienteNovo
        ? [
            'const digitos = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));',
            'const dv = (numeros) => { const soma = numeros.reduce((acc, d, i) => acc + d * (numeros.length + 1 - i), 0); const resto = (soma * 10) % 11; return resto === 10 ? 0 : resto; };',
            'digitos.push(dv(digitos));',
            'digitos.push(dv(digitos));',
            "pm.collectionVariables.set('cpfCliente', digitos.join(''));",
            "console.log('Cliente novo: CPF ' + pm.collectionVariables.get('cpfCliente'));",
          ]
        : []),
      `pm.collectionVariables.set('${variavelRef}', 'SE-RES-' + Date.now());`,
      'const expiracao = new Date(Date.now() - 3 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000).toISOString();',
      "pm.collectionVariables.set('dataExpiracao', expiracao);",
    ],
    body: JSON.stringify(
      {
        referenciaExterna: `{{${variavelRef}}}`,
        placa: '{{placa}}',
        dataExpiracao: '{{dataExpiracao}}',
        valorAcordado: 70000,
        cliente,
      },
      null,
      2,
    ),
    test: salvarOperacao,
  });
}

function reservaNaIntegracao(name, variavelRef, situacao, extras = []) {
  return req({
    name,
    method: 'GET',
    raw: `{{baseUrl}}/reservations/{{${variavelRef}}}`,
    description: `Esperado: situação \`${situacao}\`, com o veículo associado.`,
    headers: API_KEY,
    test: [
      ok(200),
      'const r = (pm.response.json() || {}).data || {};',
      `pm.test('reserva ${situacao} com o veículo {{placa}}', () => {`,
      `  pm.expect(r.situacao).to.eql('${situacao}');`,
      "  pm.expect(r.veiculo.placa).to.eql(pm.collectionVariables.get('placa'));",
      '  pm.expect(r.operacaoPendente).to.be.undefined;',
      '});',
      ...extras,
      'console.log(r);',
    ],
  });
}

function clienteNoLocavia(name, description, test) {
  return req({
    name,
    method: 'GET',
    raw: '{{locaviaUrl}}/clientes?filters=Clientes__Pessoa.CPF={{cpfCliente}}&limit=5',
    description,
    headers: LOCAVIA_AUTH,
    test: [
      ok(200),
      'const clientes = ((pm.response.json() || {}).data || {}).items || [];',
      ...test,
      'console.log(clientes.map((c) => ({ CodigoCliente: c.CodigoCliente, Lojista: c.Lojista, Nome: (c.Pessoa || {}).RazaoSocial, CPF: (c.Pessoa || {}).CPF })));',
    ],
  });
}


function reservaNoLocavia(name, variavelRef, situacao) {
  return req({
    name,
    method: 'GET',
    raw: `{{locaviaUrl}}/reservas-veiculo/consulta?ReferenciaExterna={{${variavelRef}}}`,
    description: `Tabela ReservasVeiculo. Esperado: Situacao \`${situacao}\`.`,
    headers: LOCAVIA_AUTH,
    test: [
      ok(200),
      'const resposta = (pm.response.json() || {}).data;',
      'const reservas = Array.isArray(resposta) ? resposta : (resposta && resposta.items) || [];',
      `const reserva = reservas.find((x) => x.ReferenciaExterna === pm.collectionVariables.get('${variavelRef}')) || {};`,
      `pm.test('Locavia: reserva ' + reserva.CodigoReserva + ' Situacao ${situacao}', () => pm.expect(reserva.Situacao).to.eql('${situacao}'));`,
      'console.log(reserva);',
    ],
  });
}

function notificacaoSoEstoque(name, rota, variavelRef, evento, extras = []) {
  return req({
    name,
    method: 'GET',
    raw: `{{soEstoqueMockUrl}}/${rota}`,
    description: `Webhook da Só Estoque (json-server do docker-compose da integração). Esperado: evento \`${evento}\` com sucesso.`,
    test: [
      ok(200),
      `const entregas = (pm.response.json() || []).filter((e) => e.externalReference === pm.collectionVariables.get('${variavelRef}') && e.event === '${evento}');`,
      'const e = entregas[entregas.length - 1];',
      ...aguardar(
        '!!e',
        [
          `pm.test('${evento} entregue à Só Estoque', () => pm.expect(e, 'não entregue').to.be.an('object'));`,
          'if (e) {',
          "  pm.test('sucesso', () => pm.expect(e.success).to.eql(true));",
          ...extras.map((linha) => '  ' + linha),
          '  console.log(e);',
          '}',
        ],
        'a entrega à Só Estoque',
      ),
    ],
  });
}

function veiculoNaIntegracao(name, description, extras) {
  return req({
    name,
    method: 'GET',
    raw: '{{baseUrl}}/vehicles?placa={{placa}}',
    description,
    headers: API_KEY,
    test: [
      ok(200),
      'const v = ((pm.response.json() || {}).data || [])[0];',
      "pm.test('veículo {{placa}} na integração', () => pm.expect(v).to.be.an('object'));",
      'if (v) {',
      ...extras.map((linha) => '  ' + linha),
      '  console.log(v);',
      '}',
    ],
  });
}

function encerrarReserva(name, acao, variavelRef, motivo) {
  return req({
    name,
    method: 'POST',
    raw: `{{baseUrl}}/reservations/{{${variavelRef}}}/${acao}`,
    headers: API_KEY,
    body: { motivo },
    test: salvarOperacao,
  });
}

/** Mensagens na fila (esperando e em processamento) e na DLQ; mensagem na DLQ = operação que falhou 5 vezes */
function situacaoFila(name, fila, description) {
  return req({
    name,
    method: 'POST',
    raw: '{{sqsUrl}}/',
    description,
    headers: [
      { key: 'Content-Type', value: 'application/x-amz-json-1.0', type: 'text' },
      { key: 'X-Amz-Target', value: 'AmazonSQS.GetQueueAttributes', type: 'text' },
    ],
    body: JSON.stringify({
      QueueUrl: `{{sqsUrl}}/000000000000/${fila}`,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    }),
    test: [
      ok(200),
      'const a = (pm.response.json() || {}).Attributes || {};',
      `pm.test('${fila}: ' + a.ApproximateNumberOfMessages + ' esperando, ' + a.ApproximateNumberOfMessagesNotVisible + ' em processamento', () => true);`,
      "const sqs = (acao, corpo) => ({ url: pm.collectionVariables.get('sqsUrl') + '/', method: 'POST', header: { 'Content-Type': 'application/x-amz-json-1.0', 'X-Amz-Target': 'AmazonSQS.' + acao }, body: { mode: 'raw', raw: JSON.stringify(corpo) } });",
      `const dlq = pm.collectionVariables.get('sqsUrl') + '/000000000000/${fila}-dlq';`,
      "pm.sendRequest(sqs('GetQueueAttributes', { QueueUrl: dlq, AttributeNames: ['ApproximateNumberOfMessages'] }), (erro, resposta) => {",
      '  const n = Number((((resposta && resposta.json()) || {}).Attributes || {}).ApproximateNumberOfMessages || 0);',
      `  pm.test('DLQ ${fila}-dlq: ' + n + ' mensagem(ns)' + (n ? ' - veja o corpo no console' : ''), () => pm.expect(n).to.eql(0));`,
      '  if (n) {',
      "    pm.sendRequest(sqs('ReceiveMessage', { QueueUrl: dlq, MaxNumberOfMessages: 10, VisibilityTimeout: 0 }), (e, r) => {",
      '      (((r && r.json()) || {}).Messages || []).forEach((m) => { try { console.log(JSON.parse(m.Body)); } catch (x) { console.log(m.Body); } });',
      '    });',
      '  }',
      '});',
    ],
  });
}

// ------------------------------------------------------------ collection
const descricao = [
  'Teste de ponta a ponta da integração com a Só Estoque, com os endpoints do Locavia (api-locavia-web-ts) e da integração (api-locaviaweb-car-inventory) numa collection só. Rode a collection inteira no **Runner** e na ordem: os passos assíncronos se repetem sozinhos até terminar (fora do Runner, envie de novo).',
  '',
  '1. Desmobilização: o Locavia publica o veículo, a integração consome, grava e envia para a Só Estoque.',
  '2. Reserva: criada, atualizada e cancelada pela integração; o Locavia processa pela fila e devolve o resultado.',
  '3. Reserva retirada.',
  '4. Pagamento: reserva + pagamento da reserva (o Locavia grava em PagamentosReservaVeiculo, ligado à reserva e ao veículo) + cancelamento do pagamento; a reserva é cancelada no fim.',
  '5. Validações e 6. Situação das filas (esperando, em processamento e DLQ).',
  '',
  'Ambiente:',
  '- integração: `docker compose up -d` (LocalStack na 4567 e mock da Só Estoque na 3020) e `npm run dev` (porta 3001), com no `.env` `API_SO_ESTOQUE_VEHICLE_WEBHOOK_URL=http://localhost:3020/vehicle-notifications`, `API_SO_ESTOQUE_RESERVATION_WEBHOOK_URL=http://localhost:3020/reservation-notifications` e `API_SO_ESTOQUE_PAYMENT_WEBHOOK_URL=http://localhost:3020/payment-notifications`;',
  '- Locavia: `npm run dev`, publicando e consumindo no MESMO LocalStack da integração:',
  '',
  '```',
  'AWS_REGION=us-east-1',
  'AWS_SQS_BASE_URL=http://localhost:4567/000000000000',
  'AWS_SQS_ENDPOINT=http://localhost:4567',
  'AWS_ACCESS_KEY_ID=test',
  'AWS_SECRET_ACCESS_KEY=test',
  '```',
  '',
  'Dados:',
  '- `locaviaSenha` e `clientSecret` vêm preenchidos com os valores do `.env` local; troque se o seu ambiente for outro;',
  '- o veículo é o da primeira desmobilização disponível para venda (ou a do `codigoVeiculo` informado); ele precisa estar à venda no Locavia (status 8 ou 13) e sem reserva ativa;',
  '- 2.1 reserva com um cliente que não existe no Locavia (CPF novo a cada execução): o Locavia cadastra o cliente como lojista (conferido em 2.4a); as reservas seguintes usam o mesmo cliente, já existente.',
  '',
  '- cada pasta roda sozinha: antes de cada requisição a collection faz login no Locavia e pega o token da integração quando faltam ou venceram e, se a placa estiver vazia, escolhe um veículo da integração sem reserva (por exemplo, a pasta 4 pode ser rodada direto).',
  '',
  'O fluxo termina com o veículo à venda e sem reserva: pode ser repetido.',
].join('\n');

const itens = [
  folder('0 - Preparação', 'Sessão no Locavia e token da integração.', [
    req({
      name: 'Locavia - login',
      method: 'POST',
      raw: '{{locaviaUrl}}/sessoes',
      body: '{\n  "login": "{{locaviaLogin}}",\n  "senha": "{{locaviaSenha}}",\n  "organizacao": "{{locaviaOrganizacao}}"\n}',
      test: [
        ok(200),
        'const token = ((pm.response.json() || {}).data || {}).token;',
        "pm.test('token do Locavia', () => pm.expect(token).to.be.a('string').and.not.empty);",
        "if (token) pm.collectionVariables.set('locaviaToken', token);",
      ],
    }),
    req({ name: 'Integração - health', method: 'GET', raw: '{{baseUrl}}/health', test: [ok(200)] }),
    req({
      name: 'Integração - token',
      method: 'POST',
      raw: '{{baseUrl}}/auth/token',
      body: '{\n  "clientId": "{{clientId}}",\n  "clientSecret": "{{clientSecret}}"\n}',
      test: [
        ok(200),
        'const token = ((pm.response.json() || {}).data || {}).accessToken;',
        "pm.test('token da integração', () => pm.expect(token).to.be.a('string').and.not.empty);",
        "if (token) pm.collectionVariables.set('token', token);",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
  ]),
  folder('1 - Desmobilização', 'Locavia → fila `lw-integracao-desmobilizacao-so-estoque` → integração (DynamoDB) → Só Estoque.', [
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
        "  console.log('Desmobilização ' + item.CodigoDesmobilizacao + ' - veículo ' + item.CodigoVeiculo + ' ' + item.Placa);",
        '}',
      ],
    }),
    req({
      name: '1.2 Locavia - colocar veículo na fila de integração',
      method: 'POST',
      raw: '{{locaviaUrl}}/desmobilizacoes-integracao-gerenciador/disponibilizacao',
      headers: LOCAVIA_AUTH,
      body: '{\n  "CodigoDesmobilizacao": [{{codigoDesmobilizacao}}]\n}',
      test: [
        ok(200),
        'const r = ((pm.response.json() || {}).data || [])[0] || {};',
        "pm.test('publicada na fila (' + r.Mensagem + ')', () => { pm.expect(r.Sucesso).to.eql(true); pm.expect(r.CodigoMensagemFila).to.be.a('string'); });",
        "pm.collectionVariables.set('tentativas', '0');",
      ],
    }),
    req({
      name: '1.3 Só Estoque (mock) - veículo recebido',
      method: 'GET',
      raw: '{{soEstoqueMockUrl}}/vehicle-notifications',
      description: 'A integração consumiu a fila, gravou o veículo e entregou à Só Estoque.',
      pre: wait(3000),
      test: [
        ok(200),
        "const entregas = (pm.response.json() || []).filter((e) => e.vehicle && e.vehicle.placa === pm.collectionVariables.get('placa'));",
        "const e = entregas.filter((x) => x.vehicle.mensagem.dadosDesmobilizacao.codigoDesmobilizacao === pm.collectionVariables.get('codigoDesmobilizacao')).pop();",
        ...aguardar(
          '!!e',
          [
            "pm.test('veículo entregue à Só Estoque', () => pm.expect(e, 'não entregue').to.be.an('object'));",
            "if (e) { pm.test('evento vehicle.demobilization', () => pm.expect(e.event).to.eql('vehicle.demobilization')); console.log(e); }",
          ],
          'a integração consumir a fila',
        ),
      ],
    }),
    veiculoNaIntegracao('1.4 Integração - consultar o veículo enviado para a Só Estoque', 'Veículo gravado no DynamoDB com a mensagem do Locavia, as reservas e os pagamentos.', [
      "pm.test('situação, desmobilização e manutenção', () => {",
      "  pm.expect(['Aberta', 'Fechada', 'Cancelada']).to.include(v.situacao);",
      "  pm.expect(v.mensagem.dadosDesmobilizacao.codigoDesmobilizacao).to.eql(pm.collectionVariables.get('codigoDesmobilizacao'));",
      "  pm.expect(v.mensagem.dadosManutencao.ordensServico).to.be.an('array');",
      "  pm.expect(v.reservas).to.be.an('array');",
      "  pm.expect(v.pagamentos).to.be.an('array');",
      '});',
    ]),
  ]),
  folder('2 - Reserva: criar, atualizar e cancelar', 'Integração → fila `lw-integracao-reserva-so-estoque` → Locavia → `-retorno` → integração → Só Estoque. A reserva é feita com um cliente novo (CPF gerado a cada execução), que o Locavia cadastra como lojista.', [
    reservar('2.1 Só Estoque - reservar com cliente que não existe no Locavia', 'refReserva', true),
    operacao('2.2 Integração - operação de reserva', 'reservations', 'RESERVATION_CREATE', [
      "if (d.result && d.result.reservationId) pm.collectionVariables.set('codigoReserva', d.result.reservationId);",
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
    operacao('2.11 Integração - operação de cancelamento', 'reservations', 'RESERVATION_CANCEL'),
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
    operacao('4.10 Integração - operação de cancelamento do pagamento', 'payments', 'PAYMENT_CANCEL'),
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
    operacao('4.14 Integração - operação de cancelamento da reserva', 'reservations', 'RESERVATION_CANCEL'),
  ]),
  folder('5 - Validações', 'Respostas de erro dos dois lados; não alteram o fluxo.', [
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
  ]),
  folder('6 - Situação das filas', 'Quantas mensagens estão esperando, em processamento e na DLQ em cada fila do LocalStack (`sqsUrl`). Use quando um passo ficar esperando: mensagem esperando = consumidor parado (Locavia ou integração fora do ar ou com o `.env` errado); em processamento por muito tempo = falha e nova tentativa (veja o log); na DLQ = falhou 5 vezes (o corpo aparece no console).', [
    situacaoFila('Desmobilizações (Locavia → integração)', 'lw-integracao-desmobilizacao-so-estoque', 'Consumida pela integração.'),
    situacaoFila('Operações de reserva (integração → Locavia)', 'lw-integracao-reserva-so-estoque', 'Consumida pelo Locavia.'),
    situacaoFila('Resultado das reservas (Locavia → integração)', 'lw-integracao-reserva-so-estoque-retorno', 'Consumida pela integração.'),
    situacaoFila('Operações de pagamento (integração → Locavia)', 'locaviaweb-integracao-pagamento-so-estoque', 'Consumida pelo Locavia.'),
    situacaoFila('Resultado dos pagamentos (Locavia → integração)', 'locaviaweb-integracao-pagamento-so-estoque-retorno', 'Consumida pela integração.'),
  ]),
];

const variaveis = [
  variable('locaviaUrl', 'http://localhost:3333/api-locaviaweb/v1', 'api-locavia-web-ts'),
  variable('locaviaLogin', 'Suporte'),
  variable('locaviaSenha', 'dmaloc', 'Senha do usuário do Locavia (LOCAVIA_WEB_PASSWORD do .env local da integração)'),
  variable('locaviaOrganizacao', '07777542000114', 'CNPJ da organização'),
  variable('baseUrl', 'http://localhost:3001/car-inventory/v1', 'api-locaviaweb-car-inventory'),
  variable('clientId', 'so-estoque', 'AUTH_CLIENT_ID do .env da integração'),
  variable('clientSecret', '70Rc5dJF8VXw0V_rfwd_Zilv-Oyu4f2e', 'AUTH_CLIENT_SECRET do .env local da integração'),
  variable('soEstoqueMockUrl', 'http://localhost:3020', 'Mock da Só Estoque (docker-compose da integração)'),
  variable('sqsUrl', 'http://localhost:4567', 'LocalStack da integração, usado também pelo Locavia'),
  variable('codigoVeiculo', '', 'Opcional: veículo do teste; vazio = primeira desmobilização disponível'),
  variable('cpfCliente', '52998224725', 'Cliente das reservas; 2.1 troca por um CPF novo a cada execução (cliente cadastrado como lojista pelo Locavia)'),
  variable('codigoCliente', '', 'Gravado por 2.3'),
  variable('locaviaToken', '', 'Gravado por 0 - Preparação'),
  variable('token', '', 'Gravado por 0 - Preparação'),
  variable('codigoDesmobilizacao', '', 'Gravado por 1.1'),
  variable('placa', '', 'Gravado por 1.1'),
  variable('filtroDesmobilizacoes', '', 'Montado por 1.1'),
  variable('refReserva', '', 'Gravado por 2.1'),
  variable('refDuplicada', '', 'Gravado por 2.3a'),
  variable('codigoReserva', '', 'Gravado por 2.2'),
  variable('refReservaRetirada', '', 'Gravado por 3.1'),
  variable('refReservaPagamento', '', 'Gravado por 4.1'),
  variable('refPagamento', '', 'Gravado por 4.3'),
  variable('codigoPagamento', '', 'Gravado por 4.4'),
  variable('dataExpiracao', '', 'Montado na reserva'),
  variable('dataPagamento', '', 'Montado no pagamento'),
  variable('operationId', '', 'Última operação assíncrona'),
  variable('tentativas', '0', 'Controle das consultas repetidas'),
];

/**
 * Antes de cada requisição: renova os tokens vencidos ou ausentes e, quando a
 * requisição usa `placa` e ela está vazia, escolhe um veículo livre na
 * integração. Assim qualquer pasta roda sozinha.
 */
const preparacaoAutomatica = [
  'const v = (k) => pm.collectionVariables.get(k);',
  'const set = (k, x) => pm.collectionVariables.set(k, x);',
  'const nome = pm.info.requestName;',
  "const json = (r) => { try { return r.json() || {}; } catch (e) { return {}; } };",
  "const pedido = (method, url, body, headers) => ({ url, method, header: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? { mode: 'raw', raw: JSON.stringify(body) } : undefined });",
  'const valido = (jwt) => {',
  '  if (!jwt) return false;',
  "  try { let s = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); s += '==='.slice((s.length + 3) % 4); const p = JSON.parse(CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8)); return !p.exp || p.exp * 1000 > Date.now() + 60000; } catch (e) { return true; }",
  '};',
  "const corpo = (pm.request.body && pm.request.body.raw) || '';",
  "const usa = (k) => (pm.request.url.toString() + corpo).includes('{{' + k + '}}');",
  '',
  'function tokenLocavia(seguir) {',
  "  if (nome === 'Locavia - login' || valido(v('locaviaToken'))) return seguir();",
  "  pm.sendRequest(pedido('POST', v('locaviaUrl') + '/sessoes', { login: v('locaviaLogin'), senha: v('locaviaSenha'), organizacao: v('locaviaOrganizacao') }), (e, r) => {",
  '    const t = (json(r).data || {}).token;',
  "    if (t) set('locaviaToken', t); else console.warn('Login no Locavia falhou', e || (r && r.text()));",
  '    seguir();',
  '  });',
  '}',
  '',
  'function tokenIntegracao(seguir) {',
  "  if (nome === 'Integração - token' || valido(v('token'))) return seguir();",
  "  pm.sendRequest(pedido('POST', v('baseUrl') + '/auth/token', { clientId: v('clientId'), clientSecret: v('clientSecret') }), (e, r) => {",
  '    const t = (json(r).data || {}).accessToken;',
  "    if (t) set('token', t); else console.warn('Token da integração falhou', e || (r && r.text()));",
  '    seguir();',
  '  });',
  '}',
  '',
  'function veiculoLivre() {',
  "  const novaReserva = nome.includes('reservar');",
  "  if (!usa('placa') || (v('placa') && !novaReserva)) return;",
  "  pm.sendRequest(pedido('GET', v('baseUrl') + '/vehicles?situacao=Aberta&limit=50', null, { 'x-api-key': v('token') }), (e, r) => {",
  "    const lista = Array.isArray(json(r).data) ? json(r).data : [];",
  "    const semReserva = (x) => !(x.mensagem || {}).dadosReserva && !(x.reservas || []).some((y) => ['Ativa', 'Pendente'].includes(y.situacao));",
  "    const atual = lista.find((x) => x.placa === v('placa'));",
  '    if (atual && semReserva(atual)) return;',
  '    const livre = lista.find(semReserva);',
  '    if (!livre) return console.warn(\'Nenhum veículo livre na integração: rode a pasta 1 - Desmobilização\');',
  "    set('placa', livre.placa);",
  "    set('codigoVeiculo', livre.codigoVeiculo);",
  "    set('codigoDesmobilizacao', livre.mensagem.dadosDesmobilizacao.codigoDesmobilizacao);",
  "    console.log('Veículo do teste: ' + livre.codigoVeiculo + ' ' + livre.placa);",
  '  });',
  '}',
  '',
  'tokenLocavia(() => tokenIntegracao(veiculoLivre));',
];

const colecao = {
  info: {
    _postman_id: crypto.randomUUID(),
    name: 'Fluxo completo Só Estoque - Locavia e Integração',
    description: descricao,
    schema: SCHEMA,
  },
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: preparacaoAutomatica } }],
  item: itens,
  variable: variaveis,
};

const destino = process.argv[2];
if (!destino) throw new Error('Informe o arquivo de saída');
fs.writeFileSync(destino, JSON.stringify(colecao, null, 2) + '\n');
console.log('ok: ' + destino);
