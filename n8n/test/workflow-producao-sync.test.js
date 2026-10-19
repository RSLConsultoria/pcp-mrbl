const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, limpo } = require('./carregar');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-producao-sync.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

// paginas: Costura ("Buscar Produção no Ploomes"); previstas: etapas 12–16 ($input).
function rodarAdaptador(snapshot, paginas, previstas) {
  const paginasPrevistas = previstas || [{ statusCode: 200, body: { value: [] } }];
  const ctx = vm.createContext({
    require,
    $: (nome) => {
      if (nome === 'Ler Snapshot Produção') return { first: () => ({ json: snapshot }) };
      if (nome === 'Buscar Produção no Ploomes') return { all: () => paginas.map((json) => ({ json })) };
      throw new Error('node inesperado: ' + nome);
    },
    $input: { all: () => paginasPrevistas.map((json) => ({ json })) }
  });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'sincronizar-producao.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + codigo + '\n})()', ctx, { filename: 'sincronizar-producao.js' }));
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
const CAB_PRODUCAO = ['deal_id', 'os', 'oficina_id', 'oficina_nome', 'inicio_costura', 'data_combinada', 'lead_time', 'pecas', 'cliente', 'peca', 'referencia', 'em_costura', 'atualizado_em_ploomes', 'sincronizado_em', 'valor_corte',
  'etapa_ordem', 'etapa_nome', 'etapa_inicio', 'prevista', 'inicio_costura_previsto', 'fim_costura_previsto'];
const CAB_OFICINAS = ['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em'];
const CAB_MEDIAS = ['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave'];
const MEDIAS_VAZIAS = () => vr('PREVISAO_MEDIAS', [CAB_MEDIAS]);
const prop = (FieldKey, dados) => Object.assign({ FieldKey }, dados);

function deal(id, os, oficinaId, oficinaNome) {
  return {
    Id: id,
    Title: 'PEÇA FICTÍCIA',
    ContactName: 'CLIENTE FICTÍCIO',
    LastUpdateDate: '2026-10-15T12:00:00Z',
    OtherProperties: [
      prop('deal_C06992BA-FF1E-47A8-9330-5242026E691E', { StringValue: os }),
      prop('deal_89DE05E0-467F-4012-9B82-F1E077F968E4', { IntegerValue: oficinaId, UserValueId: oficinaId, UserValueName: oficinaNome }),
      prop('deal_E53BDEC3-F829-413D-9421-91D5D7411349', { DateTimeValue: '2026-10-25T03:00:00Z' })
    ]
  };
}

test('sync de produção agenda a cada cinco minutos e consulta somente a etapa Costura', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Sincronizar Produção');
  assert.deepEqual(no(w, 'A cada 5 minutos').parameters.rule.interval, [{ field: 'minutes', minutesInterval: 5 }]);
  assert.equal(w.settings.executionTimeout, 240);

  const buscar = no(w, 'Buscar Produção no Ploomes');
  assert.equal(buscar.typeVersion, 4.2);
  assert.equal(buscar.credentials.httpHeaderAuth.id, 'QfXOyNly69oAqwH2');
  assert.match(buscar.parameters.url, /^https:\/\/public-api2\.ploomes\.com\/Deals/);
  assert.match(JSON.stringify(buscar.parameters), /60015827/);
  assert.match(JSON.stringify(buscar.parameters), /60073488/);
  assert.match(JSON.stringify(buscar.parameters), /OtherProperties/);
  // Paginação por $skip só é estável com ordem fixa.
  assert.match(buscar.parameters.url, /&\$orderby=Id(&|$)/);
  assert.equal(buscar.parameters.options.pagination.pagination.paginationMode, 'updateAParameterInEachRequest');
  assert.equal(buscar.parameters.options.pagination.pagination.requestInterval, 700);
  assert.equal(buscar.retryOnFail, true);
  assert.equal(buscar.maxTries, 3);
  assert.equal(buscar.waitBetweenTries, 30000);
});

test('sync lê PRODUCAO, OFICINAS e PREVISAO_MEDIAS antes de montar escritas e não apaga linhas', () => {
  const w = workflow();
  const ler = no(w, 'Ler Snapshot Produção');
  assert.match(ler.parameters.url, /values:batchGet/);
  assert.match(ler.parameters.url, /PRODUCAO/);
  assert.match(ler.parameters.url, /OFICINAS/);
  assert.match(ler.parameters.url, /PREVISAO_MEDIAS/);

  assert.deepEqual(destinos(w, 'A cada 5 minutos', 0), ['Ler Snapshot Produção']);
  assert.deepEqual(destinos(w, 'Ler Snapshot Produção', 0), ['Buscar Produção no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Produção no Ploomes', 0), ['Buscar Previstas no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Previstas no Ploomes', 0), ['Montar Sincronização']);
  assert.deepEqual(destinos(w, 'Buscar Previstas no Ploomes', 1), ['Montar Erro Produção']);
  assert.deepEqual(destinos(w, 'Montar Sincronização', 0), ['Tem Escritas?']);
  assert.ok(!w.nodes.some((n) => /delete|apagar/i.test(n.parameters.operation || '')));
});

test('sync grava em ordem, registra erro e mantém o workflow inativo', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Loop Escritas Produção', 1), ['Repetir Escrita?']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 0), ['Gravar Produção']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 1), ['Anexar Produção']);
  assert.deepEqual(destinos(w, 'Gravar Produção', 0), ['Loop Escritas Produção']);
  assert.deepEqual(destinos(w, 'Anexar Produção', 0), ['Loop Escritas Produção']);
  assert.deepEqual(destinos(w, 'Gravar Produção', 1), ['Montar Erro Produção']);
  assert.deepEqual(destinos(w, 'Anexar Produção', 1), ['Montar Erro Produção']);
  assert.deepEqual(destinos(w, 'Montar Erro Produção', 0), ['Registrar Erro Produção']);
  assert.equal(no(w, 'Gravar Produção').onError, 'continueErrorOutput');
  assert.equal(no(w, 'Gravar Produção').retryOnFail, true);
  assert.equal(no(w, 'Anexar Produção').retryOnFail, undefined);
  assert.equal(no(w, 'Registrar Erro Produção').retryOnFail, undefined);
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
});

test('adaptador produz append sem retry, updates idempotentes e preserva os campos humanos da oficina', () => {
  const snapshot = { valueRanges: [
    vr('PRODUCAO', [CAB_PRODUCAO,
      ['700001', '90001', 'of-1', 'OFICINA ANTIGA', '', '2026-10-20', '', '', '', '', '', 'SIM', 'v0', 'T0'],
      ['700002', '90002', 'of-2', 'OFICINA B', '', '2026-10-21', '', '', '', '', '', 'SIM', 'v0', 'T0']]),
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA ANTIGA', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'NAO', 'T0']]),
    MEDIAS_VAZIAS()
  ] };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [
    deal(700001, '90001', 'of-1', 'OFICINA RENOMEADA'),
    deal(700003, '90003', 'of-3', 'OFICINA NOVA')
  ] } }]);

  assert.deepEqual(reqs.map((x) => x.json.repetir), [false, false, true]);
  assert.match(decodeURIComponent(reqs[0].json.url), /'PRODUCAO'!/);
  assert.match(decodeURIComponent(reqs[1].json.url), /'OFICINAS'!/);
  const atualizacoes = reqs[2].json.body.data;
  assert.ok(atualizacoes.some((x) => x.range === "'PRODUCAO'!L3" && x.values[0][0] === 'NAO'));
  assert.ok(atualizacoes.some((x) => x.range === "'OFICINAS'!B2" && x.values[0][0] === 'OFICINA RENOMEADA'));
  assert.ok(!atualizacoes.some((x) => /'OFICINAS'![C-E]2/.test(x.range)));
});

test('adaptador cancela antes de montar escritas quando o Ploomes devolve formato inválido', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS]), MEDIAS_VAZIAS()] };
  assert.throws(
    () => rodarAdaptador(snapshot, [{ statusCode: 200, body: { erro: 'resposta fictícia' } }]),
    /Resposta inválida do Ploomes/
  );
  // Página inválida das previstas também cancela: nada é encerrado por engano.
  assert.throws(
    () => rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [] } }], [{ statusCode: 200, body: { erro: 'resposta fictícia' } }]),
    /Resposta inválida do Ploomes/
  );
});

test('card sem OS é pulado com aviso no ERROS_APP (só deal_id) e não cancela nem encerra a OS', () => {
  const snapshot = { valueRanges: [
    vr('PRODUCAO', [CAB_PRODUCAO,
      ['700001', '90001', 'of-1', 'OFICINA A', '', '2026-10-20', '', '', '', '', '', 'SIM', 'v0', 'T0'],
      ['700002', '90002', 'of-1', 'OFICINA A', '', '2026-10-21', '', '', '', '', '', 'SIM', 'v0', 'T0']]),
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA A', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'SIM', 'T0']]),
    MEDIAS_VAZIAS()
  ] };
  const semOs = deal(700002, '', 'of-1', 'OFICINA A');
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [deal(700001, '90001', 'of-1', 'OFICINA A'), semOs] } }]);
  const urls = reqs.map((x) => decodeURIComponent(x.json.url));
  const erros = reqs.filter((x) => /'ERROS_APP'!/.test(decodeURIComponent(x.json.url)));
  assert.equal(erros.length, 1);
  assert.equal(erros[0].json.repetir, false);
  const linha = erros[0].json.body.values[0];
  assert.equal(linha[2], 'sincronizar_producao');
  assert.equal(linha[3], '700002');
  assert.match(linha[6], /sem OS/);
  assert.doesNotMatch(JSON.stringify(linha), /CLIENTE|PEÇA|OFICINA/);
  // A OS 700002 continua na Costura: nenhuma escrita marca NAO.
  const atualizacoes = reqs.flatMap((x) => (x.json.body && x.json.body.data) || []);
  assert.ok(!atualizacoes.some((x) => x.range === "'PRODUCAO'!L3"));
  assert.ok(atualizacoes.some((x) => /^'PRODUCAO'!/.test(x.range)), JSON.stringify(urls));
});

test('só card sem OS: ainda registra o aviso', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS]), MEDIAS_VAZIAS()] };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [deal(700009, '', '', '')] } }]);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].json.vazio, false);
  assert.match(decodeURIComponent(reqs[0].json.url), /'ERROS_APP'!/);
});

test('sync consulta as previstas dos funis PCP e Produção em aberto, uma vez só, com o estágio', () => {
  const w = workflow();
  const prev = no(w, 'Buscar Previstas no Ploomes');
  assert.equal(prev.executeOnce, true);
  assert.match(prev.parameters.url, /PipelineId%20eq%2060011710/);
  assert.match(prev.parameters.url, /PipelineId%20eq%2060015827/);
  assert.match(prev.parameters.url, /StatusId%20eq%201/);
  for (const id of [60054173, 60054175, 60073485, 60073486, 60073487]) assert.match(prev.parameters.url, new RegExp('StageId%20eq%20' + id));
  assert.match(prev.parameters.url, /Stage\(\$select=Id,Name\)/);
  assert.match(prev.parameters.url, /&\$orderby=Id(&|$)/);
  assert.equal(prev.retryOnFail, true);
  assert.equal(prev.onError, 'continueErrorOutput');
});

test('adaptador grava a OS prevista com a projeção das médias e encerra a prevista que saiu', () => {
  const snapshot = { valueRanges: [
    vr('PRODUCAO', [CAB_PRODUCAO,
      ['710016', '10016', '', 'ALOCAR', '', '', '', 30, '', '', '', 'NAO', 'v0', 'T0', '', 16, '16. Primeira Peça', '', 'SIM', '2026-10-20', '2026-10-21']]),
    vr('OFICINAS', [CAB_OFICINAS]),
    vr('PREVISAO_MEDIAS', [CAB_MEDIAS, ['FILA_GERAL', 17, '', '', 2, 9, 'T0', 'FILA_GERAL|17||']])
  ] };
  const prevista = {
    Id: 710015, Title: 'PEÇA PREVISTA', ContactName: 'CLIENTE FICTÍCIO', LastUpdateDate: 'v1', Stage: { Id: 1, Name: '15. Preparação 1' },
    OtherProperties: [prop('deal_C06992BA-FF1E-47A8-9330-5242026E691E', { StringValue: '10015' }), prop('deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', { IntegerValue: 80 })]
  };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [] } }], [{ statusCode: 200, body: { value: [prevista] } }]);
  const anexo = reqs.find((r) => /'PRODUCAO'!A3:append/.test(decodeURIComponent(r.json.url)));
  const linha = anexo.json.body.values[0];
  const col = (nome) => linha[CAB_PRODUCAO.indexOf(nome)];
  assert.equal(col('deal_id'), '710015');
  assert.equal(col('prevista'), 'SIM');
  assert.equal(col('em_costura'), 'NAO');
  assert.equal(col('etapa_ordem'), 15);
  // inicio = hoje + 1 (duração 15) + 2 (fila 17); fim = inicio + 1.
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const mais = (d) => new Date(Date.parse(hoje + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
  assert.equal(col('inicio_costura_previsto'), mais(3));
  assert.equal(col('fim_costura_previsto'), mais(4));
  const atualizacoes = reqs.flatMap((x) => (x.json.body && x.json.body.data) || []);
  assert.ok(atualizacoes.some((x) => x.range === "'PRODUCAO'!S2" && x.values[0][0] === 'NAO'));
});
