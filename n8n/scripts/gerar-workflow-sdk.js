// Gera workflows/pcp-api.sdk.js: o codigo do SDK do n8n com o jsCode de cada
// Code node embutido (JSON.stringify de build/*.js). Rode apos: npm run build
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerBuild = (n) => JSON.stringify(fs.readFileSync(path.join(raiz, 'build', n + '.js'), 'utf8'));

const DOC = '1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww';
const ORIGENS = 'https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173';

const { DESTINOS, codigoFiltrar } = require('./destinos');

// Layout: esquerda -> direita, um ramo por faixa horizontal (Login y=0,
// Board y=300, Acao y=600, gravacoes da acao em 3 faixas abaixo). Cada node
// precisa de uma posicao aqui; nome sem posicao derruba o build.
const DX = 220;
const POS = {};
const linha = (y, x0, nomes) => nomes.forEach((n, i) => { if (n) POS[n] = [x0 + i * DX, y]; });
let posAtual = POS;
const posicao = (nome) => {
  const p = posAtual[nome];
  if (!p) throw new Error('Node sem posicao: ' + nome);
  return JSON.stringify(p);
};

linha(0, 0, ['Login', 'Ler USUARIOS', 'Processar Login', 'Responder Login']);
linha(300, 0, ['Board', 'Validar Pedido', 'Precisa Ler?', 'Ler FALTANTES', 'Ler CAIXAS GANHAS', 'Ler CAIXAS_PCP',
  'Ler HISTORICO_APP', 'Ler USUARIOS Board', 'Ler PEDIDOS', 'Ler PEDIDOS_ITENS', 'Ler ETAPAS_PEDIDO', 'Montar Board', 'Responder Board']);
linha(600, 0, ['Acao', 'Pre Validar Acao', 'Pre OK?', 'Ler FALTANTES Acao', 'Ler CAIXAS_PCP Acao', 'Ler CAIXAS GANHAS Acao',
  'Ler PEDIDOS Acao', 'Ler PEDIDOS_ITENS Acao', 'Ler ETAPAS_PEDIDO Acao', 'Processar Acao', 'Acao OK?']);
POS['Responder Pre'] = [3 * DX, 780];
// Gravacoes: 3 destinos por faixa (Filtrar -> Tem? -> Sheets acima, o "nao"
// segue reto para o proximo Filtrar). Faixas em y = 1000, 1300, 1600.
DESTINOS.forEach((d, i) => {
  const x = 3 * DX + (i % 3) * 3 * DX;
  const y = 1000 + Math.floor(i / 3) * 300;
  POS[d.filtrar] = [x, y];
  POS[d.tem] = [x + DX, y];
  POS[d.gravar] = [x + 2 * DX, y - 120];
});
POS['Responder Acao'] = [3 * DX + 9 * DX, 1600];

const POS_ENVIO = {};
posAtual = POS_ENVIO;
[['A cada 2 minutos', 0, 0], ['Ler HISTORICO_APP', 1, 0], ['Marcar Invalidas', 2, -160], ['Gravar Invalidas', 3, -160],
  ['Selecionar Envio', 2, 160], ['Buscar Contato', 3, 160], ['Montar Registro', 4, 160], ['Criar Registro', 5, 160],
  ['Resultado Envio', 6, 160], ['Gravar Envio', 7, 160]].forEach(([n, c, y]) => { POS_ENVIO[n] = [c * DX, y]; });
posAtual = POS;

const CRED = "credentials: { googleApi: { id: '72hvCT9jkADwOOo1', name: 'Google Sheets - MRBL' } },";
const OPCOES_RAW = "options: { cellFormat: 'RAW', handlingExtraData: 'insertInNewColumn' }";
// Todo Google Sheets do workflow da API tenta de novo (cota/instabilidade da
// planilha): 3 tentativas, 3 s entre elas. O workflow de envio fica como esta.
let RETRY = '';
const RETRY_API = 'retryOnFail: true,\n    maxTries: 3,\n    waitBetweenTries: 3000,\n    ';

// Escrita: operation = update | appendOrUpdate | append. match = colunas de casamento.
const escrever = (varName, nome, operation, aba, match, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: '${nome}',
    ${extra || ''}${RETRY}parameters: {
      resource: 'sheet',
      operation: '${operation}',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: '${DOC}' },
      sheetName: { __rl: true, mode: 'name', value: '${aba}' },
      columns: { mappingMode: 'autoMapInputData', value: null, matchingColumns: ${JSON.stringify(match)}, schema: [] },
      ${OPCOES_RAW}
    },
    ${CRED}
    position: ${posicao(nome)}
  },
  output: [{ ok: true }]
});`;

const http = (varName, nome, metodo, url, comCorpo) => `const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: '${nome}',
    parameters: {
      method: '${metodo}',
      url: ${url},
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      ${comCorpo ? "sendBody: true,\n      specifyBody: 'json',\n      jsonBody: expr('{{ JSON.stringify($json.registro) }}')," : ''}
      options: {
        response: { response: { fullResponse: true, neverError: true } },
        batching: { batch: { batchSize: 1, batchInterval: 700 } },
        timeout: 30000
      }
    },
    onError: 'continueRegularOutput',
    credentials: { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } },
    position: ${posicao(nome)}
  },
  output: [{ statusCode: 200, body: {} }]
});`;

const sheets = (varName, nome, aba, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: '${nome}',
    ${extra}${RETRY}alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: '${DOC}' },
      sheetName: { __rl: true, mode: 'name', value: '${aba}' }
    },
    ${CRED}
    position: ${posicao(nome)}
  },
  output: [{ email: 'a@b.com' }]
});`;

const responder = (varName, nome, corpoExpr, statusExpr) => `const ${varName} = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: '${nome}',
    parameters: {
      respondWith: 'json',
      responseBody: expr(${JSON.stringify(corpoExpr || '{{ $json.body }}')}),
      options: {
        responseCode: expr(${JSON.stringify(statusExpr || '{{ $json.status }}')}),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    },
    position: ${posicao(nome)}
  },
  output: [{}]
});`;

const code = (varName, nome, arq, modo) => `const ${varName} = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '${nome}',
    parameters: { mode: '${modo || 'runOnceForAllItems'}', language: 'javaScript', jsCode: ${lerBuild(arq)} },
    position: ${posicao(nome)}
  },
  output: [{ status: 200, body: {} }]
});`;

const condicao = (nome, esq, tipo, op, dir) => `ifElse({
  version: 2.3,
  config: {
    name: '${nome}',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr(${JSON.stringify(esq)}), operator: { type: '${tipo}', operation: '${op}' }, rightValue: ${dir} }],
        combinator: 'and'
      }
    },
    position: ${posicao(nome)}
  }
})`;

const webhook = (varName, nome, metodo, caminho) => `const ${varName} = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: '${nome}',
    parameters: {
      httpMethod: '${metodo}',
      path: '${caminho}',
      responseMode: 'responseNode',
      options: { allowedOrigins: '${ORIGENS}' }
    },
    position: ${posicao(nome)}
  },
  output: [{ headers: {}, body: {} }]
});`;


const IMPORT = "import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';\n\n// GERADO por n8n/scripts/gerar-workflow-sdk.js a partir de n8n/build/*.js. Nao edite a mao.\n\n";
const unico = 'executeOnce: true,\n    ';

const precisaLer = `const precisaLer = ifElse({
  version: 2.3,
  config: {
    name: 'Precisa Ler?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ler }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: ${posicao('Precisa Ler?')}
  }
});`;

// Cadeia de gravacao: Filtrar i -> Tem i? -> (sim) Sheets i -> Filtrar i+1;
// (nao) -> Filtrar i+1. O ultimo segue para Responder Acao. O ramo "nao"
// referencia so o node seguinte (a continuacao ja esta no ramo "sim").
const proximo = (i) => (i + 1 < DESTINOS.length ? 'filtrar' + (i + 1) : 'responderAcao');
const cadeiaGravacao = (i) => (i >= DESTINOS.length ? 'responderAcao'
  : 'filtrar' + i + '.to(tem' + i + '\n      .onTrue(gravar' + i + '.to(' + cadeiaGravacao(i + 1) + '))\n      .onFalse(' + proximo(i) + '))');

RETRY = RETRY_API;
const api = IMPORT + [
  webhook('loginWebhook', 'Login', 'POST', 'pcp-login'),
  sheets('lerUsuarios', 'Ler USUARIOS', 'USUARIOS', ''),
  code('processarLogin', 'Processar Login', 'processar-login'),
  responder('responderLogin', 'Responder Login'),
  webhook('boardWebhook', 'Board', 'GET', 'pcp-board'),
  code('validarPedido', 'Validar Pedido', 'validar-pedido'),
  precisaLer,
  sheets('lerFaltantes', 'Ler FALTANTES', 'FALTANTES', unico),
  sheets('lerGanhas', 'Ler CAIXAS GANHAS', 'CAIXAS GANHAS', unico),
  sheets('lerCaixasPcp', 'Ler CAIXAS_PCP', 'CAIXAS_PCP', unico),
  sheets('lerHistorico', 'Ler HISTORICO_APP', 'HISTORICO_APP', unico),
  sheets('lerUsuariosBoard', 'Ler USUARIOS Board', 'USUARIOS', unico),
  sheets('lerPedidos', 'Ler PEDIDOS', 'PEDIDOS', unico),
  sheets('lerPedidosItens', 'Ler PEDIDOS_ITENS', 'PEDIDOS_ITENS', unico),
  sheets('lerEtapas', 'Ler ETAPAS_PEDIDO', 'ETAPAS_PEDIDO', unico),
  code('montarBoard', 'Montar Board', 'montar-board'),
  responder('responderBoard', 'Responder Board'),
  webhook('acaoWebhook', 'Acao', 'POST', 'pcp-acao'),
  code('preValidarAcao', 'Pre Validar Acao', 'pre-validar-acao'),
  'const preOk = ' + condicao('Pre OK?', '{{ $json.ok }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  responder('responderPre', 'Responder Pre'),
  sheets('lerFaltantesAcao', 'Ler FALTANTES Acao', 'FALTANTES', unico),
  sheets('lerCaixasPcpAcao', 'Ler CAIXAS_PCP Acao', 'CAIXAS_PCP', unico),
  sheets('lerGanhasAcao', 'Ler CAIXAS GANHAS Acao', 'CAIXAS GANHAS', unico),
  sheets('lerPedidosAcao', 'Ler PEDIDOS Acao', 'PEDIDOS', unico),
  sheets('lerPedidosItensAcao', 'Ler PEDIDOS_ITENS Acao', 'PEDIDOS_ITENS', unico),
  sheets('lerEtapasAcao', 'Ler ETAPAS_PEDIDO Acao', 'ETAPAS_PEDIDO', unico),
  code('processarAcao', 'Processar Acao', 'processar-acao'),
  'const acaoOk = ' + condicao('Acao OK?', '{{ $json.status }}', 'number', 'equals', '200') + ';',
  ...DESTINOS.map((d, i) => [
    code('filtrar' + i, d.filtrar, d.arquivo),
    'const tem' + i + ' = ' + condicao(d.tem, '{{ $json._vazio === true }}', 'boolean', 'false', "''")
      .replace("operation: 'false' }", "operation: 'false', singleValue: true }") + ';',
    escrever('gravar' + i, d.gravar, d.operacao, d.aba, d.operacao === 'append' ? [] : [d.chave], 'alwaysOutputData: true,\n    ')
  ].join('\n\n')),
  responder('responderAcao', 'Responder Acao', "{{ $('Processar Acao').first().json.body }}", "{{ $('Processar Acao').first().json.status }}")
].join('\n\n') + `

export default workflow('pcp-mrbl-api', 'PCP MRBL - API', {
  timezone: 'America/Sao_Paulo',
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(loginWebhook)
  .to(lerUsuarios)
  .to(processarLogin)
  .to(responderLogin)
  .add(boardWebhook)
  .to(validarPedido)
  .to(precisaLer
    .onTrue(lerFaltantes.to(lerGanhas).to(lerCaixasPcp).to(lerHistorico).to(lerUsuariosBoard).to(lerPedidos).to(lerPedidosItens).to(lerEtapas).to(montarBoard).to(responderBoard))
    .onFalse(responderBoard))
  .add(acaoWebhook)
  .to(preValidarAcao)
  .to(preOk
    .onTrue(lerFaltantesAcao.to(lerCaixasPcpAcao).to(lerGanhasAcao).to(lerPedidosAcao).to(lerPedidosItensAcao)
      .to(lerEtapasAcao).to(processarAcao).to(acaoOk
    .onTrue(${cadeiaGravacao(0)})
    .onFalse(responderAcao)))
    .onFalse(responderPre));
`;

posAtual = POS_ENVIO;
RETRY = '';
const envio = IMPORT + [
  `const agenda = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 2 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } },
    position: ${posicao('A cada 2 minutos')}
  },
  output: [{}]
});`,
  sheets('lerHistorico', 'Ler HISTORICO_APP', 'HISTORICO_APP', ''),
  code('marcarInvalidas', 'Marcar Invalidas', 'invalidas-envio'),
  escrever('gravarInvalidas', 'Gravar Invalidas', 'update', 'HISTORICO_APP', ['id']),
  code('selecionarEnvio', 'Selecionar Envio', 'selecionar-envio'),
  http('buscarContato', 'Buscar Contato', 'GET', "expr('https://api2.ploomes.com/Deals({{ $json.linha.deal_id }})?$select=Id,ContactId')", false),
  code('montarRegistro', 'Montar Registro', 'montar-registro'),
  http('criarRegistro', 'Criar Registro', 'POST', "'https://api2.ploomes.com/InteractionRecords'", true),
  code('resultadoEnvio', 'Resultado Envio', 'resultado-envio'),
  escrever('gravarEnvio', 'Gravar Envio', 'update', 'HISTORICO_APP', ['id'])
].join('\n\n') + `

export default workflow('pcp-mrbl-envio', 'PCP MRBL - Enviar ao Ploomes', {
  timezone: 'America/Sao_Paulo',
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'all'
})
  .add(agenda)
  .to(lerHistorico)
  .to(marcarInvalidas.to(gravarInvalidas))
  .add(lerHistorico)
  .to(selecionarEnvio.to(buscarContato).to(montarRegistro).to(criarRegistro).to(resultadoEnvio).to(gravarEnvio));
`;

fs.mkdirSync(path.join(raiz, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api.sdk.js'), api);
console.log('workflows/pcp-api.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-envio.sdk.js'), envio);
console.log('workflows/pcp-envio.sdk.js');
