// Ramo POST pcp-assistente do workflow "PCP MRBL - API" (F5d): estrutura gerada e os Code
// nodes rodando com o $ falso e respostas fictícias do Groq.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ARQUIVOS, limpo } = require('./carregar');
const { converter } = require('../scripts/sdk-para-json');
const { ID_CREDENCIAL_GROQ, idCredencialValido } = require('../scripts/credenciais');

const RAIZ = path.join(__dirname, '..');
const workflow = (arq) => converter(path.join(RAIZ, 'workflows', arq));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);
const RAMO = ['Assistente', 'Validar Assistente', 'Assistente Pronto?', 'Chamar Groq (Assistente)', 'Montar Resposta do Assistente', 'Responder Assistente'];

function contexto(globais) {
  const ctx = vm.createContext(Object.assign({ require }, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  return ctx;
}
function rodarAdaptador(ctx, arq) {
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

for (const [arq, sufixo] of [['pcp-api.sdk.js', ''], ['pcp-api-homolog.sdk.js', '-h']]) {
  test('pcp-assistente' + sufixo + ': webhook POST e o caminho até o Responder Assistente', () => {
    const w = workflow(arq);
    const gatilho = no(w, 'Assistente');
    assert.equal(gatilho.type, 'n8n-nodes-base.webhook');
    assert.equal(gatilho.parameters.httpMethod, 'POST');
    assert.equal(gatilho.parameters.path, 'pcp-assistente' + sufixo);
    assert.equal(gatilho.parameters.responseMode, 'responseNode');
    assert.match(gatilho.parameters.options.allowedOrigins, /rslconsultoria\.github\.io/);
    assert.deepEqual(destinos(w, 'Assistente'), ['Validar Assistente']);
    assert.deepEqual(destinos(w, 'Validar Assistente'), ['Assistente Pronto?']);
    assert.deepEqual(destinos(w, 'Assistente Pronto?', 0), ['Responder Assistente']);
    assert.deepEqual(destinos(w, 'Assistente Pronto?', 1), ['Chamar Groq (Assistente)']);
    assert.deepEqual(destinos(w, 'Chamar Groq (Assistente)'), ['Montar Resposta do Assistente']);
    assert.deepEqual(destinos(w, 'Montar Resposta do Assistente'), ['Responder Assistente']);
    const resp = no(w, 'Responder Assistente');
    assert.equal(resp.parameters.responseBody, '={{ $json.body }}');
    assert.equal(resp.parameters.options.responseCode, '={{ $json.status }}');
    RAMO.forEach((n) => assert.ok(no(w, n).position, n));
  });
}

test('pcp-assistente: Groq com a credencial configurada, resposta completa e sem derrubar o fluxo', () => {
  const w = workflow('pcp-api.sdk.js');
  const g = no(w, 'Chamar Groq (Assistente)');
  assert.equal(g.type, 'n8n-nodes-base.httpRequest');
  assert.equal(g.parameters.method, 'POST');
  assert.equal(g.parameters.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(g.parameters.nodeCredentialType, 'groqApi');
  assert.deepEqual(g.credentials, { groqApi: { id: ID_CREDENCIAL_GROQ, name: 'WhatsPCPGroq' } });
  assert.equal(g.parameters.jsonBody, '={{ JSON.stringify($json.corpo) }}');
  assert.deepEqual(g.parameters.options.response.response, { fullResponse: true, neverError: true });
  assert.ok(g.parameters.options.timeout <= 40000);
  assert.equal(g.onError, 'continueRegularOutput');
  assert.ok(!g.retryOnFail);
  // O intérprete dos e-mails usa a mesma constante.
  assert.deepEqual(no(workflow('pcp-interprete-email.sdk.js'), 'Chamar Groq').credentials, g.credentials);
});

test('credencial do Groq: marcador CONFIGURAR_* ou id real; vazio nunca', () => {
  assert.equal(idCredencialValido(ID_CREDENCIAL_GROQ), true);
  assert.equal(idCredencialValido('CONFIGURAR_CREDENCIAL_GROQ'), true);
  assert.equal(idCredencialValido('aB3dE5fG7hI9'), true);
  for (const ruim of ['', ' ', 'CONFIGURAR_', null, 'id com espaço']) assert.equal(idCredencialValido(ruim), false, String(ruim));
});

test('pcp-assistente: o ramo não lê nem grava a planilha', () => {
  const w = workflow('pcp-api.sdk.js');
  const alcancaveis = new Set();
  const fila = ['Assistente'];
  while (fila.length) {
    const n = fila.shift();
    if (alcancaveis.has(n)) continue;
    alcancaveis.add(n);
    for (const saida of (w.connections[n] || {}).main || []) for (const c of saida || []) fila.push(c.node);
  }
  assert.deepEqual([...alcancaveis].sort(), [...RAMO].sort());
  for (const n of alcancaveis) assert.doesNotMatch(no(w, n).type, /googleSheets|executeWorkflow/);
});

test('Validar Assistente: 401 sem sessão, pronto com o corpo do Groq, 429 depois de 120', () => {
  const estado = {};
  const base = contexto({});
  const U = [{ email: 'pcp@exemplo.test', nome: 'Pessoa PCP', perfil: 'PCP', senha_hash: base.gerarHash(crypto, 'senha-ficticia-123'), ativo: 'SIM' }];
  const token = base.processarLogin(crypto, estado, { email: 'pcp@exemplo.test', senha: 'senha-ficticia-123' }, U, Date.now()).body.token;
  const corpo = { hoje: '2026-10-27', mensagens: [{ papel: 'usuario', texto: 'Faltas da OS 90001' }] };
  const rodar = (headers) => rodarAdaptador(contexto({
    $getWorkflowStaticData: () => estado,
    $: (nome) => { assert.equal(nome, 'Assistente'); return { first: () => ({ json: { headers, body: corpo } }) }; }
  }), 'validar-assistente')[0].json;
  assert.deepEqual(rodar({}), { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } });
  const ok = rodar({ authorization: 'Bearer ' + token });
  assert.equal(ok.pronto, false);
  assert.equal(ok.corpo.model, 'openai/gpt-oss-120b');
  assert.equal(ok.corpo.messages[1].content, 'Faltas da OS 90001');
  for (let i = 1; i < 120; i++) rodar({ authorization: 'Bearer ' + token });
  assert.equal(rodar({ authorization: 'Bearer ' + token }).status, 429);
});

test('Montar Resposta do Assistente: texto, chamadas e falha do Groq', () => {
  const rodar = (json) => rodarAdaptador(contexto({ $input: { first: () => ({ json }) } }), 'montar-resposta-assistente')[0].json;
  assert.deepEqual(rodar({ statusCode: 200, body: { choices: [{ message: { content: 'A OS 90001 está no prazo.' } }] } }),
    { status: 200, body: { texto: 'A OS 90001 está no prazo.' } });
  assert.deepEqual(rodar({ statusCode: 200, body: { choices: [{ message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'faltas_da_os', arguments: '{"os":"90001"}' } }] } }] } }),
    { status: 200, body: { chamadas: [{ id: 'call_1', nome: 'faltas_da_os', argumentos: { os: '90001' } }] } });
  assert.deepEqual(rodar({ statusCode: 503, body: { error: { message: 'fora' } } }), { status: 502, body: { erro: 'Não consegui responder agora. Tente de novo.' } });
  assert.deepEqual(rodar({ error: { message: 'ECONNRESET' } }), { status: 502, body: { erro: 'Não consegui responder agora. Tente de novo.' } });
});
