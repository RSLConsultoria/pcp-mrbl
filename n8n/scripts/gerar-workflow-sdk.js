// Gera workflows/pcp-api.sdk.js: o codigo do SDK do n8n com o jsCode de cada
// Code node embutido (JSON.stringify de build/*.js). Rode apos: npm run build
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerBuild = (n) => JSON.stringify(fs.readFileSync(path.join(raiz, 'build', n + '.js'), 'utf8'));

// URLs do lote (batchGet) e id da planilha vem de src/planilhaLote.js.
const { carregar } = require('../test/carregar');
const lote = carregar();
const DOC = lote.PLANILHA_ID;
const ORIGENS = 'https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173';


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
linha(300, 0, ['Board', 'Validar Pedido', 'Precisa Ler?', 'Ler Planilha', 'Montar Board', 'Responder Board']);
linha(600, 0, ['Acao', 'Pre Validar Acao', 'Pre OK?', 'Ler Planilha Acao', 'Processar Acao', 'Acao OK?',
  'Montar Escritas', 'Tem Escritas?', 'Loop Escritas', null, 'Responder Acao']);
POS['Responder Pre'] = [3 * DX, 780];
// Loop: Gravar Lote fica acima do Loop Escritas (volta para ele a cada requisicao).
POS['Gravar Lote'] = [9 * DX, 420];

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

const responder = (varName, nome, corpoExpr, statusExpr, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: '${nome}',
    ${extra || ''}parameters: {
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

// HTTP Request na API do Google Sheets com a credencial googleApi
// (service account; precisa de "Set up for use in HTTP Request node" com o
// escopo spreadsheets). Leitura: GET fixo. Gravacao: POST com url/corpo do item.
const CRED_GOOGLE_HTTP = "credentials: { googleApi: { id: '72hvCT9jkADwOOo1', name: 'Google Sheets - MRBL' } },";
const httpGoogle = (varName, nome, metodo, urlCodigo, comCorpo, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: '${nome}',
    ${extra || ''}${RETRY}parameters: {
      method: '${metodo}',
      url: ${urlCodigo},
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleApi',
      ${comCorpo ? "sendBody: true,\n      specifyBody: 'json',\n      jsonBody: expr('{{ JSON.stringify($json.body) }}'),\n      " : ''}options: { timeout: 30000 }
    },
    ${CRED_GOOGLE_HTTP}
    position: ${posicao(nome)}
  },
  output: [{ valueRanges: [] }]
});`;

// Loop de gravacao: uma requisicao por volta, em ordem. O HTTP Request
// dispara todos os itens de uma vez (Promise.allSettled) e o retry dele
// repetiria as que ja deram certo; dentro do loop cada execucao do Gravar
// Lote e uma requisicao so.
const loopEscritas = `const loopEscritas = splitInBatches({
  version: 3,
  config: {
    name: 'Loop Escritas',
    parameters: { batchSize: 1, options: {} },
    position: ${posicao('Loop Escritas')}
  }
});`;

const temEscritas = 'const temEscritas = ' + condicao('Tem Escritas?', '{{ $json.vazio === true }}', 'boolean', 'false', "''")
  .replace("operation: 'false' }", "operation: 'false', singleValue: true }") + ';';

RETRY = RETRY_API;
const IMPORT_API = IMPORT.replace('ifElse, expr', 'ifElse, splitInBatches, nextBatch, expr');
const gerarApi = (id, nomeWf, sufixo) => IMPORT_API + [
  webhook('loginWebhook', 'Login', 'POST', 'pcp-login' + sufixo),
  sheets('lerUsuarios', 'Ler USUARIOS', 'USUARIOS', ''),
  code('processarLogin', 'Processar Login', 'processar-login'),
  responder('responderLogin', 'Responder Login'),
  webhook('boardWebhook', 'Board', 'GET', 'pcp-board' + sufixo),
  code('validarPedido', 'Validar Pedido', 'validar-pedido'),
  precisaLer,
  httpGoogle('lerPlanilha', 'Ler Planilha', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_BOARD)), false, unico),
  code('montarBoard', 'Montar Board', 'montar-board'),
  responder('responderBoard', 'Responder Board'),
  webhook('acaoWebhook', 'Acao', 'POST', 'pcp-acao' + sufixo),
  code('preValidarAcao', 'Pre Validar Acao', 'pre-validar-acao'),
  'const preOk = ' + condicao('Pre OK?', '{{ $json.ok }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  responder('responderPre', 'Responder Pre'),
  httpGoogle('lerPlanilhaAcao', 'Ler Planilha Acao', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_ACAO)), false, unico),
  code('processarAcao', 'Processar Acao', 'processar-acao'),
  'const acaoOk = ' + condicao('Acao OK?', '{{ $json.status }}', 'number', 'equals', '200') + ';',
  code('montarEscritas', 'Montar Escritas', 'montar-escritas'),
  temEscritas,
  loopEscritas,
  httpGoogle('gravarLote', 'Gravar Lote', 'POST', "expr('{{ $json.url }}')", true),
  responder('responderAcao', 'Responder Acao', "{{ $('Processar Acao').first().json.body }}", "{{ $('Processar Acao').first().json.status }}", unico)
].join('\n\n') + `

export default workflow('${id}', '${nomeWf}', {
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
    .onTrue(lerPlanilha.to(montarBoard).to(responderBoard))
    .onFalse(responderBoard))
  .add(acaoWebhook)
  .to(preValidarAcao)
  .to(preOk
    .onTrue(lerPlanilhaAcao.to(processarAcao).to(acaoOk
      .onTrue(montarEscritas.to(temEscritas
        .onTrue(loopEscritas
          .onDone(responderAcao)
          .onEachBatch(gravarLote.to(nextBatch(loopEscritas))))
        .onFalse(responderAcao)))
      .onFalse(responderAcao)))
    .onFalse(responderPre));
`;

const api = gerarApi('pcp-mrbl-api', 'PCP MRBL - API', '');
const apiHomolog = gerarApi('pcp-mrbl-api-homolog', 'PCP MRBL - API (homolog)', '-h');

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
  http('buscarContato', 'Buscar Contato', 'GET', "expr('https://api2.ploomes.com/Deals({{ $json.grupo.deal_id }})?$select=Id,ContactId')", false),
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
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api-homolog.sdk.js'), apiHomolog);
console.log('workflows/pcp-api-homolog.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-envio.sdk.js'), envio);
console.log('workflows/pcp-envio.sdk.js');
