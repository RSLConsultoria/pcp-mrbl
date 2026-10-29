// Aviso de limite do Groq (cota gratuita, por modelo): uma linha resumida GROQ_LIMITE no
// ERROS_APP, sem texto de conversa ou de e-mail. Funções puras, adaptadores e ligações
// nos workflows da API (Assistente) e do Ler E-mails do PCP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ARQUIVOS, carregar, limpo } = require('./carregar');
const { converter } = require('../scripts/sdk-para-json');

const RAIZ = path.join(__dirname, '..');
const ctx = carregar();
const AGORA = Date.UTC(2026, 9, 29, 13, 0, 0);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

function rodarAdaptador(arq, globais) {
  const c = vm.createContext(Object.assign({ require }, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), c, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', c, { filename: arq + '.js' }));
}

test('linhaLimiteGroq: só quando, tipo, origem e modelo (colunas do ERROS_APP)', () => {
  assert.deepEqual(limpo(ctx.linhaLimiteGroq('assistente', 'openai/gpt-oss-120b', AGORA, 1)),
    ['2026-10-29T13:00:00.000Z', '', 'GROQ_LIMITE', '', 'assistente', '', 'modelo openai/gpt-oss-120b; 1 recusa por limite']);
  assert.equal(limpo(ctx.linhaLimiteGroq('emails_pcp', 'openai/gpt-oss-20b', AGORA, 3))[6], 'modelo openai/gpt-oss-20b; 3 recusas por limite');
  assert.equal(limpo(ctx.linhaLimiteGroq('emails_pcp', 'm', AGORA, 0))[6], 'modelo m; 1 recusa por limite');
});

test('podeAvisarLimiteGroq: no máximo 1 por minuto por origem, no static data', () => {
  const estado = {};
  assert.equal(ctx.podeAvisarLimiteGroq(estado, 'assistente', AGORA), true);
  assert.equal(ctx.podeAvisarLimiteGroq(estado, 'assistente', AGORA + 59999), false);
  assert.equal(ctx.podeAvisarLimiteGroq(estado, 'emails_pcp', AGORA + 1000), true);
  assert.equal(ctx.podeAvisarLimiteGroq(estado, 'assistente', AGORA + 60000), true);
  assert.equal(ctx.podeAvisarLimiteGroq(estado, 'assistente', AGORA + 60001), false);
  assert.equal(ctx.podeAvisarLimiteGroq(null, 'assistente', AGORA), false);
});

test('limiteGroqNaResposta: 429, rate_limit_exceeded e o erro do subworkflow; nada mais', () => {
  const sim = [
    { statusCode: 429, body: {} },
    { statusCode: 413, body: { error: { message: 'Request too large', type: 'tokens', code: 'rate_limit_exceeded' } } },
    { error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } },
    { error: 'The service is receiving too many requests from you' },
    { error: { message: 'Request failed with status code 429' } },
    { error: { message: 'x', httpCode: '429' } }
  ];
  sim.forEach((r, i) => assert.equal(ctx.limiteGroqNaResposta(r), true, 'sim ' + i));
  const nao = [
    null, undefined, 'texto', {},
    { statusCode: 200, body: { choices: [] } },
    { statusCode: 503, body: { error: { message: 'fora' } } },
    { error: 'Groq fora do ar' },
    { error: { message: 'ECONNRESET' } },
    // Sucesso do intérprete com "429" no conteúdo não é limite.
    { emailId: 'G1', interpretacao: { tipo: 'QUANTIDADE', valor: '429', evidencia: 'conferi 429 rate limit' } }
  ];
  nao.forEach((r, i) => assert.equal(ctx.limiteGroqNaResposta(r), false, 'não ' + i));
});

test('respostaGroqAssistente marca limiteGroq só na recusa por limite (fora do corpo para o site)', () => {
  const r429 = limpo(ctx.respostaGroqAssistente({ statusCode: 429, headers: {}, body: { error: { code: 'rate_limit_exceeded' } } }));
  assert.equal(r429.status, 429);
  assert.equal(r429.limiteGroq, true);
  assert.equal(r429.body.limiteGroq, undefined);
  const r413 = limpo(ctx.respostaGroqAssistente({ statusCode: 413, body: { error: { code: 'rate_limit_exceeded' } } }));
  assert.deepEqual(r413, { status: 502, body: { erro: 'Não consegui responder agora. Tente de novo.' }, limiteGroq: true });
  assert.equal(limpo(ctx.respostaGroqAssistente({ statusCode: 503, body: {} })).limiteGroq, undefined);
  assert.equal(limpo(ctx.respostaGroqAssistente({ statusCode: 200, body: { choices: [{ message: { content: 'ok' } }] } })).limiteGroq, undefined);
});

test('avisoLimiteGroqAssistente: só com limiteGroq e 1 por minuto', () => {
  const estado = {};
  assert.equal(ctx.avisoLimiteGroqAssistente(estado, { status: 429, body: { erro: 'Muitas perguntas seguidas. Espere alguns minutos.' } }, AGORA), null);
  assert.equal(ctx.avisoLimiteGroqAssistente(estado, { status: 200, body: { texto: 'ok' } }, AGORA), null);
  const linha = limpo(ctx.avisoLimiteGroqAssistente(estado, { status: 429, limiteGroq: true, body: {} }, AGORA));
  assert.deepEqual(linha, ['2026-10-29T13:00:00.000Z', '', 'GROQ_LIMITE', '', 'assistente', '', 'modelo openai/gpt-oss-120b; 1 recusa por limite']);
  assert.equal(ctx.avisoLimiteGroqAssistente(estado, { status: 429, limiteGroq: true, body: {} }, AGORA + 30000), null);
  assert.ok(ctx.avisoLimiteGroqAssistente(estado, { status: 429, limiteGroq: true, body: {} }, AGORA + 60000));
});

test('avisoLimiteGroqEmailsPcp: conta as recusas da rodada numa linha só', () => {
  const ok = { emailId: 'G1', interpretacao: { tipo: 'OBSERVACAO' } };
  const limite = { error: 'The service is receiving too many requests from you' };
  assert.equal(ctx.avisoLimiteGroqEmailsPcp([ok, { error: 'Groq fora do ar' }], AGORA), null);
  assert.equal(ctx.avisoLimiteGroqEmailsPcp([], AGORA), null);
  assert.deepEqual(limpo(ctx.avisoLimiteGroqEmailsPcp([ok, limite, limite], AGORA)),
    ['2026-10-29T13:00:00.000Z', '', 'GROQ_LIMITE', '', 'emails_pcp', '', 'modelo openai/gpt-oss-20b; 2 recusas por limite']);
});

const ERROS_APP_APPEND = /ERROS_APP.*:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/;

for (const arq of ['pcp-api.sdk.js', 'pcp-api-homolog.sdk.js']) {
  test(arq + ': aviso de limite depois do Responder Assistente (a resposta não espera), append sem retry', () => {
    const w = converter(path.join(RAIZ, 'workflows', arq));
    assert.deepEqual(destinos(w, 'Responder Assistente'), ['Montar Aviso Limite Groq']);
    assert.deepEqual(destinos(w, 'Montar Aviso Limite Groq'), ['Registrar Aviso Limite Groq']);
    const reg = no(w, 'Registrar Aviso Limite Groq');
    assert.equal(reg.parameters.method, 'POST');
    assert.equal(reg.onError, 'continueRegularOutput');
    assert.ok(!reg.retryOnFail);
    assert.ok(no(w, 'Montar Aviso Limite Groq').position);
    assert.ok(reg.position);
  });
}

test('Ler E-mails: Interpretar E-mail também alimenta o aviso de limite (append sem retry)', () => {
  const w = converter(path.join(RAIZ, 'workflows', 'pcp-emails.sdk.js'));
  assert.deepEqual(destinos(w, 'Interpretar E-mail').sort(), ['Montar Aviso Limite Groq', 'Reler E-mails']);
  assert.deepEqual(destinos(w, 'Montar Aviso Limite Groq'), ['Registrar Aviso Limite Groq']);
  const reg = no(w, 'Registrar Aviso Limite Groq');
  assert.equal(reg.onError, 'continueRegularOutput');
  assert.ok(!reg.retryOnFail);
});

test('Montar Aviso Limite Groq (API): append no ERROS_APP só na recusa, 1 por minuto, nunca derruba', () => {
  const estado = {};
  const rodar = (json) => rodarAdaptador('montar-aviso-limite-groq-assistente', {
    $getWorkflowStaticData: () => estado, $input: { first: () => ({ json }) }
  });
  assert.deepEqual(rodar({ status: 200, body: { texto: 'ok' } }), []);
  const saida = rodar({ status: 429, limiteGroq: true, body: { erro: 'x' } });
  assert.equal(saida.length, 1);
  assert.equal(saida[0].json.method, 'POST');
  assert.match(decodeURIComponent(saida[0].json.url), ERROS_APP_APPEND);
  assert.equal(saida[0].json.body.values[0][2], 'GROQ_LIMITE');
  assert.equal(saida[0].json.body.values[0][4], 'assistente');
  assert.deepEqual(rodar({ status: 429, limiteGroq: true, body: {} }), []);
  assert.deepEqual(rodarAdaptador('montar-aviso-limite-groq-assistente', {
    $getWorkflowStaticData: () => { throw new Error('sem static data'); }, $input: { first: () => ({ json: { limiteGroq: true } }) }
  }), []);
});

test('Montar Aviso Limite Groq (E-mails): 1 linha com o total da rodada; sem recusa, nada', () => {
  const rodar = (itens) => rodarAdaptador('montar-aviso-limite-groq-emails-pcp', { $input: { all: () => itens.map((json) => ({ json })) } });
  assert.deepEqual(rodar([{ emailId: 'G1', interpretacao: {} }]), []);
  const saida = rodar([{ error: 'The service is receiving too many requests from you' }, { emailId: 'G2', interpretacao: {} },
    { error: 'The service is receiving too many requests from you' }]);
  assert.equal(saida.length, 1);
  assert.match(decodeURIComponent(saida[0].json.url), ERROS_APP_APPEND);
  const linha = saida[0].json.body.values[0];
  assert.deepEqual(linha.slice(1), ['', 'GROQ_LIMITE', '', 'emails_pcp', '', 'modelo openai/gpt-oss-20b; 2 recusas por limite']);
});
