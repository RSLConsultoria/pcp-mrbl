// Gera workflows/pcp-api.sdk.js: o codigo do SDK do n8n com o jsCode de cada
// Code node embutido (JSON.stringify de build/*.js). Rode apos: npm run build
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerBuild = (n) => JSON.stringify(fs.readFileSync(path.join(raiz, 'build', n + '.js'), 'utf8'));

const DOC = '1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww';
const ORIGENS = 'https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173';

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

const responder = (varName, nome) => `const ${varName} = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: '${nome}',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.body }}'),
      options: {
        responseCode: expr('{{ $json.status }}'),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    },
    position: [0, 0]
  },
  output: [{}]
});`;

const code = (varName, nome, arq) => `const ${varName} = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '${nome}',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${lerBuild(arq)} },
    position: [0, 0]
  },
  output: [{ status: 200, body: {} }]
});`;

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

const txt = `import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// GERADO por n8n/scripts/gerar-workflow-sdk.js a partir de n8n/build/*.js. Nao edite a mao.

${webhook('loginWebhook', 'Login', 'POST', 'pcp-login')}

${sheets('lerUsuarios', 'Ler USUARIOS', 'USUARIOS', '')}

${code('processarLogin', 'Processar Login', 'processar-login')}

${responder('responderLogin', 'Responder Login')}

${webhook('boardWebhook', 'Board', 'GET', 'pcp-board')}

${code('validarPedido', 'Validar Pedido', 'validar-pedido')}

const precisaLer = ifElse({
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
});

${sheets('lerFaltantes', 'Ler FALTANTES', 'FALTANTES', 'executeOnce: true,\n    ')}

${sheets('lerGanhas', 'Ler CAIXAS GANHAS', 'CAIXAS GANHAS', 'executeOnce: true,\n    ')}

${code('montarBoard', 'Montar Board', 'montar-board')}

${responder('responderBoard', 'Responder Board')}

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
    .onTrue(lerFaltantes.to(lerGanhas).to(montarBoard).to(responderBoard))
    .onFalse(responderBoard));
`;

fs.mkdirSync(path.join(raiz, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api.sdk.js'), txt);
console.log('workflows/pcp-api.sdk.js');
