// Gera workflows/pcp-api.sdk.js: o codigo do SDK do n8n com o jsCode de cada
// Code node embutido (JSON.stringify de build/*.js). Rode apos: npm run build
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerBuild = (n) => JSON.stringify(fs.readFileSync(path.join(raiz, 'build', n + '.js'), 'utf8'));

const DOC = '1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww';
const ORIGENS = 'https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173';

const CRED = "credentials: { googleApi: { id: '72hvCT9jkADwOOo1', name: 'Google Sheets - MRBL' } },";
const OPCOES_RAW = "options: { cellFormat: 'RAW', handlingExtraData: 'insertInNewColumn' }";

// Escrita: operation = update | appendOrUpdate | append. match = colunas de casamento.
const escrever = (varName, nome, operation, aba, match) => `const ${varName} = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: '${nome}',
    parameters: {
      resource: 'sheet',
      operation: '${operation}',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: '${DOC}' },
      sheetName: { __rl: true, mode: 'name', value: '${aba}' },
      columns: { mappingMode: 'autoMapInputData', value: null, matchingColumns: ${JSON.stringify(match)}, schema: [] },
      ${OPCOES_RAW}
    },
    ${CRED}
    position: [0, 0]
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
        batching: { batch: { batchSize: 1, batchInterval: 700 } }
      }
    },
    credentials: { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } },
    position: [0, 0]
  },
  output: [{ statusCode: 200, body: {} }]
});`;

const sheets = (varName, nome, aba, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: '${nome}',
    ${extra}alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: '${DOC}' },
      sheetName: { __rl: true, mode: 'name', value: '${aba}' }
    },
    credentials: { googleApi: { id: '72hvCT9jkADwOOo1', name: 'Google Sheets - MRBL' } },
    position: [0, 0]
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
    position: [0, 0]
  },
  output: [{}]
});`;

const code = (varName, nome, arq, modo) => `const ${varName} = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '${nome}',
    parameters: { mode: '${modo || 'runOnceForAllItems'}', language: 'javaScript', jsCode: ${lerBuild(arq)} },
    position: [0, 0]
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
    position: [0, 0]
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
    position: [0, 0]
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
    position: [0, 0]
  }
});`;

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
  code('montarBoard', 'Montar Board', 'montar-board'),
  responder('responderBoard', 'Responder Board'),
  webhook('acaoWebhook', 'Acao', 'POST', 'pcp-acao'),
  sheets('lerFaltantesAcao', 'Ler FALTANTES Acao', 'FALTANTES', unico),
  sheets('lerCaixasPcpAcao', 'Ler CAIXAS_PCP Acao', 'CAIXAS_PCP', unico),
  sheets('lerGanhasAcao', 'Ler CAIXAS GANHAS Acao', 'CAIXAS GANHAS', unico),
  code('processarAcao', 'Processar Acao', 'processar-acao'),
  'const acaoOk = ' + condicao('Acao OK?', '{{ $json.status }}', 'number', 'equals', '200') + ';',
  code('prepararGravacao', 'Preparar Gravacao', 'preparar-gravacao'),
  'const eItem = ' + condicao('E Item?', "{{ $('Processar Acao').first().json.gravacao.aba }}", 'string', 'equals', "'FALTANTES'") + ';',
  escrever('gravarItem', 'Gravar Item', 'update', 'FALTANTES', ['id']),
  escrever('gravarCaixa', 'Gravar Caixa', 'appendOrUpdate', 'CAIXAS_PCP', ['deal_id']),
  code('prepararHistorico', 'Preparar Historico', 'preparar-historico'),
  escrever('gravarHistorico', 'Gravar Historico', 'append', 'HISTORICO_APP', []),
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
    .onTrue(lerFaltantes.to(lerGanhas).to(lerCaixasPcp).to(lerHistorico).to(lerUsuariosBoard).to(montarBoard).to(responderBoard))
    .onFalse(responderBoard))
  .add(acaoWebhook)
  .to(lerFaltantesAcao)
  .to(lerCaixasPcpAcao)
  .to(lerGanhasAcao)
  .to(processarAcao)
  .to(acaoOk
    .onTrue(prepararGravacao.to(eItem
      .onTrue(gravarItem.to(prepararHistorico.to(gravarHistorico.to(responderAcao))))
      .onFalse(gravarCaixa.to(prepararHistorico))))
    .onFalse(responderAcao));
`;

const envio = IMPORT + [
  `const agenda = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 2 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } },
    position: [0, 0]
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
