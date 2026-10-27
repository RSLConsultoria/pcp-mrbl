// Gera workflows/pcp-api.sdk.js: o codigo do SDK do n8n com o jsCode de cada
// Code node embutido (JSON.stringify de build/*.js). Rode apos: npm run build
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const lerBuild = (n) => JSON.stringify(fs.readFileSync(path.join(raiz, 'build', n + '.js'), 'utf8'));

// URLs do lote (batchGet) e id da planilha vem de src/planilhaLote.js.
const { carregar } = require('../test/carregar');
const lote = carregar();
// Ids dos subworkflows (marcador CONFIGURAR_* ou id real): scripts/ids-subworkflows.js.
const { IDS_SUBWORKFLOWS, idSubworkflowValido } = require('./ids-subworkflows');
Object.keys(IDS_SUBWORKFLOWS).forEach((k) => { if (!idSubworkflowValido(IDS_SUBWORKFLOWS[k])) throw new Error('Id de subworkflow inválido: ' + k); });
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
  'Montar Alteracao Ploomes', 'Tem Alteracao Ploomes?', 'Gravar Alteracao Ploomes', 'Validar Alteracao Ploomes',
  'Alteracao Ploomes OK?', 'Montar Escritas', 'Tem Escritas?', 'Loop Escritas', 'Limpar Cache', 'Responder Acao']);
POS['Responder Pre'] = [3 * DX, 780];
POS['Responder Falha Ploomes'] = [11 * DX, 780];
// Loop: Repetir? e as duas gravacoes ficam acima do Loop Escritas (voltam para ele a cada
// requisicao); a saida de erro vai para Montar Erro -> Gravar Erro -> Responder Erro.
POS['Repetir?'] = [9 * DX, 400];
POS['Gravar Lote'] = [10 * DX, 320];
POS['Gravar Anexo'] = [10 * DX, 460];
POS['Montar Erro'] = [11 * DX, 390];
POS['Gravar Erro'] = [12 * DX, 390];
POS['Responder Erro'] = [13 * DX, 390];
// Associacao manual gravada: dispara o workflow Interpretar WhatsApp sem esperar.
POS['Pedir Interpretação?'] = [14 * DX, 820];
POS['Montar Pedido de Interpretação'] = [15 * DX, 900];
POS['Disparar Interpretação'] = [16 * DX, 900];
// Visão da peça (F5a): GET pcp-peca lê o Ploomes na hora (cache de 60 s no static data).
// Número que não é OS: segunda leitura, pela referência, na faixa de baixo.
linha(1100, 0, ['Peça', 'Validar Peça', 'Peça Pronta?', 'Buscar Cards da Peça', 'Preparar Leituras da Peça',
  'Peça Pronta (Cards)?', 'Buscar pela Referência?', 'Buscar Registros da Peça', 'Buscar Trocas de Etapa', 'Buscar Etapas do Funil',
  'Montar Peça', 'Responder Peça']);
linha(1300, 7 * DX, ['Buscar Cards por Referência', 'Preparar Referência da Peça']);

const POS_ENVIO = {};
posAtual = POS_ENVIO;
[['A cada 2 minutos', 0, 0], ['Ler HISTORICO_APP', 1, 0], ['Marcar Invalidas', 2, -160], ['Gravar Invalidas', 3, -160],
  ['Selecionar Envio', 2, 160], ['Buscar Contato', 3, 160], ['Montar Registro', 4, 160], ['Criar Registro', 5, 160],
  ['Resultado Envio', 6, 160], ['Gravar Envio', 7, 160]].forEach(([n, c, y]) => { POS_ENVIO[n] = [c * DX, y]; });
posAtual = POS;

const POS_SYNC_PRODUCAO = {};
[['A cada 5 minutos', 0, 0], ['Ler Snapshot Produção', 1, 0], ['Buscar Produção no Ploomes', 2, 0],
  ['Buscar Previstas no Ploomes', 3, 0], ['Montar Sincronização', 4, 0], ['Tem Escritas?', 5, 0],
  ['Loop Escritas Produção', 6, 0], ['Repetir Escrita?', 7, 0], ['Gravar Produção', 8, -100], ['Anexar Produção', 8, 100],
  ['Montar Erro Produção', 7, 260], ['Registrar Erro Produção', 8, 260]]
  .forEach(([n, c, y]) => { POS_SYNC_PRODUCAO[n] = [c * DX, y]; });

const POS_WHATSAPP_SAIDA = {};
[['A cada 2 minutos', 0, 0], ['Execucao Agendada?', 1, 0], ['Ler Fila WhatsApp', 2, 0],
  ['Selecionar Saida WhatsApp', 3, 0], ['Gravar Tentativa WhatsApp', 4, 0], ['Deve Enviar?', 5, 0],
  ['Consultar Conexão', 6, 0], ['Conferir Conexão', 7, 0], ['Conectada?', 8, 0],
  ['Montar Envio WhatsApp', 9, -100], ['Enviar pela Evolution', 10, -100], ['Resultado WhatsApp', 11, -100], ['Resultado sem Conexão', 11, 100], ['Gravar Resultado WhatsApp', 12, 0]]
  .forEach(([n, c, y]) => { POS_WHATSAPP_SAIDA[n] = [c * DX, y]; });

const POS_WHATSAPP_ENTRADA = {};
[['Receber WhatsApp', 0, 0], ['Ler Contexto WhatsApp', 1, 0], ['Preparar Entrada WhatsApp', 2, 0],
  ['Gravar Mensagem?', 3, 0], ['Gravar Mensagem Recebida', 4, 0], ['Confirmar Recebimento', 5, 0],
  ['Precisa Interpretar?', 6, 0], ['Montar Contexto do Intérprete', 7, 0], ['Interpretar com Modelo', 8, 0],
  ['Finalizar Entrada WhatsApp', 9, 0], ['Tem Sugestão?', 10, 0], ['Gravar Sugestão WhatsApp', 11, 0],
  ['Montar Erro de Recepção', 3, 260], ['Registrar Erro de Recepção', 4, 260], ['Solicitar Reentrega', 5, 260],
  ['Montar Erro de Interpretação', 9, 260], ['Registrar Erro de Interpretação', 10, 260],
  // Associador por IA (22/10): quando nenhuma regra fixa liga a mensagem a uma OS.
  ['Precisa Associar?', 7, 520], ['Montar Contexto do Associador', 8, 520], ['Associar com Modelo', 9, 520],
  ['Finalizar Associação', 10, 520], ['Gravar Associação', 11, 520], ['Interpretar Associada?', 12, 520],
  ['Montar Pedido de Interpretação (Entrada)', 13, 520], ['Disparar Interpretação', 14, 520]]
  .forEach(([n, c, y]) => { POS_WHATSAPP_ENTRADA[n] = [c * DX, y]; });

const POS_INTERPRETAR = {};
[['Receber Pedido de Interpretação', 0, 0], ['Ler Contexto da Interpretação', 1, 0], ['Preparar Interpretação', 2, 0],
  ['Deve Interpretar?', 3, 0], ['Gravar Tentativa de Interpretação', 4, 0], ['Montar Contexto do Intérprete', 5, 0],
  ['Interpretar com Modelo', 6, 0], ['Finalizar Interpretação', 7, 0], ['Tem Sugestão?', 8, 0], ['Gravar Sugestão WhatsApp', 9, 0],
  ['Montar Erro de Interpretação', 7, 260], ['Registrar Erro de Interpretação', 8, 260]]
  .forEach(([n, c, y]) => { POS_INTERPRETAR[n] = [c * DX, y]; });

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
// Falha vai para a saida de erro (index 1) em vez de parar o workflow sem resposta.
const ERRO_SAIDA = "onError: 'continueErrorOutput',\n    ";

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
const httpGoogle = (varName, nome, metodo, urlCodigo, comCorpo, extra, retry) => `const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: '${nome}',
    ${extra || ''}${retry === undefined ? RETRY : retry}parameters: {
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

const temAlteracaoPloomes = 'const temAlteracaoPloomes = ' + condicao('Tem Alteracao Ploomes?', '{{ $json.gravar }}', 'boolean', 'true', "''")
  .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';';

// Execute Workflow: esperar = true devolve a saida do subworkflow; false so dispara.
const executarWorkflow = (varName, nome, workflowId, esperar, onError, modo) => `const ${varName} = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: '${nome}',
    onError: '${onError}',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, value: '${workflowId}', mode: 'id' },
      mode: '${modo || 'once'}',
      options: { waitForSubWorkflow: ${esperar} }
    },
    position: ${posicao(nome)}
  },
  output: [${esperar ? '{ interpretacao: {} }' : '{}'}]
});`;

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
  webhook('pecaWebhook', 'Peça', 'GET', 'pcp-peca' + sufixo),
  code('validarPeca', 'Validar Peça', 'validar-peca'),
  'const pecaPronta = ' + condicao('Peça Pronta?', '{{ $json.pronto }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  http('buscarCardsPeca', 'Buscar Cards da Peça', 'GET', "expr('{{ $json.url }}')", false),
  code('prepararLeiturasPeca', 'Preparar Leituras da Peça', 'preparar-leituras-peca'),
  'const pecaProntaCards = ' + condicao('Peça Pronta (Cards)?', '{{ $json.pronto }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  'const pecaPorReferencia = ' + condicao('Buscar pela Referência?', '{{ $json.buscarReferencia }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  http('buscarCardsReferencia', 'Buscar Cards por Referência', 'GET', "expr('{{ $json.url }}')", false),
  code('prepararReferenciaPeca', 'Preparar Referência da Peça', 'preparar-referencia-peca'),
  http('buscarRegistrosPeca', 'Buscar Registros da Peça', 'GET', "expr('{{ $json.urls.registros }}')", false),
  http('buscarTrocasEtapa', 'Buscar Trocas de Etapa', 'GET', 'expr(' + JSON.stringify("{{ $('Preparar Leituras da Peça').first().json.urls.trocas }}") + ')', false),
  http('buscarEtapasFunil', 'Buscar Etapas do Funil', 'GET', 'expr(' + JSON.stringify("{{ $('Preparar Leituras da Peça').first().json.urls.etapas }}") + ')', false),
  code('montarPeca', 'Montar Peça', 'montar-peca'),
  responder('responderPeca', 'Responder Peça'),
  webhook('acaoWebhook', 'Acao', 'POST', 'pcp-acao' + sufixo),
  code('preValidarAcao', 'Pre Validar Acao', 'pre-validar-acao'),
  'const preOk = ' + condicao('Pre OK?', '{{ $json.ok }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  responder('responderPre', 'Responder Pre'),
  httpGoogle('lerPlanilhaAcao', 'Ler Planilha Acao', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_ACAO)), false, unico),
  code('processarAcao', 'Processar Acao', 'processar-acao'),
  'const acaoOk = ' + condicao('Acao OK?', '{{ $json.status }}', 'number', 'equals', '200') + ';',
  code('montarAlteracaoPloomes', 'Montar Alteracao Ploomes', 'montar-alteracao-ploomes'),
  temAlteracaoPloomes,
  http('gravarAlteracaoPloomes', 'Gravar Alteracao Ploomes', 'PATCH', "expr('{{ $json.url }}')", true),
  code('validarAlteracaoPloomes', 'Validar Alteracao Ploomes', 'validar-alteracao-ploomes'),
  'const alteracaoPloomesOk = ' + condicao('Alteracao Ploomes OK?', '{{ $json.ok }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  responder('responderFalhaPloomes', 'Responder Falha Ploomes', '{{ { erro: $json.erro } }}', '{{ 502 }}', unico),
  code('montarEscritas', 'Montar Escritas', 'montar-escritas'),
  temEscritas,
  loopEscritas,
  'const repetir = ' + condicao('Repetir?', '{{ $json.repetir }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  // batchUpdate (idempotente): retry 3x. Append: sem retry (repetir duplicaria linhas).
  // Os dois mandam a falha para a saida de erro (Montar Erro).
  httpGoogle('gravarLote', 'Gravar Lote', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  httpGoogle('gravarAnexo', 'Gravar Anexo', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('limparCache', 'Limpar Cache', 'limpar-cache'),
  // Associacao manual gravada: pede a interpretacao ao workflow Interpretar WhatsApp
  // sem esperar (a resposta ao site nao muda); falha no disparo nao muda a resposta.
  'const pedirInterpretacao = ' + condicao('Pedir Interpretação?', "{{ !!$('Processar Acao').first().json.interpretar }}", 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  code('montarPedidoInterpretacao', 'Montar Pedido de Interpretação', 'montar-pedido-interpretacao'),
  executarWorkflow('dispararInterpretacao', 'Disparar Interpretação', IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP, false, 'continueRegularOutput'),
  code('montarErro', 'Montar Erro', 'montar-erro'),
  httpGoogle('gravarErro', 'Gravar Erro', 'POST', "expr('{{ $json.url }}')", true, "onError: 'continueRegularOutput',\n    ", ''),
  responder('responderErro', 'Responder Erro', "{{ $('Montar Erro').first().json.resposta }}", '{{ 500 }}', unico),
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
  .add(pecaWebhook)
  .to(validarPeca)
  .to(pecaPronta
    .onTrue(responderPeca)
    .onFalse(buscarCardsPeca.to(prepararLeiturasPeca).to(pecaProntaCards
      .onTrue(responderPeca)
      .onFalse(pecaPorReferencia
        .onTrue(buscarCardsReferencia.to(prepararReferenciaPeca).to(responderPeca))
        .onFalse(buscarRegistrosPeca.to(buscarTrocasEtapa).to(buscarEtapasFunil).to(montarPeca).to(responderPeca))))))
  .add(acaoWebhook)
  .to(preValidarAcao)
  .to(preOk
    .onTrue(lerPlanilhaAcao.to(processarAcao).to(acaoOk
      .onTrue(montarAlteracaoPloomes.to(temAlteracaoPloomes
        .onTrue(gravarAlteracaoPloomes.to(validarAlteracaoPloomes).to(alteracaoPloomesOk
          .onTrue(montarEscritas.to(temEscritas
            .onTrue(loopEscritas
              .onDone(limparCache.to(pedirInterpretacao
                .onTrue(montarPedidoInterpretacao.to(dispararInterpretacao).to(responderAcao))
                .onFalse(responderAcao)))
              .onEachBatch(repetir
                .onTrue(gravarLote.onError(montarErro.to(gravarErro).to(responderErro)).to(nextBatch(loopEscritas)))
                .onFalse(gravarAnexo.onError(montarErro).to(nextBatch(loopEscritas)))))
            .onFalse(responderAcao)))
          .onFalse(responderFalhaPloomes)))
        .onFalse(montarEscritas.to(temEscritas
        .onTrue(loopEscritas
          .onDone(limparCache.to(pedirInterpretacao
                .onTrue(montarPedidoInterpretacao.to(dispararInterpretacao).to(responderAcao))
                .onFalse(responderAcao)))
          .onEachBatch(repetir
            .onTrue(gravarLote.onError(montarErro.to(gravarErro).to(responderErro)).to(nextBatch(loopEscritas)))
            .onFalse(gravarAnexo.onError(montarErro).to(nextBatch(loopEscritas)))))
        .onFalse(responderAcao)))))
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

// GET paginado no Ploomes por $skip (100 por página, 700 ms entre páginas), com
// 3 tentativas a cada 30 s (429/5xx) e saída de erro para o registro no ERROS_APP.
// extra: executeOnce quando o node vem depois de outro que devolve várias páginas.
const buscarPloomes = (varName, nome, url, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: '${nome}',
    ${extra || ''}retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET',
      url: '${url}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {
        response: { response: { fullResponse: true, neverError: false } },
        pagination: { pagination: {
          paginationMode: 'updateAParameterInEachRequest',
          parameters: { parameters: [{ type: 'qs', name: '$skip', value: expr('{{ $pageCount * 100 }}') }] },
          paginationCompleteWhen: 'other',
          completeExpression: expr('{{ !Array.isArray($response.body.value) || $response.body.value.length < 100 }}'),
          requestInterval: 700
        } },
        timeout: 30000
      }
    },
    credentials: { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } },
    position: ${posicao(nome)}
  },
  output: [{ statusCode: 200, body: { value: [] } }]
});`;

const PLOOMES = 'https://public-api2.ploomes.com/';
const { urlsPloomes } = require('./gerar-workflow-sdk-urls');
// As URLs entram em strings com aspas simples no SDK: as aspas do $filter vão escapadas.
const escAspas = (u) => u.split("'").join(String.fromCharCode(92) + "'");
const URL_COSTURA = escAspas(urlsPloomes.costura);
const URL_PREVISTAS = escAspas(urlsPloomes.previstas);

posAtual = POS_SYNC_PRODUCAO;
RETRY = RETRY_API;
const urlSnapshotProducao = lote.urlLeitura(DOC, lote.LEITURAS_SYNC_PRODUCAO);
const syncProducao = IMPORT_API + [
  `const agendaProducao = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 5 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
    position: ${posicao('A cada 5 minutos')}
  },
  output: [{}]
});`,
  httpGoogle('lerSnapshotProducao', 'Ler Snapshot Produção', 'GET', JSON.stringify(urlSnapshotProducao), false, ERRO_SAIDA),
  buscarPloomes('buscarProducao', 'Buscar Produção no Ploomes', URL_COSTURA),
  buscarPloomes('buscarPrevistas', 'Buscar Previstas no Ploomes', URL_PREVISTAS, unico),
  code('montarSyncProducao', 'Montar Sincronização', 'sincronizar-producao'),
  'const temEscritasProducao = ' + condicao('Tem Escritas?', '{{ $json.vazio === true }}', 'boolean', 'false', "''")
    .replace("operation: 'false' }", "operation: 'false', singleValue: true }") + ';',
  `const loopEscritasProducao = splitInBatches({
  version: 3,
  config: {
    name: 'Loop Escritas Produção',
    parameters: { batchSize: 1, options: {} },
    position: ${posicao('Loop Escritas Produção')}
  }
});`,
  'const repetirEscritaProducao = ' + condicao('Repetir Escrita?', '{{ $json.repetir }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarProducao', 'Gravar Produção', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  httpGoogle('anexarProducao', 'Anexar Produção', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('montarErroProducao', 'Montar Erro Produção', 'montar-erro-producao'),
  httpGoogle('registrarErroProducao', 'Registrar Erro Produção', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

  export default workflow('pcp-mrbl-producao-sync', 'PCP MRBL - Sincronizar Produção', {
    timezone: 'America/Sao_Paulo',
    executionTimeout: 240,
    saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'all'
})
  .add(agendaProducao)
  .to(lerSnapshotProducao
    .onError(montarErroProducao.to(registrarErroProducao))
    .to(buscarProducao
      .onError(montarErroProducao.to(registrarErroProducao))
      .to(buscarPrevistas
        .onError(montarErroProducao.to(registrarErroProducao))
        .to(montarSyncProducao)
      .to(temEscritasProducao
        .onTrue(loopEscritasProducao
          .onEachBatch(repetirEscritaProducao
            .onTrue(gravarProducao
              .onError(montarErroProducao.to(registrarErroProducao))
              .to(nextBatch(loopEscritasProducao)))
            .onFalse(anexarProducao
              .onError(montarErroProducao.to(registrarErroProducao))
              .to(nextBatch(loopEscritasProducao)))))))));
`;

posAtual = POS_WHATSAPP_SAIDA;
RETRY = RETRY_API;
const whatsappSaida = IMPORT + [
  `const agendaWhatsapp = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 2 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } },
    position: ${posicao('A cada 2 minutos')}
  },
  output: [{}]
});`,
  'const execucaoAgendadaWhatsapp = ' + condicao('Execucao Agendada?', '{{ $execution.mode }}', 'string', 'equals', "'production'") + ';',
  sheets('lerFilaWhatsapp', 'Ler Fila WhatsApp', 'WHATSAPP_MENSAGENS', ''),
  code('selecionarWhatsapp', 'Selecionar Saida WhatsApp', 'selecionar-whatsapp-saida'),
  escrever('gravarTentativaWhatsapp', 'Gravar Tentativa WhatsApp', 'update', 'WHATSAPP_MENSAGENS', ['id']),
  'const deveEnviarWhatsapp = ' + condicao('Deve Enviar?', "{{ $('Selecionar Saida WhatsApp').first().json.status_envio }}", 'string', 'equals', "'ENVIANDO'") + ';',
  // Corpo do sendText com a citação (22/10): montado fora dos nós que gravam na planilha.
  code('montarEnvioWhatsapp', 'Montar Envio WhatsApp', 'montar-envio-whatsapp'),
  `const enviarWhatsapp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Enviar pela Evolution',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://evolution:8080/message/sendText/producao',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($json.corpo) }}"),
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 }
    },
    credentials: { httpHeaderAuth: { id: 'G24I6UDBgu3Z5X0b', name: 'Evolution API' } },
    position: ${posicao('Enviar pela Evolution')}
  },
  output: [{ statusCode: 200, body: { key: { id: 'evolution-ficticio' } } }]
});`,
  code('resultadoWhatsapp', 'Resultado WhatsApp', 'resultado-whatsapp-saida'),
  // Instância desconectada: conferida antes do sendText (o 400 do envio tem texto livre
  // e pode vir depois de a mensagem sair). Fechada ou sem resposta: nem envia.
  `const consultarConexao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Consultar Conexão',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'http://evolution:8080/instance/connectionState/producao',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 }
    },
    credentials: { httpHeaderAuth: { id: 'G24I6UDBgu3Z5X0b', name: 'Evolution API' } },
    position: ${posicao('Consultar Conexão')}
  },
  output: [{ statusCode: 200, body: { instance: { state: 'open' } } }]
});`,
  code('conferirConexao', 'Conferir Conexão', 'conferir-conexao-whatsapp'),
  'const conectada = ' + condicao('Conectada?', '{{ $json.conectada }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  code('resultadoSemConexao', 'Resultado sem Conexão', 'resultado-sem-conexao-whatsapp'),
  escrever('gravarResultadoWhatsapp', 'Gravar Resultado WhatsApp', 'update', 'WHATSAPP_MENSAGENS', ['id'])
].join('\n\n') + `

export default workflow('pcp-mrbl-whatsapp-saida', 'PCP MRBL - Enviar WhatsApp', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 90,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(agendaWhatsapp)
  .to(execucaoAgendadaWhatsapp.onTrue(lerFilaWhatsapp
    .to(selecionarWhatsapp)
    .to(gravarTentativaWhatsapp)
    .to(deveEnviarWhatsapp.onTrue(consultarConexao.to(conferirConexao).to(conectada
      .onTrue(montarEnvioWhatsapp.to(enviarWhatsapp).to(resultadoWhatsapp).to(gravarResultadoWhatsapp))
      .onFalse(resultadoSemConexao.to(gravarResultadoWhatsapp)))))));
`;

posAtual = POS_WHATSAPP_ENTRADA;
RETRY = RETRY_API;
const urlContextoWhatsapp = lote.urlLeitura(DOC, lote.LEITURAS_WHATSAPP_ENTRADA);
const whatsappEntrada = IMPORT + [
  `const receberWhatsapp = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receber WhatsApp',
    parameters: {
      httpMethod: 'POST',
      path: 'pcp-whatsapp-entrada-CONFIGURAR_SEGREDO',
      responseMode: 'responseNode',
      options: {}
    },
    position: ${posicao('Receber WhatsApp')}
  },
  output: [{ headers: {}, body: {} }]
});`,
  httpGoogle('lerContextoWhatsapp', 'Ler Contexto WhatsApp', 'GET', JSON.stringify(urlContextoWhatsapp), false, ERRO_SAIDA),
  `const prepararEntradaWhatsapp = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar Entrada WhatsApp',
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${lerBuild('preparar-whatsapp-entrada')} },
    position: ${posicao('Preparar Entrada WhatsApp')}
  },
  output: [{ gravar: false, precisaInterpretar: false }]
});`,
  'const deveGravarMensagemWhatsapp = ' + condicao('Gravar Mensagem?', '{{ $json.gravar }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarMensagemWhatsapp', 'Gravar Mensagem Recebida', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  `const confirmarRecebimentoWhatsapp = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Confirmar Recebimento',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { ok: true } }}'),
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    },
    position: ${posicao('Confirmar Recebimento')}
  },
  output: [{}]
});`,
  'const precisaInterpretarWhatsapp = ' + condicao('Precisa Interpretar?', "{{ $('Preparar Entrada WhatsApp').first().json.precisaInterpretar }}", 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  code('montarContextoInterprete', 'Montar Contexto do Intérprete', 'montar-contexto-interprete'),
  `const interpretarComModelo = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Interpretar com Modelo',
    onError: 'continueErrorOutput',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, value: '${IDS_SUBWORKFLOWS.INTERPRETE}', mode: 'id' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    position: ${posicao('Interpretar com Modelo')}
  },
  output: [{ interpretacao: {} }]
});`,
  `const finalizarEntradaWhatsapp = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Finalizar Entrada WhatsApp',
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${lerBuild('finalizar-whatsapp-entrada')} },
    position: ${posicao('Finalizar Entrada WhatsApp')}
  },
  output: [{ gravar: true }]
});`,
  'const temSugestaoWhatsapp = ' + condicao('Tem Sugestão?', '{{ $json.gravar }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarSugestaoWhatsapp', 'Gravar Sugestão WhatsApp', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('montarErroRecepcaoWhatsapp', 'Montar Erro de Recepção', 'montar-erro-whatsapp-entrada'),
  httpGoogle('registrarErroRecepcaoWhatsapp', 'Registrar Erro de Recepção', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", ''),
  `const solicitarReentregaWhatsapp = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Solicitar Reentrega',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { ok: false } }}'),
      options: { responseCode: 503, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    },
    position: ${posicao('Solicitar Reentrega')}
  },
  output: [{}]
});`,
  code('montarErroInterpretacaoWhatsapp', 'Montar Erro de Interpretação', 'montar-erro-whatsapp-entrada'),
  httpGoogle('registrarErroInterpretacaoWhatsapp', 'Registrar Erro de Interpretação', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", ''),
  'const precisaAssociarWhatsapp = ' + condicao('Precisa Associar?', "{{ $('Preparar Entrada WhatsApp').first().json.precisaAssociar }}", 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  code('montarContextoAssociador', 'Montar Contexto do Associador', 'montar-contexto-associador'),
  `const associarComModelo = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Associar com Modelo',
    onError: 'continueErrorOutput',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, value: '${IDS_SUBWORKFLOWS.ASSOCIADOR}', mode: 'id' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    position: ${posicao('Associar com Modelo')}
  },
  output: [{ associacao: {} }]
});`,
  `const finalizarAssociacao = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Finalizar Associação',
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${lerBuild('finalizar-associacao')} },
    position: ${posicao('Finalizar Associação')}
  },
  output: [{ url: '', interpretar: null }]
});`,
  httpGoogle('gravarAssociacao', 'Gravar Associação', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  'const interpretarAssociada = ' + condicao('Interpretar Associada?', "{{ !!$('Finalizar Associação').first().json.interpretar }}", 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  code('montarPedidoInterpretacaoEntrada', 'Montar Pedido de Interpretação (Entrada)', 'montar-pedido-interpretacao-entrada'),
  executarWorkflow('dispararInterpretacaoEntrada', 'Disparar Interpretação', IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP, false, 'continueRegularOutput')
].join('\n\n') + `

export default workflow('pcp-mrbl-whatsapp-entrada', 'PCP MRBL - Receber WhatsApp', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 90,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(receberWhatsapp)
  .to(lerContextoWhatsapp.onError(
    montarErroRecepcaoWhatsapp.to(registrarErroRecepcaoWhatsapp).to(solicitarReentregaWhatsapp)))
  .add(lerContextoWhatsapp).to(
    prepararEntradaWhatsapp.onError(
      montarErroRecepcaoWhatsapp.to(registrarErroRecepcaoWhatsapp).to(solicitarReentregaWhatsapp)))
  .add(prepararEntradaWhatsapp).to(deveGravarMensagemWhatsapp)
  .add(deveGravarMensagemWhatsapp.onTrue(
    gravarMensagemWhatsapp.onError(
      montarErroRecepcaoWhatsapp.to(registrarErroRecepcaoWhatsapp).to(solicitarReentregaWhatsapp))))
  .add(deveGravarMensagemWhatsapp.onFalse(confirmarRecebimentoWhatsapp))
  .add(gravarMensagemWhatsapp).to(confirmarRecebimentoWhatsapp)
  .add(confirmarRecebimentoWhatsapp).to(precisaInterpretarWhatsapp)
  .add(precisaInterpretarWhatsapp.onTrue(
    montarContextoInterprete.to(
      interpretarComModelo.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp)))))
  .add(interpretarComModelo).to(
    finalizarEntradaWhatsapp.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp)))
  .add(finalizarEntradaWhatsapp).to(temSugestaoWhatsapp)
  .add(temSugestaoWhatsapp.onTrue(
    gravarSugestaoWhatsapp.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp))))
  .add(precisaInterpretarWhatsapp.onFalse(precisaAssociarWhatsapp))
  .add(precisaAssociarWhatsapp.onTrue(
    montarContextoAssociador.to(
      associarComModelo.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp)))))
  .add(associarComModelo).to(
    finalizarAssociacao.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp)))
  .add(finalizarAssociacao).to(
    gravarAssociacao.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp)))
  .add(gravarAssociacao).to(interpretarAssociada)
  .add(interpretarAssociada.onTrue(montarPedidoInterpretacaoEntrada.to(dispararInterpretacaoEntrada)));
`;

// Associacao manual (ajuste de 16/10): a API dispara este workflow sem esperar com
// { mensagemId, dealId }. Ele le a planilha, monta o mesmo contexto da entrada, chama
// o mesmo interprete (CONFIGURAR_INTERPRETE) e grava a sugestao PENDENTE com id
// deterministico. Nunca responde nem envia ao grupo.
posAtual = POS_INTERPRETAR;
RETRY = RETRY_API;
const codeComErro = (varName, nome, arq, saida) => `const ${varName} = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: '${nome}',
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${lerBuild(arq)} },
    position: ${posicao(nome)}
  },
  output: [${saida}]
});`;
const interpretarWhatsapp = IMPORT + [
  `const receberPedidoInterpretacao = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'Receber Pedido de Interpretação',
    parameters: { inputSource: 'passthrough' },
    position: ${posicao('Receber Pedido de Interpretação')}
  },
  output: [{ mensagemId: 'WA-R-ficticio', dealId: '700001' }]
});`,
  httpGoogle('lerContextoInterpretacao', 'Ler Contexto da Interpretação', 'GET', JSON.stringify(urlContextoWhatsapp), false, ERRO_SAIDA + unico),
  codeComErro('prepararInterpretacao', 'Preparar Interpretação', 'preparar-interpretacao-manual', '{ interpretar: false }'),
  'const deveInterpretar = ' + condicao('Deve Interpretar?', '{{ $json.interpretar }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  // Reserva da tentativa (batchUpdate idempotente, com retry) antes do modelo.
  httpGoogle('gravarTentativaInterpretacao', 'Gravar Tentativa de Interpretação', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  code('montarContextoInterpretacao', 'Montar Contexto do Intérprete', 'montar-contexto-interpretacao-manual'),
  executarWorkflow('interpretarComModeloManual', 'Interpretar com Modelo', IDS_SUBWORKFLOWS.INTERPRETE, true, 'continueErrorOutput'),
  codeComErro('finalizarInterpretacao', 'Finalizar Interpretação', 'finalizar-interpretacao-manual', '{ gravar: true }'),
  'const temSugestaoManual = ' + condicao('Tem Sugestão?', '{{ $json.gravar }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarSugestaoManual', 'Gravar Sugestão WhatsApp', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('montarErroInterpretacaoManual', 'Montar Erro de Interpretação', 'montar-erro-interpretacao-manual'),
  httpGoogle('registrarErroInterpretacaoManual', 'Registrar Erro de Interpretação', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

export default workflow('pcp-mrbl-interpretar-whatsapp', 'PCP MRBL - Interpretar WhatsApp', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 120,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(receberPedidoInterpretacao)
  .to(lerContextoInterpretacao.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual)))
  .add(lerContextoInterpretacao).to(
    prepararInterpretacao.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual)))
  .add(prepararInterpretacao).to(deveInterpretar)
  .add(deveInterpretar.onTrue(
    gravarTentativaInterpretacao.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual))))
  .add(gravarTentativaInterpretacao).to(montarContextoInterpretacao.to(
      interpretarComModeloManual.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual))))
  .add(interpretarComModeloManual).to(
    finalizarInterpretacao.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual)))
  .add(finalizarInterpretacao).to(temSugestaoManual)
  .add(temSugestaoManual.onTrue(
    gravarSugestaoManual.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual))));
`;

// Novas tentativas do interprete (16/10): a cada 15 min marca ERRO definitivo nas
// mensagens que esgotaram as 5 tentativas, reserva (conta) a tentativa das vencidas
// e so entao as manda, uma a uma, ao Interpretar WhatsApp (mesmo caminho da
// associacao manual), que nao conta de novo (reservada: true).
const POS_RETENTAR = {};
[['A cada 15 minutos', 0, 0], ['Ler Interpretações Pendentes', 1, 0], ['Marcar Tentativas', 2, 0],
  ['Gravar Tentativas', 3, 0], ['Selecionar Interpretações', 4, 0], ['Interpretar de Novo', 5, 0],
  ['Fechar Perguntas Vencidas', 2, 260], ['Gravar Perguntas Fechadas', 3, 260]]
  .forEach(([n, c, y]) => { POS_RETENTAR[n] = [c * DX, y]; });
posAtual = POS_RETENTAR;
RETRY = RETRY_API;
const retentarInterpretacao = IMPORT + [
  `const agendaRetentar = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 15 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
    position: ${posicao('A cada 15 minutos')}
  },
  output: [{}]
});`,
  httpGoogle('lerPendentesInterpretacao', 'Ler Interpretações Pendentes', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_RETENTAR_INTERPRETACAO)), false, unico),
  code('selecionarInterpretacoes', 'Selecionar Interpretações', 'selecionar-interpretacoes-pendentes'),
  executarWorkflow('interpretarDeNovo', 'Interpretar de Novo', IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP, true, 'continueRegularOutput', 'each'),
  code('marcarTentativas', 'Marcar Tentativas', 'marcar-tentativas-interpretacao'),
  // batchUpdate idempotente, com retry; se falhar, o workflow para sem disparar.
  httpGoogle('gravarTentativas', 'Gravar Tentativas', 'POST', "expr('{{ $json.url }}')", true),
  // Perguntas do associador com mais de 24 h (22/10). Falha aqui não para as novas tentativas.
  code('fecharPerguntasVencidas', 'Fechar Perguntas Vencidas', 'fechar-perguntas-vencidas'),
  httpGoogle('gravarPerguntasFechadas', 'Gravar Perguntas Fechadas', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

export default workflow('pcp-mrbl-retentar-interpretacao', 'PCP MRBL - Retentar Interpretação', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 840,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(agendaRetentar)
  .to(lerPendentesInterpretacao)
  .to(marcarTentativas)
  .to(gravarTentativas)
  .to(selecionarInterpretacoes)
  .to(interpretarDeNovo)
  .add(lerPendentesInterpretacao).to(fecharPerguntasVencidas).to(gravarPerguntasFechadas);
`;

// Médias de Previsão (19/10): todo dia às 3h lê os registros de etapa marcados no
// Ploomes e os negócios dos funis PCP e Produção, calcula durações, filas e a
// Costura por oficina e grava a PREVISAO_MEDIAS (update por chave, append da chave
// nova, nunca apaga). Falha de leitura: médias anteriores ficam e vai para ERROS_APP.
// Todos os registros com o marcador (a média de Costura por oficina não tem janela)
// e os negócios dos dois funis, em qualquer situação.
const URL_REGISTROS_PREVISAO = escAspas(urlsPloomes.registrosPrevisao);
const URL_NEGOCIOS_PREVISAO = escAspas(urlsPloomes.negociosPrevisao);
const POS_MEDIAS = {};
[['Todo dia às 3h', 0, 0], ['Ler Médias Atuais', 1, 0], ['Buscar Registros no Ploomes', 2, 0],
  ['Buscar Negócios no Ploomes', 3, 0], ['Montar Médias', 4, 0], ['Tem Escritas?', 5, 0],
  ['Loop Escritas Médias', 6, 0], ['Repetir Escrita?', 7, 0], ['Gravar Médias', 8, -100], ['Anexar Médias', 8, 100],
  ['Montar Erro Médias', 7, 260], ['Registrar Erro Médias', 8, 260]]
  .forEach(([n, c, y]) => { POS_MEDIAS[n] = [c * DX, y]; });
posAtual = POS_MEDIAS;
RETRY = RETRY_API;
const mediasPrevisao = IMPORT_API + [
  `const agendaMedias = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Todo dia às 3h',
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 3 }] } },
    position: ${posicao('Todo dia às 3h')}
  },
  output: [{}]
});`,
  httpGoogle('lerMediasAtuais', 'Ler Médias Atuais', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_MEDIAS_PREVISAO)), false, ERRO_SAIDA),
  buscarPloomes('buscarRegistros', 'Buscar Registros no Ploomes', URL_REGISTROS_PREVISAO),
  buscarPloomes('buscarNegocios', 'Buscar Negócios no Ploomes', URL_NEGOCIOS_PREVISAO, unico),
  code('montarMedias', 'Montar Médias', 'montar-medias-previsao'),
  'const temEscritasMedias = ' + condicao('Tem Escritas?', '{{ $json.vazio === true }}', 'boolean', 'false', "''")
    .replace("operation: 'false' }", "operation: 'false', singleValue: true }") + ';',
  `const loopEscritasMedias = splitInBatches({
  version: 3,
  config: {
    name: 'Loop Escritas Médias',
    parameters: { batchSize: 1, options: {} },
    position: ${posicao('Loop Escritas Médias')}
  }
});`,
  'const repetirEscritaMedias = ' + condicao('Repetir Escrita?', '{{ $json.repetir }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarMedias', 'Gravar Médias', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  httpGoogle('anexarMedias', 'Anexar Médias', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('montarErroMedias', 'Montar Erro Médias', 'montar-erro-medias'),
  httpGoogle('registrarErroMedias', 'Registrar Erro Médias', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

export default workflow('pcp-mrbl-medias-previsao', 'PCP MRBL - Médias de Previsão', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 1800,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'all'
})
  .add(agendaMedias)
  .to(lerMediasAtuais
    .onError(montarErroMedias.to(registrarErroMedias))
    .to(buscarRegistros
      .onError(montarErroMedias.to(registrarErroMedias))
      .to(buscarNegocios
        .onError(montarErroMedias.to(registrarErroMedias))
        .to(montarMedias)
        .to(temEscritasMedias
          .onTrue(loopEscritasMedias
            .onEachBatch(repetirEscritaMedias
              .onTrue(gravarMedias
                .onError(montarErroMedias.to(registrarErroMedias))
                .to(nextBatch(loopEscritasMedias)))
              .onFalse(anexarMedias
                .onError(montarErroMedias.to(registrarErroMedias))
                .to(nextBatch(loopEscritasMedias)))))))));
`;

// F5c · E-mails do PCP (27/10). "Ler E-mails do PCP": a cada 10 min lê o Gmail do PCP
// (credencial OAuth2 SÓ LEITURA; o nó só faz getAll: nunca envia, apaga ou marca e-mail),
// reserva cada e-mail novo na aba EMAILS_PCP (ERRO com 1 tentativa), chama o intérprete
// (subworkflow Groq) e grava as interpretações válidas como PENDENTE. O domínio da
// confecção fica no node Config (marcador CONFIGURAR_DOMINIO no repositório público).
const MARCADOR_DOMINIO = 'CONFIGURAR_DOMINIO';
const CRED_GMAIL = "credentials: { gmailOAuth2: { id: 'CONFIGURAR_CREDENCIAL_GMAIL', name: 'Gmail PCP (só leitura)' } },";
const CRED_GROQ = "credentials: { groqApi: { id: 'CONFIGURAR_CREDENCIAL_GROQ', name: 'WhatsPCPGroq' } },";
const POS_EMAILS = {};
[['A cada 10 minutos', 0, 0], ['Config', 1, 0], ['Montar Busca', 2, 0], ['Buscar E-mails', 3, 0], ['Ler Planilha E-mails', 4, 0],
  ['Selecionar E-mails', 5, 0], ['Gravar Reservas', 6, 0], ['Montar Pedidos de Interpretação', 7, 0], ['Interpretar E-mail', 8, 0],
  ['Reler E-mails', 9, 0], ['Finalizar E-mails', 10, 0], ['Gravar Interpretações', 11, 0],
  ['Montar Erro E-mails', 8, 260], ['Registrar Erro E-mails', 9, 260]]
  .forEach(([n, c, y]) => { POS_EMAILS[n] = [c * DX, y]; });
posAtual = POS_EMAILS;
RETRY = RETRY_API;
const lerEmailsPcp = IMPORT + [
  `const agendaEmails = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 10 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } },
    position: ${posicao('A cada 10 minutos')}
  },
  output: [{}]
});`,
  // Domínio da confecção: troque o marcador no n8n (e de novo depois de cada deploy).
  `const configEmails = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Config',
    parameters: {
      mode: 'manual',
      assignments: { assignments: [{ id: 'dominio', name: 'dominio', value: '${MARCADOR_DOMINIO}', type: 'string' }] },
      options: {}
    },
    position: ${posicao('Config')}
  },
  output: [{ dominio: '${MARCADOR_DOMINIO}' }]
});`,
  code('montarBuscaEmails', 'Montar Busca', 'montar-busca-emails-pcp'),
  // Gmail SÓ LEITURA: getAll com a busca; simple: false traz o texto inteiro do e-mail.
  `const buscarEmails = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.1,
  config: {
    name: 'Buscar E-mails',
    ${ERRO_SAIDA}${unico}alwaysOutputData: true,
    parameters: {
      resource: 'message',
      operation: 'getAll',
      returnAll: false,
      limit: 50,
      simple: false,
      filters: { q: expr('{{ $json.q }}') },
      options: { downloadAttachments: false }
    },
    ${CRED_GMAIL}
    position: ${posicao('Buscar E-mails')}
  },
  output: [{ id: 'G-ficticio', threadId: 'T-ficticio', subject: 'RE: Caixa separada - OS:90001', text: 'Chega dia 30/10.' }]
});`,
  httpGoogle('lerPlanilhaEmails', 'Ler Planilha E-mails', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_EMAILS_PCP)), false, ERRO_SAIDA + unico),
  codeComErro('selecionarEmails', 'Selecionar E-mails', 'selecionar-emails-pcp', "{ method: 'POST' }"),
  // Reserva: append das novas (repetir duplicaria a linha) e update das tentativas. Sem retry;
  // se alguma falhar, o Montar Pedidos não manda nada ao intérprete e a próxima rodada tenta de novo.
  httpGoogle('gravarReservas', 'Gravar Reservas', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  codeComErro('montarPedidosEmails', 'Montar Pedidos de Interpretação', 'montar-pedidos-emails-pcp', "{ emailId: 'G-ficticio' }"),
  // Um e-mail por vez; a falha de um não para os outros (fica ERRO para a próxima rodada).
  executarWorkflow('interpretarEmail', 'Interpretar E-mail', IDS_SUBWORKFLOWS.INTERPRETE_EMAIL, true, 'continueRegularOutput', 'each'),
  httpGoogle('relerEmails', 'Reler E-mails', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_EMAILS_PCP_RELER)), false, ERRO_SAIDA + unico),
  codeComErro('finalizarEmails', 'Finalizar E-mails', 'finalizar-emails-pcp', "{ method: 'POST' }"),
  // batchUpdate idempotente: pode repetir.
  httpGoogle('gravarInterpretacoes', 'Gravar Interpretações', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  code('montarErroEmails', 'Montar Erro E-mails', 'montar-erro-emails-pcp'),
  httpGoogle('registrarErroEmails', 'Registrar Erro E-mails', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

export default workflow('pcp-mrbl-ler-emails-pcp', 'PCP MRBL - Ler E-mails do PCP', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 600,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(agendaEmails)
  .to(configEmails)
  .to(montarBuscaEmails)
  .to(buscarEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(buscarEmails).to(lerPlanilhaEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(lerPlanilhaEmails).to(selecionarEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(selecionarEmails).to(gravarReservas.onError(montarErroEmails.to(registrarErroEmails)))
  .add(gravarReservas).to(montarPedidosEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(montarPedidosEmails).to(interpretarEmail)
  .to(relerEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(relerEmails).to(finalizarEmails.onError(montarErroEmails.to(registrarErroEmails)))
  .add(finalizarEmails).to(gravarInterpretacoes.onError(montarErroEmails.to(registrarErroEmails)));
`;

// Subworkflow do intérprete dos e-mails (molde do intérprete do WhatsApp): recebe o
// contexto, chama o Groq e devolve { emailId, interpretacao }. Só devolve JSON; nunca envia.
const POS_INTERPRETE_EMAIL = {};
[['Receber Contexto', 0, 0], ['Montar Pedido Groq', 1, 0], ['Chamar Groq', 2, 0], ['Devolver Interpretação', 3, 0]]
  .forEach(([n, c, y]) => { POS_INTERPRETE_EMAIL[n] = [c * DX, y]; });
posAtual = POS_INTERPRETE_EMAIL;
const interpreteEmail = IMPORT + [
  `const receberContextoEmail = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: {
    name: 'Receber Contexto',
    parameters: { inputSource: 'passthrough' },
    position: ${posicao('Receber Contexto')}
  },
  output: [{ emailId: 'G-ficticio', texto: 'Chega dia 30/10.' }]
});`,
  code('montarPedidoGroq', 'Montar Pedido Groq', 'montar-pedido-groq-email-pcp'),
  `const chamarGroq = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Chamar Groq',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    parameters: {
      method: 'POST',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'groqApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.corpo) }}'),
      options: { timeout: 45000 }
    },
    ${CRED_GROQ}
    position: ${posicao('Chamar Groq')}
  },
  output: [{ choices: [] }]
});`,
  code('devolverInterpretacaoEmail', 'Devolver Interpretação', 'devolver-interpretacao-email-pcp')
].join('\n\n') + `

export default workflow('pcp-mrbl-interprete-email-pcp', 'PCP MRBL - Intérprete E-mail do PCP (Groq)', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 120,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none'
})
  .add(receberContextoEmail)
  .to(montarPedidoGroq)
  .to(chamarGroq)
  .to(devolverInterpretacaoEmail);
`;

fs.mkdirSync(path.join(raiz, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-emails.sdk.js'), lerEmailsPcp);
console.log('workflows/pcp-emails.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-interprete-email.sdk.js'), interpreteEmail);
console.log('workflows/pcp-interprete-email.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-retentar-interpretacao.sdk.js'), retentarInterpretacao);
console.log('workflows/pcp-retentar-interpretacao.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-interpretar-whatsapp.sdk.js'), interpretarWhatsapp);
console.log('workflows/pcp-interpretar-whatsapp.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api.sdk.js'), api);
console.log('workflows/pcp-api.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api-homolog.sdk.js'), apiHomolog);
console.log('workflows/pcp-api-homolog.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-envio.sdk.js'), envio);
console.log('workflows/pcp-envio.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-medias-previsao.sdk.js'), mediasPrevisao);
console.log('workflows/pcp-medias-previsao.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-producao-sync.sdk.js'), syncProducao);
console.log('workflows/pcp-producao-sync.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-whatsapp-saida.sdk.js'), whatsappSaida);
console.log('workflows/pcp-whatsapp-saida.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-whatsapp-entrada.sdk.js'), whatsappEntrada);
console.log('workflows/pcp-whatsapp-entrada.sdk.js');
