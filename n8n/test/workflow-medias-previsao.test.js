// Workflow "PCP MRBL - Médias de Previsão" (gerado) e o adaptador Montar Médias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, limpo } = require('./carregar');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-medias-previsao.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

const CAB = ['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave'];
const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });

// campos: FieldKeys do registro a configurar no vm (null = deixa o marcador CONFIGURAR_).
function rodarAdaptador(snapshot, paginasRegistros, paginasNegocios, campos) {
  const ctx = vm.createContext({
    require,
    $: (nome) => {
      if (nome === 'Ler Médias Atuais') return { first: () => ({ json: snapshot }) };
      if (nome === 'Buscar Registros no Ploomes') return { all: () => paginasRegistros.map((json) => ({ json })) };
      throw new Error('node inesperado: ' + nome);
    },
    $input: { all: () => paginasNegocios.map((json) => ({ json })) }
  });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  if (campos) {
    ctx.CAMPO_REGISTRO_INICIO = campos.inicio;
    ctx.CAMPO_REGISTRO_TERMINO = campos.termino;
  }
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'montar-medias-previsao.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + codigo + '\n})()', ctx, { filename: 'montar-medias-previsao.js' }));
}

const CAMPOS = { inicio: 'record_INICIO_FICTICIO', termino: 'record_TERMINO_FICTICIO' };
const registro = (dealId, etapa, ini, fim) => ({
  Id: dealId * 10 + etapa, DealId: dealId, Content: `<p>Etapa: ${etapa}</p>`,
  OtherProperties: [
    { FieldKey: CAMPOS.inicio, DateTimeValue: ini + 'T03:00:00Z' },
    { FieldKey: CAMPOS.termino, DateTimeValue: fim + 'T03:00:00Z' }
  ]
});
const negocio = (id, pecas) => ({ Id: id, OtherProperties: [{ FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', IntegerValue: pecas }] });
const pagina = (value) => ({ statusCode: 200, body: { value } });

test('médias: agenda diária às 3h em São Paulo, workflow novo e sem retenção de sucesso', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Médias de Previsão');
  assert.deepEqual(no(w, 'Todo dia às 3h').parameters.rule.interval, [{ field: 'days', daysInterval: 1, triggerAtHour: 3 }]);
  assert.equal(w.settings.timezone, 'America/Sao_Paulo');
  assert.equal(w.settings.executionTimeout, 1800);
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
});

test('médias: lê registros com o marcador 60151285 e negócios dos funis PCP e Produção, paginando', () => {
  const w = workflow();
  const reg = no(w, 'Buscar Registros no Ploomes');
  assert.match(reg.parameters.url, /^https:\/\/public-api2\.ploomes\.com\/InteractionRecords\?/);
  assert.match(reg.parameters.url, /TagId%20eq%2060151285/);
  assert.match(reg.parameters.url, /&\$orderby=Id(&|$)/);
  const neg = no(w, 'Buscar Negócios no Ploomes');
  assert.match(neg.parameters.url, /PipelineId%20eq%2060011710/);
  assert.match(neg.parameters.url, /PipelineId%20eq%2060015827/);
  assert.equal(neg.executeOnce, true);
  for (const n of [reg, neg]) {
    assert.equal(n.parameters.options.pagination.pagination.requestInterval, 700);
    assert.equal(n.retryOnFail, true);
    assert.equal(n.waitBetweenTries, 30000);
    assert.equal(n.onError, 'continueErrorOutput');
    assert.equal(n.credentials.httpHeaderAuth.id, 'QfXOyNly69oAqwH2');
  }
  assert.match(no(w, 'Ler Médias Atuais').parameters.url, /PREVISAO_MEDIAS/);
});

test('médias: ordem dos nodes, loop de gravação e erros no ERROS_APP; nada apaga linhas', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Todo dia às 3h', 0), ['Ler Médias Atuais']);
  assert.deepEqual(destinos(w, 'Ler Médias Atuais', 0), ['Buscar Registros no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Registros no Ploomes', 0), ['Buscar Negócios no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Negócios no Ploomes', 0), ['Montar Médias']);
  assert.deepEqual(destinos(w, 'Montar Médias', 0), ['Tem Escritas?']);
  assert.deepEqual(destinos(w, 'Loop Escritas Médias', 1), ['Repetir Escrita?']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 0), ['Gravar Médias']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 1), ['Anexar Médias']);
  for (const n of ['Ler Médias Atuais', 'Buscar Registros no Ploomes', 'Buscar Negócios no Ploomes', 'Gravar Médias', 'Anexar Médias']) {
    assert.deepEqual(destinos(w, n, 1), ['Montar Erro Médias'], n);
  }
  assert.deepEqual(destinos(w, 'Montar Erro Médias', 0), ['Registrar Erro Médias']);
  assert.equal(no(w, 'Anexar Médias').retryOnFail, undefined);
  const http = w.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
  assert.ok(http.every((n) => !/clear|delete/i.test(String(n.parameters.url))));
});

test('adaptador: grava append da chave nova e update da existente', () => {
  const snapshot = { valueRanges: [vr('PREVISAO_MEDIAS', [CAB, ['DURACAO_GERAL', 17, '', '', 9, 3, 'T0', 'DURACAO_GERAL|17||']])] };
  const regs = pagina([registro(800001, 17, '2026-10-05', '2026-10-11')]);
  const reqs = rodarAdaptador(snapshot, [regs], [pagina([negocio(800001, 100)])], CAMPOS);
  assert.deepEqual(reqs.map((r) => r.json.repetir), [false, true]);
  assert.match(decodeURIComponent(reqs[0].json.url), /'PREVISAO_MEDIAS'!A3:append/);
  assert.deepEqual(reqs[0].json.body.values.map((l) => l[7]), ['DURACAO|17|02. Médio|']);
  assert.deepEqual(reqs[1].json.body.data.map((d) => d.range), ["'PREVISAO_MEDIAS'!E2:G2"]);
  assert.equal(reqs[1].json.body.data[0].values[0][0], 6);
});

test('adaptador: FieldKeys por configurar ou página inválida não gravam médias, só o ERROS_APP', () => {
  const snapshot = { valueRanges: [vr('PREVISAO_MEDIAS', [CAB])] };
  const semCampos = rodarAdaptador(snapshot, [pagina([registro(800001, 17, '2026-10-05', '2026-10-11')])], [pagina([])], null);
  assert.equal(semCampos.length, 1);
  assert.match(decodeURIComponent(semCampos[0].json.url), /'ERROS_APP'!/);
  assert.equal(semCampos[0].json.body.values[0][2], 'medias_previsao');
  assert.match(semCampos[0].json.body.values[0][6], /Nenhum registro de etapa reconhecido/);

  const invalida = rodarAdaptador(snapshot, [{ statusCode: 200, body: { erro: 'fictício' } }], [pagina([])], CAMPOS);
  assert.equal(invalida.length, 1);
  assert.match(invalida[0].json.body.values[0][6], /Resposta inválida do Ploomes/);
  assert.doesNotMatch(JSON.stringify(invalida), /fictício/);
});
