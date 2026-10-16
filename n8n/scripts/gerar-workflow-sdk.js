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

const POS_ENVIO = {};
posAtual = POS_ENVIO;
[['A cada 2 minutos', 0, 0], ['Ler HISTORICO_APP', 1, 0], ['Marcar Invalidas', 2, -160], ['Gravar Invalidas', 3, -160],
  ['Selecionar Envio', 2, 160], ['Buscar Contato', 3, 160], ['Montar Registro', 4, 160], ['Criar Registro', 5, 160],
  ['Resultado Envio', 6, 160], ['Gravar Envio', 7, 160]].forEach(([n, c, y]) => { POS_ENVIO[n] = [c * DX, y]; });
posAtual = POS;

const POS_SYNC_PRODUCAO = {};
[['A cada 5 minutos', 0, 0], ['Ler Snapshot Produção', 1, 0], ['Buscar Produção no Ploomes', 2, 0],
  ['Montar Sincronização', 3, 0], ['Tem Escritas?', 4, 0], ['Loop Escritas Produção', 5, 0],
  ['Repetir Escrita?', 6, 0], ['Gravar Produção', 7, -100], ['Anexar Produção', 7, 100],
  ['Montar Erro Produção', 6, 260], ['Registrar Erro Produção', 7, 260]]
  .forEach(([n, c, y]) => { POS_SYNC_PRODUCAO[n] = [c * DX, y]; });

const POS_WHATSAPP_SAIDA = {};
[['A cada 2 minutos', 0, 0], ['Execucao Agendada?', 1, 0], ['Ler Fila WhatsApp', 2, 0],
  ['Selecionar Saida WhatsApp', 3, 0], ['Gravar Tentativa WhatsApp', 4, 0], ['Deve Enviar?', 5, 0],
  ['Enviar pela Evolution', 6, 0], ['Resultado WhatsApp', 7, 0], ['Gravar Resultado WhatsApp', 8, 0]]
  .forEach(([n, c, y]) => { POS_WHATSAPP_SAIDA[n] = [c * DX, y]; });

const POS_WHATSAPP_ENTRADA = {};
[['Receber WhatsApp', 0, 0], ['Ler Contexto WhatsApp', 1, 0], ['Preparar Entrada WhatsApp', 2, 0],
  ['Gravar Mensagem?', 3, 0], ['Gravar Mensagem Recebida', 4, 0], ['Confirmar Recebimento', 5, 0],
  ['Precisa Interpretar?', 6, 0], ['Montar Contexto do Intérprete', 7, 0], ['Interpretar com Modelo', 8, 0],
  ['Finalizar Entrada WhatsApp', 9, 0], ['Tem Sugestão?', 10, 0], ['Gravar Sugestão WhatsApp', 11, 0],
  ['Montar Erro de Recepção', 3, 260], ['Registrar Erro de Recepção', 4, 260], ['Solicitar Reentrega', 5, 260],
  ['Montar Erro de Interpretação', 9, 260], ['Registrar Erro de Interpretação', 10, 260]]
  .forEach(([n, c, y]) => { POS_WHATSAPP_ENTRADA[n] = [c * DX, y]; });

const POS_INTERPRETAR = {};
[['Receber Pedido de Interpretação', 0, 0], ['Ler Contexto da Interpretação', 1, 0], ['Preparar Interpretação', 2, 0],
  ['Deve Interpretar?', 3, 0], ['Montar Contexto do Intérprete', 4, 0], ['Interpretar com Modelo', 5, 0],
  ['Finalizar Interpretação', 6, 0], ['Tem Sugestão?', 7, 0], ['Gravar Sugestão WhatsApp', 8, 0],
  ['Montar Erro de Interpretação', 6, 260], ['Registrar Erro de Interpretação', 7, 260]]
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
const executarWorkflow = (varName, nome, workflowId, esperar, onError) => `const ${varName} = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: '${nome}',
    onError: '${onError}',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, value: '${workflowId}', mode: 'id' },
      mode: 'once',
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
  executarWorkflow('dispararInterpretacao', 'Disparar Interpretação', 'CONFIGURAR_INTERPRETAR_WHATSAPP', false, 'continueRegularOutput'),
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

posAtual = POS_SYNC_PRODUCAO;
RETRY = RETRY_API;
const LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS'];
const urlSnapshotProducao = lote.urlLeitura(DOC, LEITURAS_SYNC_PRODUCAO);
const syncProducao = IMPORT_API + [
  `const agendaProducao = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'A cada 5 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
    position: ${posicao('A cada 5 minutos')}
  },
  output: [{}]
});`,
  httpGoogle('lerSnapshotProducao', 'Ler Snapshot Produção', 'GET', JSON.stringify(urlSnapshotProducao), false, ERRO_SAIDA),
  `const buscarProducao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Buscar Produção no Ploomes',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET',
      url: 'https://public-api2.ploomes.com/Deals?$filter=PipelineId%20eq%2060015827%20and%20StageId%20eq%2060073488&$expand=OtherProperties&$select=Id,Title,ContactName,LastUpdateDate&$orderby=Id&$top=100',
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
    position: ${posicao('Buscar Produção no Ploomes')}
  },
  output: [{ statusCode: 200, body: { value: [] } }]
});`,
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
      .to(montarSyncProducao)
      .to(temEscritasProducao
        .onTrue(loopEscritasProducao
          .onEachBatch(repetirEscritaProducao
            .onTrue(gravarProducao
              .onError(montarErroProducao.to(registrarErroProducao))
              .to(nextBatch(loopEscritasProducao)))
            .onFalse(anexarProducao
              .onError(montarErroProducao.to(registrarErroProducao))
              .to(nextBatch(loopEscritasProducao))))))));
`;

posAtual = POS_WHATSAPP_SAIDA;
RETRY = RETRY_API;
const whatsappSaida = IMPORT + [
  `const agendaWhatsapp = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'A cada 2 minutos',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } },
    position: ${posicao('A cada 2 minutos')}
  },
  output: [{}]
});`,
  'const execucaoAgendadaWhatsapp = ' + condicao('Execucao Agendada?', '{{ $execution.mode }}', 'string', 'equals', "'trigger'") + ';',
  sheets('lerFilaWhatsapp', 'Ler Fila WhatsApp', 'WHATSAPP_MENSAGENS', ''),
  code('selecionarWhatsapp', 'Selecionar Saida WhatsApp', 'selecionar-whatsapp-saida'),
  escrever('gravarTentativaWhatsapp', 'Gravar Tentativa WhatsApp', 'update', 'WHATSAPP_MENSAGENS', ['id']),
  'const deveEnviarWhatsapp = ' + condicao('Deve Enviar?', "{{ $('Selecionar Saida WhatsApp').first().json.status_envio }}", 'string', 'equals', "'ENVIANDO'") + ';',
  `const enviarWhatsapp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
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
      jsonBody: expr("{{ JSON.stringify({ number: $('Selecionar Saida WhatsApp').first().json.grupo_jid, text: $('Selecionar Saida WhatsApp').first().json.texto }) }}"),
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 }
    },
    credentials: { httpHeaderAuth: { id: 'G24I6UDBgu3Z5X0b', name: 'Evolution API' } },
    position: ${posicao('Enviar pela Evolution')}
  },
  output: [{ statusCode: 200, body: { key: { id: 'evolution-ficticio' } } }]
});`,
  code('resultadoWhatsapp', 'Resultado WhatsApp', 'resultado-whatsapp-saida'),
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
    .to(deveEnviarWhatsapp.onTrue(enviarWhatsapp.to(resultadoWhatsapp).to(gravarResultadoWhatsapp)))));
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
      workflowId: { __rl: true, value: 'CONFIGURAR_INTERPRETE', mode: 'id' },
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
    "onError: 'continueRegularOutput',\n    ", '')
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
    gravarSugestaoWhatsapp.onError(montarErroInterpretacaoWhatsapp.to(registrarErroInterpretacaoWhatsapp))));
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
  code('montarContextoInterpretacao', 'Montar Contexto do Intérprete', 'montar-contexto-interpretacao-manual'),
  executarWorkflow('interpretarComModeloManual', 'Interpretar com Modelo', 'CONFIGURAR_INTERPRETE', true, 'continueErrorOutput'),
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
    montarContextoInterpretacao.to(
      interpretarComModeloManual.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual)))))
  .add(interpretarComModeloManual).to(
    finalizarInterpretacao.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual)))
  .add(finalizarInterpretacao).to(temSugestaoManual)
  .add(temSugestaoManual.onTrue(
    gravarSugestaoManual.onError(montarErroInterpretacaoManual.to(registrarErroInterpretacaoManual))));
`;

fs.mkdirSync(path.join(raiz, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-interpretar-whatsapp.sdk.js'), interpretarWhatsapp);
console.log('workflows/pcp-interpretar-whatsapp.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api.sdk.js'), api);
console.log('workflows/pcp-api.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-api-homolog.sdk.js'), apiHomolog);
console.log('workflows/pcp-api-homolog.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-envio.sdk.js'), envio);
console.log('workflows/pcp-envio.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-producao-sync.sdk.js'), syncProducao);
console.log('workflows/pcp-producao-sync.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-whatsapp-saida.sdk.js'), whatsappSaida);
console.log('workflows/pcp-whatsapp-saida.sdk.js');
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-whatsapp-entrada.sdk.js'), whatsappEntrada);
console.log('workflows/pcp-whatsapp-entrada.sdk.js');
