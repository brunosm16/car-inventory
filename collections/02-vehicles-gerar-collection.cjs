/*
  Gera collections/02-vehicles.postman_collection.json: endpoints de veículos do
  api-locaviaweb-car-inventory sobre o LocaviaWeb (design doc:
  product-backlog/02-vehicles/02-vehicles-design-doc.md).

  - Leituras (GET /vehicles...) vão direto ao SQL Server do LocaviaWeb.
  - Escritas são assíncronas: 201/200 com operationId; o receiver aplica no
    api-locavia-web-ts autenticado com o usuário da integração do ENV
    (LOCAVIA_WEB_LOGIN / LOCAVIA_WEB_PASSWORD / LOCAVIA_WEB_ORGANIZATION).
    Consulte o resultado em .../operations/{{operationId}}.
  - O token (x-api-key) já vem na variável accessToken, assinado com o
    JWT_ACCESS_SECRET do .env (validade AUTH_TOKEN_EXPIRES_IN_SECONDS); a pasta
    "0 - Preparação" (POST /auth/token) o renova.
  - Os veículos e os códigos de cadastro são lidos do banco do LocaviaWeb do .env
    (TYPEORM_*, só SELECT), na organização do CNPJ LOCAVIA_WEB_ORGANIZATION:
      {{vehicleIdAvailable}}    Disponível (2), sem restrição, reserva, saída aberta
                                ou desmobilização: Preparação Venda + desmobilização
      {{vehicleIdTransfer}}     outro Disponível (2) nas mesmas condições: traslado
      {{vehicleIdBlock}}        em Venda (8), sem restrição nem reserva: bloqueio e desbloqueio
      {{vehicleIdNotAvailable}} outro em Venda (8): validações
      {{vehicleId}}             Alugado (1) com movimentações: consultas e idempotência
    Empresa, modelo, cor e combustível são os do veículo Disponível; a empresa de
    destino é outra empresa da organização. A pasta 3 muda o status dos veículos:
    gere a collection de novo antes de cada execução.
  - Placa e chassi da inclusão são gerados a cada execução.
  - A collection leva o AUTH_CLIENT_SECRET e não é versionada (.gitignore).
  - De/para da listagem com o banco: collections/02-vehicles-de-para.sql.

  Uso (Node 24), de qualquer pasta: o .env e os pacotes (dotenv, mssql) vêm do
  api-locaviaweb-car-inventory, ao lado deste repositório (ou do caminho em
  CAR_INVENTORY_API_DIR); a collection é gravada ao lado deste script.
    node collections/02-vehicles-gerar-collection.cjs
*/
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const API_DIR = path.resolve(
  process.env.CAR_INVENTORY_API_DIR ??
    path.join(__dirname, '..', '..', 'api-locaviaweb-car-inventory'),
);
if (!fs.existsSync(path.join(API_DIR, 'node_modules', 'mssql'))) {
  console.error(
    `api-locaviaweb-car-inventory não encontrado em ${API_DIR} (com npm install feito). Informe o caminho em CAR_INVENTORY_API_DIR.`,
  );
  process.exit(1);
}
const doProjeto = createRequire(path.join(API_DIR, 'package.json'));
doProjeto('dotenv').config({ path: path.join(API_DIR, '.env'), quiet: true });
const sql = doProjeto('mssql');
const jwt = doProjeto('jsonwebtoken');

/**
 * Mesmo token do POST /auth/token (CreateTokenUseCase), assinado com o
 * JWT_ACCESS_SECRET do .env: a collection já sai autenticada, sem depender
 * do script da pasta 0 (que só renova o token).
 */
function gerarToken() {
  const { AUTH_CLIENT_ID, JWT_ACCESS_SECRET } = process.env;
  if (!AUTH_CLIENT_ID || !JWT_ACCESS_SECRET) {
    throw new Error('AUTH_CLIENT_ID e JWT_ACCESS_SECRET são obrigatórios no .env para gerar o token.');
  }
  return jwt.sign({ data: { user: AUTH_CLIENT_ID } }, JWT_ACCESS_SECRET, {
    subject: AUTH_CLIENT_ID,
    expiresIn: Number(process.env.AUTH_TOKEN_EXPIRES_IN_SECONDS || 3600),
  });
}

/** Valores numéricos no JSON: o Postman troca a variável sem aspas */
const NUMEROS = [
  '{{companyId}}',
  '{{transferCompanyId}}',
  '{{modelId}}',
  '{{colorId}}',
  '{{fuelTypeId}}',
  '{{restrictionId}}',
  '{{saleTypeId}}',
  '{{destinationCompanyId}}',
  '{{vehicleIdAvailable}}',
  '{{transferOdometer}}',
];
const json = (corpo) =>
  NUMEROS.reduce(
    (texto, v) => texto.split(`"${v}"`).join(v),
    JSON.stringify(corpo, null, 2),
  );

const LER =
  'const b = pm.response.json(); const d = b && b.data !== undefined ? b.data : b;';
const status = (s) =>
  `pm.test('${s}', () => pm.response.to.have.status(${s}));`;
const campo = (rotulo, expressao, esperado) =>
  `pm.test(${JSON.stringify(rotulo)}, () => pm.expect(${expressao}).to.eql(${JSON.stringify(esperado)}));`;
const igualVariavel = (rotulo, expressao, variavel) =>
  `pm.test(${JSON.stringify(rotulo)}, () => pm.expect(${expressao}).to.eql(pm.collectionVariables.get('${variavel}')));`;
const guardar = (variavel, expressao) =>
  `if (${expressao}) pm.collectionVariables.set('${variavel}', ${expressao});`;
const AGUARDE = '(se PENDING/PROCESSING, aguarde alguns segundos e reenvie)';
/** O receiver consome a fila em poucos segundos: espera antes de consultar a operação */
const ESPERAR_FILA = ['setTimeout(() => {}, 5000);'];
/** Placa Mercosul e chassi (VIN) novos a cada execução */
const GERAR_VEICULO = [
  "const letras = 'ABCDEFGHJKLMNPRSTUVWXYZ';",
  'const sorteio = (n, s) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");',
  "pm.collectionVariables.set('newLicensePlate', sorteio(3, letras) + sorteio(1, '0123456789') + sorteio(1, letras) + sorteio(2, '0123456789'));",
  "pm.collectionVariables.set('newChassis', '9BW' + sorteio(14, letras + '0123456789'));",
];

const H_INTEGRACAO = [
  { key: 'x-api-key', value: '{{accessToken}}', type: 'text' },
  { key: 'Content-Type', value: 'application/json', type: 'text' },
];
const H_SEM_TOKEN = [
  { key: 'Content-Type', value: 'application/json', type: 'text' },
];

function url(caminho, query = []) {
  const q = query.length
    ? '?' + query.map(([k, v]) => `${k}=${v}`).join('&')
    : '';
  return {
    raw: `{{baseUrl}}/${caminho}${q}`,
    host: ['{{baseUrl}}'],
    path: caminho.split('/'),
    ...(query.length
      ? { query: query.map(([key, value]) => ({ key, value })) }
      : {}),
  };
}

function req(
  name,
  method,
  caminho,
  { query, body, header, testes = [], preRequest, descricao } = {},
) {
  const event = [
    {
      listen: 'test',
      script: { type: 'text/javascript', exec: [LER, ...testes] },
    },
  ];
  if (preRequest)
    event.unshift({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: preRequest },
    });
  const cabecalhos = header ?? H_INTEGRACAO;
  const corpo = body ? json(body) : undefined;
  return {
    name,
    event,
    request: {
      method,
      header: ['GET', 'DELETE'].includes(method)
        ? cabecalhos.filter((h) => h.key !== 'Content-Type')
        : cabecalhos,
      ...(corpo
        ? {
            body: {
              mode: 'raw',
              raw: corpo,
              options: { raw: { language: 'json' } },
            },
          }
        : {}),
      url: url(caminho, query),
      description: descricao,
    },
    response: [],
  };
}

const pasta = (name, item, description) => ({
  name,
  item,
  ...(description ? { description } : {}),
});

/** Consulta da operação de um módulo (vehicles ou veiculos-desmobilizados) */
const operacao = (name, modulo, testes = [], descricao) =>
  req(name, 'GET', `${modulo}/operations/{{operationId}}`, {
    testes: [
      status(200),
      `pm.test('FINISHED ${AGUARDE}', () => pm.expect(d.status).to.eql('FINISHED'));`,
      ...testes,
    ],
    preRequest: ESPERAR_FILA,
    descricao,
  });

const pedido = (name, method, caminho, opcoes = {}) =>
  req(name, method, caminho, {
    ...opcoes,
    testes: [
      status(opcoes.status ?? 201),
      campo('operação nova', 'd.duplicated', false),
      guardar('operationId', 'd.operationId'),
      ...(opcoes.testes ?? []),
    ],
  });

const novoVeiculo = (sobrescrever = {}) => ({
  companyId: '{{companyId}}',
  licensePlate: '{{newLicensePlate}}',
  chassis: '{{newChassis}}',
  modelId: '{{modelId}}',
  colorId: '{{colorId}}',
  fuelTypeId: '{{fuelTypeId}}',
  manufactureYear: 2025,
  modelYear: 2026,
  ownershipSituationId: 1,
  odometer: 10,
  doors: 4,
  purchase: { companyId: '{{companyId}}', date: '2026-10-30', amount: 89900 },
  notes: 'Inclusão pela collection 02-vehicles',
  ...sobrescrever,
});

const desmobilizacao = (sobrescrever = {}) => ({
  vehicleId: '{{vehicleIdAvailable}}',
  saleTypeId: '{{saleTypeId}}',
  destinationCompanyId: '{{destinationCompanyId}}',
  checklist: {
    inspectionCompletedAt: '2026-10-20T10:00:00Z',
    equipmentCheckedAt: '2026-10-20T11:00:00Z',
    equipmentRemovedAt: '2026-10-21T09:00:00Z',
    salesRestrictionCheckedAt: '2026-10-21T10:00:00Z',
    finesCheckedAt: '2026-10-22T08:00:00Z',
  },
  accidentTraces: false,
  notes: 'Desmobilização pela collection 02-vehicles',
  ...sobrescrever,
});

/* ---------- Pastas ---------- */

const preparacao = pasta('0 - Preparação', [
  req('Token da integração', 'POST', 'auth/token', {
    header: H_SEM_TOKEN,
    body: { clientId: '{{clientId}}', clientSecret: '{{clientSecret}}' },
    testes: [status(200), guardar('accessToken', 'd.accessToken')],
    descricao: 'Gera o JWT usado no header x-api-key das demais requisições.',
  }),
]);

const consulta = pasta(
  '1 - Consulta de veículos',
  [
    req('Listagem paginada', 'GET', 'vehicles', {
      query: [
        ['page', '1'],
        ['limit', '10'],
      ],
      testes: [
        status(200),
        `pm.test('respeita o limite', () => pm.expect((Array.isArray(d) ? d : []).length).to.be.at.most(10));`,
        `pm.test('códigos do LocaviaWeb', () => (Array.isArray(d) ? d : []).forEach((v) => pm.expect(v.locaviaStatus).to.have.property('code')));`,
      ],
    }),
    req('Estoque de venda e sincronização incremental', 'GET', 'vehicles', {
      query: [
        ['status', 'FOR_SALE,TOTAL_LOSS'],
        ['companyId', '{{companyId}}'],
        ['updatedSince', '2026-01-01T00:00:00Z'],
      ],
      testes: [
        status(200),
        `pm.test('só FOR_SALE ou TOTAL_LOSS', () => (Array.isArray(d) ? d : []).forEach((v) => pm.expect(['FOR_SALE', 'TOTAL_LOSS']).to.include(v.status)));`,
      ],
      descricao:
        'updatedSince compara com ModificadoEm (ou InseridoEm, se o veículo nunca foi alterado). As datas são a hora do SQL Server do LocaviaWeb no formato UTC (Z), sem conversão, como no api-locavia-web-ts.',
    }),
    req('Detalhe do veículo', 'GET', 'vehicles/{{vehicleId}}', {
      testes: [
        status(200),
        igualVariavel('id', 'String(d.id)', 'vehicleId'),
        `pm.test('modelo e marca do LocaviaWeb', () => { pm.expect(d.model).to.have.property('id'); pm.expect(d.brand).to.have.property('id'); });`,
      ],
    }),
    req('Movimentações do veículo', 'GET', 'vehicles/{{vehicleId}}/movements', {
      testes: [
        status(200),
        `pm.test('mais recentes primeiro', () => { const t = d.map((m) => Date.parse(m.occurredAt)); pm.expect(t).to.eql([...t].sort((a, b) => b - a)); });`,
      ],
    }),
    req('Veículo inexistente (404)', 'GET', 'vehicles/999999999', {
      testes: [status(404)],
    }),
    req('Sem token (401)', 'GET', 'vehicles', {
      header: H_SEM_TOKEN,
      testes: [status(401)],
    }),
  ],
  'Leituras síncronas direto no banco do LocaviaWeb (SQL Server, mesmo acesso do Asaas), na organização do usuário da integração.',
);

const cadastro = pasta(
  '2 - Cadastro (POST, PATCH, DELETE)',
  [
    pedido('Incluir veículo', 'POST', 'vehicles', {
      body: novoVeiculo(),
      preRequest: GERAR_VEICULO,
      descricao:
        'Confere empresa, modelo, cor, combustível e placa no banco (404/422 na hora) e publica na fila. O receiver chama POST /veiculos do api-locavia-web-ts; o veículo nasce Em preparação (3).',
    }),
    operacao('Consultar inclusão', 'vehicles', [
      campo('em preparação', 'd.result.status', 'IN_PREPARATION'),
      guardar('createdVehicleId', 'd.result.vehicleId'),
    ]),
    req('Veículo incluído', 'GET', 'vehicles/{{createdVehicleId}}', {
      testes: [
        status(200),
        igualVariavel('placa', 'd.licensePlate', 'newLicensePlate'),
        campo('ano fabricação', 'd.manufactureYear', 2025),
      ],
    }),
    pedido('Alterar veículo (parcial)', 'PATCH', 'vehicles/{{createdVehicleId}}', {
      status: 200,
      body: { odometer: 120, notes: 'Alterado pela collection 02-vehicles' },
      descricao:
        'O receiver lê o registro e os filhos (equipamentos, planos de manutenção, implementos, integrações) e reenvia tudo no PUT /veiculos, com as mudanças por cima.',
    }),
    operacao('Consultar alteração', 'vehicles'),
    req('Veículo alterado', 'GET', 'vehicles/{{createdVehicleId}}', {
      testes: [status(200), campo('hodômetro', 'd.odometer', 120)],
    }),
    pedido('Excluir veículo em preparação', 'DELETE', 'vehicles/{{createdVehicleId}}', {
      status: 200,
      descricao: 'DELETE /veiculos do LocaviaWeb: só para veículo Em preparação (3) e sem integração SAP.',
    }),
    operacao('Consultar exclusão', 'vehicles'),
    req('Veículo excluído (404)', 'GET', 'vehicles/{{createdVehicleId}}', {
      testes: [status(404)],
    }),
  ],
  'Escritas assíncronas: operationId na resposta, resultado em /vehicles/operations/{operationId}.',
);

const statusMovimentacao = pasta(
  '3 - Status, movimentação e desmobilização',
  [
    pedido('Disponível → Preparação Venda', 'PATCH', 'vehicles/{{vehicleIdAvailable}}/status', {
      status: 200,
      body: { status: 'SALE_PREPARATION' },
      descricao: 'Vira uma autorização de saída com motivo 11 (POST /veiculos-autorizacao-saida) e a saída (POST /veiculos-movimentacoes), com DataHora = GETDATE() do banco no processamento.',
    }),
    operacao('Consultar troca de status', 'vehicles', [
      campo('em preparação venda', 'd.result.status', 'SALE_PREPARATION'),
      `pm.test('movimentação registrada', () => pm.expect(d.result.movementId).to.be.a('number'));`,
    ]),
    req('Preparação Venda → Venda pelo status (422)', 'PATCH', 'vehicles/{{vehicleIdAvailable}}/status', {
      body: { status: 'FOR_SALE', reason: 'Showroom' },
      testes: [
        status(422),
        `pm.test('indica a desmobilização', () => pm.expect(JSON.stringify(b)).to.include('veiculos-desmobilizados'));`,
      ],
    }),
    pedido('Desmobilizar', 'POST', 'veiculos-desmobilizados', {
      body: desmobilizacao(),
      descricao: 'POST /desmobilizacoes abre a desmobilização e PUT /desmobilizacoes/conclusao conclui; o veículo vai para Venda (8).',
    }),
    operacao('Consultar desmobilização', 'veiculos-desmobilizados', [
      `pm.test('número da desmobilização', () => pm.expect(d.result.decommissionNumber).to.be.a('number'));`,
      campo('veículo à venda', 'd.result.status', 'FOR_SALE'),
    ]),
    req('Veículo desmobilizado', 'GET', 'vehicles/{{vehicleIdAvailable}}', {
      testes: [status(200), campo('status FOR_SALE', 'd.status', 'FOR_SALE')],
    }),
    pedido('Bloquear (restrição)', 'PATCH', 'vehicles/{{vehicleIdBlock}}/status', {
      status: 200,
      body: { status: 'BLOCKED', restrictionId: '{{restrictionId}}' },
      descricao: 'PUT /veiculos/restringir; o core guarda o status anterior (Venda) para o desbloqueio.',
    }),
    operacao('Consultar bloqueio', 'vehicles', [campo('bloqueado', 'd.result.status', 'BLOCKED')]),
    pedido('Desbloquear (volta ao status anterior)', 'PATCH', 'vehicles/{{vehicleIdBlock}}/status', {
      status: 200,
      body: { status: 'FOR_SALE' },
      descricao: 'PUT /veiculos/remover-restricao: só para o status que o veículo tinha antes da restrição.',
    }),
    operacao('Consultar desbloqueio', 'vehicles'),
    pedido('Saída por traslado', 'POST', 'vehicles/{{vehicleIdTransfer}}/movements', {
      body: {
        type: 'EXIT',
        exitReason: 'TRANSFER',
        transferCompanyId: '{{transferCompanyId}}',
        odometer: '{{transferOdometer}}',
        notes: 'Traslado pela collection 02-vehicles',
      },
    }),
    operacao('Consultar saída', 'vehicles', [
      `pm.test('movimentação registrada', () => pm.expect(d.result.movementId).to.be.a('number'));`,
    ]),
    pedido('Entrada na empresa de destino', 'POST', 'vehicles/{{vehicleIdTransfer}}/movements', {
      body: {
        type: 'ENTRY',
        odometer: '{{transferOdometer}}',
        companyId: '{{transferCompanyId}}',
      },
    }),
    operacao('Consultar entrada', 'vehicles', [campo('disponível', 'd.result.status', 'AVAILABLE')]),
    req('Veículo na empresa de destino', 'GET', 'vehicles/{{vehicleIdTransfer}}', {
      testes: [status(200), `pm.test('empresa de destino', () => pm.expect(String(d.companyId)).to.eql(pm.collectionVariables.get('transferCompanyId')));`],
    }),
  ],
  'O LocaviaWeb não tem rota de troca de status: cada transição vira a operação dona dela (restrição, saída/entrada, desmobilização).',
);

const idempotencia = pasta('4 - Idempotência', [
  req('Reenviar a mesma desmobilização', 'POST', 'veiculos-desmobilizados', {
    body: desmobilizacao(),
    testes: [status(201), campo('duplicada', 'd.duplicated', true)],
    descricao: 'O veículo é a chave natural: a mesma operação é devolvida e nada é publicado de novo.',
  }),
  req('Reenviar com a mesma x-idempotency-key', 'PATCH', 'vehicles/{{vehicleId}}', {
    header: [...H_INTEGRACAO, { key: 'x-idempotency-key', value: 'collection-02-vehicles-{{vehicleId}}', type: 'text' }],
    body: { notes: 'Idempotência pela collection 02-vehicles' },
    testes: [
      status(200),
      `pm.test('segunda chamada é duplicada', () => { if (pm.collectionVariables.get('idempotencyFirst')) pm.expect(d.duplicated).to.eql(true); pm.collectionVariables.set('idempotencyFirst', 'done'); });`,
    ],
    descricao: 'Rode duas vezes: a segunda devolve duplicated = true.',
  }),
]);

const validacoes = pasta('5 - Validações', [
  req('Corpo inválido (400)', 'POST', 'vehicles', {
    body: novoVeiculo({ chassis: 'curto', fuelTypeId: undefined }),
    testes: [status(400)],
  }),
  req('Placa já em uso (422)', 'POST', 'vehicles', {
    body: novoVeiculo({ licensePlate: '{{licensePlateInUse}}' }),
    preRequest: GERAR_VEICULO,
    testes: [
      status(422),
      `pm.test('mensagem em inglês (padrão)', () => pm.expect(JSON.stringify(b)).to.include('already belongs to another vehicle'));`,
    ],
  }),
  req('Excluir veículo fora de preparação (422)', 'DELETE', 'vehicles/{{vehicleIdNotAvailable}}', {
    testes: [status(422)],
  }),
  req('Saída de veículo não disponível (422)', 'POST', 'vehicles/{{vehicleIdNotAvailable}}/movements', {
    body: {
      type: 'EXIT',
      exitReason: 'OTHER',
      description: 'Teste',
      odometer: 999999,
    },
    testes: [status(422)],
  }),
  req('Manutenção sem fornecedor (400)', 'POST', 'vehicles/{{vehicleId}}/movements', {
    body: {
      type: 'EXIT',
      exitReason: 'MAINTENANCE',
      odometer: 999999,
    },
    testes: [status(400)],
    descricao: 'Como no core (VeiculosAutorizacaoSaida.validator): manutenção e abastecimento exigem supplierId, transferência entre cidades exige cityId e locação exige customerId e contractId.',
  }),
  req('Bloqueio sem restrição (400)', 'PATCH', 'vehicles/{{vehicleId}}/status', {
    body: { status: 'BLOCKED' },
    testes: [status(400)],
  }),
  req('Operação inexistente (404)', 'GET', 'vehicles/operations/00000000-0000-0000-0000-000000000000', {
    testes: [status(404)],
  }),
]);

/* ---------- Banco ---------- */

/** Veículo sem restrição, reserva, saída em aberto ou desmobilização ativa */
const VEICULO_LIVRE = `
  v.CodigoOrganizacao = @organizacao
  AND v.CodigoRestricao IS NULL
  AND v.CodigoGrupoContratoReservado IS NULL
  AND v.CodigoAutorizacaoSaida IS NULL
  AND NOT EXISTS (SELECT 1 FROM Desmobilizacoes d WITH (NOLOCK)
                   WHERE d.CodigoVeiculo = v.CodigoVeiculo AND d.Situacao <> 'N')
  AND ISNULL((SELECT TOP 1 m.Tipo FROM VeiculosMovimentacoes m WITH (NOLOCK)
               WHERE m.CodigoVeiculo = v.CodigoVeiculo
               ORDER BY m.DataHora DESC, m.CodigoMovimentacao DESC), 'E') = 'E'`;

function obrigatorio(linha, descricao) {
  if (!linha) throw new Error(`Não encontrado no banco: ${descricao}.`);
  return linha;
}

async function lerBanco() {
  const cnpj = process.env.LOCAVIA_WEB_ORGANIZATION;
  if (!process.env.TYPEORM_HOST || !cnpj) {
    throw new Error('Preencha TYPEORM_* e LOCAVIA_WEB_ORGANIZATION no .env.');
  }
  const conexao = await sql.connect({
    server: process.env.TYPEORM_HOST,
    port: Number(process.env.TYPEORM_PORT),
    user: process.env.TYPEORM_USERNAME,
    password: process.env.TYPEORM_PASSWORD,
    database: process.env.TYPEORM_DATABASE,
    options: { encrypt: process.env.TYPEORM_ENCRYPT === 'true', trustServerCertificate: true },
  });
  try {
    const consulta = async (texto, parametros = {}) => {
      const pedido = conexao.request();
      for (const [nome, valor] of Object.entries(parametros)) pedido.input(nome, valor);
      return (await pedido.query(texto)).recordset;
    };

    const [org] = await consulta(
      `SELECT TOP 1 o.CodigoOrganizacao FROM Organizacoes o WITH (NOLOCK)
        INNER JOIN Pessoas p WITH (NOLOCK) ON p.CodigoPessoa = o.CodigoPessoa
        WHERE p.CNPJ = @cnpj`,
      { cnpj },
    );
    const organizacao = obrigatorio(org, `organização do CNPJ ${cnpj}`).CodigoOrganizacao;
    const doBanco = (texto, parametros = {}) => consulta(texto, { organizacao, ...parametros });

    const disponiveis = await doBanco(
      `SELECT TOP 2 v.CodigoVeiculo, v.CodigoEmpresa, v.CodigoModelo, v.CodigoCor, v.CodigoTipoCombustivel, v.Hodometro
         FROM Veiculos v WITH (NOLOCK)
        WHERE v.CodigoStatus = 2 AND v.CodigoModelo IS NOT NULL AND v.CodigoCor IS NOT NULL
          AND v.CodigoTipoCombustivel IS NOT NULL AND ${VEICULO_LIVRE}
          AND v.CodigoEmpresa = (SELECT TOP 1 x.CodigoEmpresa FROM Veiculos x WITH (NOLOCK)
                                  WHERE x.CodigoOrganizacao = @organizacao AND x.CodigoStatus = 2
                                  GROUP BY x.CodigoEmpresa ORDER BY COUNT(1) DESC)
        ORDER BY v.CodigoVeiculo DESC`,
    );
    if (disponiveis.length < 2) throw new Error('Não encontrado no banco: dois veículos Disponíveis (2) livres na mesma empresa.');
    const [disponivel, traslado] = disponiveis;

    const emVenda = await doBanco(
      `SELECT TOP 2 v.CodigoVeiculo FROM Veiculos v WITH (NOLOCK)
        WHERE v.CodigoOrganizacao = @organizacao AND v.CodigoStatus = 8
          AND v.CodigoRestricao IS NULL AND v.CodigoGrupoContratoReservado IS NULL
        ORDER BY v.CodigoVeiculo DESC`,
    );
    if (emVenda.length < 2) throw new Error('Não encontrado no banco: dois veículos em Venda (8) sem restrição nem reserva.');

    const alugado = obrigatorio(
      (
        await doBanco(
          `SELECT TOP 1 v.CodigoVeiculo, v.Placa FROM Veiculos v WITH (NOLOCK)
            WHERE v.CodigoOrganizacao = @organizacao AND v.CodigoStatus = 1 AND v.Placa IS NOT NULL
              AND EXISTS (SELECT 1 FROM VeiculosMovimentacoes m WITH (NOLOCK) WHERE m.CodigoVeiculo = v.CodigoVeiculo)
            ORDER BY v.CodigoVeiculo DESC`,
        )
      )[0],
      'veículo Alugado (1) com movimentações',
    );

    const outraEmpresa = obrigatorio(
      (
        await doBanco(
          `SELECT TOP 1 e.CodigoEmpresa FROM Empresas e WITH (NOLOCK)
            WHERE e.CodigoOrganizacao = @organizacao AND e.CodigoEmpresa <> @empresa
            ORDER BY (SELECT COUNT(1) FROM Veiculos v WITH (NOLOCK) WHERE v.CodigoEmpresa = e.CodigoEmpresa) DESC`,
          { empresa: disponivel.CodigoEmpresa },
        )
      )[0],
      'outra empresa da organização',
    );

    const restricao = obrigatorio(
      (await doBanco('SELECT TOP 1 CodigoRestricao FROM VeiculosRestricoes WITH (NOLOCK) WHERE CodigoOrganizacao = @organizacao ORDER BY CodigoRestricao'))[0],
      'restrição (VeiculosRestricoes)',
    );
    const vendaTipo = obrigatorio(
      (
        await doBanco(
          `SELECT TOP 1 CodigoVendaTipo FROM VendaTipos WITH (NOLOCK)
            WHERE CodigoOrganizacao = @organizacao AND Ativo = 'S' AND ExigeClassificacaoMotivo = 'N'
            ORDER BY CodigoVendaTipo`,
        )
      )[0],
      'tipo de venda ativo sem classificação de motivo (VendaTipos)',
    );

    return {
      vehicleId: alugado.CodigoVeiculo,
      licensePlateInUse: alugado.Placa,
      vehicleIdAvailable: disponivel.CodigoVeiculo,
      vehicleIdTransfer: traslado.CodigoVeiculo,
      transferOdometer: Number(traslado.Hodometro || 0) + 10,
      vehicleIdBlock: emVenda[0].CodigoVeiculo,
      vehicleIdNotAvailable: emVenda[1].CodigoVeiculo,
      companyId: disponivel.CodigoEmpresa,
      transferCompanyId: outraEmpresa.CodigoEmpresa,
      destinationCompanyId: outraEmpresa.CodigoEmpresa,
      modelId: disponivel.CodigoModelo,
      colorId: disponivel.CodigoCor,
      fuelTypeId: disponivel.CodigoTipoCombustivel,
      restrictionId: restricao.CodigoRestricao,
      saleTypeId: vendaTipo.CodigoVendaTipo,
    };
  } finally {
    await conexao.close();
  }
}

async function main() {
  const massa = await lerBanco();
  const variavel = (key, description, value = '') => ({ key, value: String(value), description });
  const doBanco = (key, description) => variavel(key, description, massa[key]);

  const collection = {
    info: {
      name: 'Car Inventory - 02 Veículos',
      description:
        'Veículos do api-locaviaweb-car-inventory sobre o LocaviaWeb: leituras no SQL Server e escritas assíncronas aplicadas pelo api-locavia-web-ts.\n\n' +
        'Antes de cada execução: gere a collection de novo (`node collections/02-vehicles-gerar-collection.cjs` na raiz do car-inventory); a pasta 3 muda o status dos veículos escolhidos.\n\n' +
        'car-inventory no ar com as filas no LocalStack e o api-locavia-web-ts no ar (API_LOCAVIA_WEB_URL). Ordem: 0 → 5, em sequência. Se uma operação mostrar PENDING/PROCESSING, aguarde alguns segundos e reenvie.\n\n' +
        'Contém o AUTH_CLIENT_SECRET: não versione este arquivo.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [preparacao, consulta, cadastro, statusMovimentacao, idempotencia, validacoes],
    variable: [
      variavel('baseUrl', 'URL do car-inventory', `http://localhost:${process.env.PORT || 3001}/car-inventory/v1`),
      variavel('clientId', 'AUTH_CLIENT_ID', process.env.AUTH_CLIENT_ID),
      variavel('clientSecret', 'AUTH_CLIENT_SECRET', process.env.AUTH_CLIENT_SECRET),
      variavel('accessToken', 'gerado com a collection (validade AUTH_TOKEN_EXPIRES_IN_SECONDS); a pasta 0 renova', gerarToken()),
      doBanco('vehicleId', 'Alugado (1) com movimentações'),
      doBanco('vehicleIdAvailable', 'Disponível (2) livre: preparação venda + desmobilização'),
      doBanco('vehicleIdTransfer', 'Disponível (2) livre: traslado'),
      doBanco('vehicleIdBlock', 'Venda (8) sem restrição: bloqueio e desbloqueio'),
      doBanco('vehicleIdNotAvailable', 'Venda (8): validações'),
      doBanco('licensePlateInUse', 'placa do vehicleId'),
      doBanco('companyId', 'CodigoEmpresa do veículo Disponível'),
      doBanco('transferCompanyId', 'outra CodigoEmpresa da organização'),
      doBanco('modelId', 'CodigoModelo'),
      doBanco('colorId', 'CodigoCor'),
      doBanco('fuelTypeId', 'CodigoTipoCombustivel'),
      doBanco('restrictionId', 'CodigoRestricao (VeiculosRestricoes)'),
      doBanco('saleTypeId', 'CodigoVendaTipo'),
      doBanco('destinationCompanyId', 'CodigoEmpresaDestino da desmobilização'),
      variavel('newLicensePlate', 'gerada a cada inclusão'),
      variavel('newChassis', 'gerado a cada inclusão'),
      variavel('createdVehicleId', 'preenchido pela pasta 2'),
      doBanco('transferOdometer', 'Hodometro do vehicleIdTransfer + 10'),
      variavel('operationId', 'última operação pedida'),
    ],
  };

  const destino = path.join(__dirname, '02-vehicles.postman_collection.json');
  fs.writeFileSync(destino, JSON.stringify(collection, null, 2) + '\n');
  console.log(`Collection gerada: ${destino}`);
  console.table(massa);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
