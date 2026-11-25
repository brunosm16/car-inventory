// Blocos comuns das collections do fluxo Locavia → Integração → Só Estoque
const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const JSON_HEADER = { key: 'Content-Type', value: 'application/json', type: 'text' };
const LOCAVIA_AUTH = [{ key: 'Authorization', value: 'Bearer {{locaviaToken}}', type: 'text' }];
const API_KEY = [{ key: 'x-api-key', value: '{{token}}', type: 'text' }];
const SQS_JSON = [
  { key: 'Content-Type', value: 'application/x-amz-json-1.0', type: 'text' },
];

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
      : 'Reserva feita na Só Estoque: a integração grava pendente e publica `reserva.criar` em `locaviaweb-integracao-reserva-so-estoque`.',
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
    headers: [...SQS_JSON, { key: 'X-Amz-Target', value: 'AmazonSQS.GetQueueAttributes', type: 'text' }],
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

const FILAS = [
  ['Desmobilizações (Locavia → integração)', 'locaviaweb-integracao-desmobilizacao-so-estoque', 'Consumida pela integração.'],
  ['Operações de reserva (integração → Locavia)', 'locaviaweb-integracao-reserva-so-estoque', 'Consumida pelo Locavia.'],
  ['Resultado das reservas (Locavia → integração)', 'locaviaweb-integracao-reserva-so-estoque-retorno', 'Consumida pela integração.'],
  ['Operações de pagamento (integração → Locavia)', 'locaviaweb-integracao-pagamento-so-estoque', 'Consumida pelo Locavia.'],
  ['Resultado dos pagamentos (Locavia → integração)', 'locaviaweb-integracao-pagamento-so-estoque-retorno', 'Consumida pela integração.'],
];

const situacaoDasFilas = () => FILAS.map(([nome, fila, descricao]) => situacaoFila(nome, fila, descricao));

/** Login no Locavia, health e token da integração */
function preparacao(extras = []) {
  return [
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
    ...extras,
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
  ];
}

/** Endereços e credenciais do ambiente local */
const variaveisAmbiente = () => [
  variable('locaviaUrl', 'http://localhost:3333/api-locaviaweb/v1', 'api-locavia-web-ts'),
  variable('locaviaLogin', 'Suporte'),
  variable('locaviaSenha', 'dmaloc', 'Senha do usuário do Locavia (LOCAVIA_WEB_PASSWORD do .env local da integração)'),
  variable('locaviaOrganizacao', '07777542000114', 'CNPJ da organização'),
  variable('baseUrl', 'http://localhost:3001/car-inventory/v1', 'api-locaviaweb-car-inventory'),
  variable('clientId', 'so-estoque', 'AUTH_CLIENT_ID do .env da integração'),
  variable('clientSecret', '70Rc5dJF8VXw0V_rfwd_Zilv-Oyu4f2e', 'AUTH_CLIENT_SECRET do .env local da integração'),
  variable('soEstoqueMockUrl', 'http://localhost:3020', 'Mock da Só Estoque (docker-compose da integração)'),
  variable('sqsUrl', 'http://localhost:4567', 'LocalStack da integração, usado também pelo Locavia'),
];

/** Texto de ambiente comum às descrições das collections */
const descricaoAmbiente = [
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
  "  pm.sendRequest(pedido('GET', v('baseUrl') + '/vehicles?situacao=ABERTA&limit=50', null, { 'x-api-key': v('token') }), (e, r) => {",
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

function colecao(nome, descricao, item, variaveis, id) {
  return {
    info: { _postman_id: id, name: nome, description: descricao, schema: SCHEMA },
    event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: preparacaoAutomatica } }],
    item,
    variable: variaveis,
  };
}

module.exports = {
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
};
