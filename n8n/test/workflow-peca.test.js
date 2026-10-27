// Ramo GET pcp-peca do workflow "PCP MRBL - API": estrutura gerada e os Code nodes
// rodando com o $ falso e respostas fictícias do Ploomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ARQUIVOS, limpo } = require('./carregar');
const { converter } = require('../scripts/sdk-para-json');

const RAIZ = path.join(__dirname, '..');
const workflow = (arq) => converter(path.join(RAIZ, 'workflows', arq));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);
const PLOOMES = ['Buscar Cards da Peça', 'Buscar Cards por Referência', 'Buscar Registros da Peça', 'Buscar Trocas de Etapa', 'Buscar Etapas do Funil'];
const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_REF = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';

function rodarNode(arq, globais) {
  const ctx = vm.createContext(Object.assign({ require }, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}
function cifrao(nodes) {
  return (nome) => {
    if (!(nome in nodes)) throw new Error('node inesperado: ' + nome);
    const itens = nodes[nome].map((json) => ({ json }));
    return { first: () => itens[0], all: () => itens };
  };
}
const entrada = (json) => ({ first: () => ({ json }) });
function sessao() {
  const estado = {};
  const ctx = vm.createContext({});
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx);
  const U = [{ email: 'l@x.com', nome: 'Lucca', perfil: 'adm', senha_hash: ctx.gerarHash(crypto, 'senha-forte-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'l@x.com', senha: 'senha-forte-123' }, U, Date.now());
  return { estado, cab: 'Bearer ' + r.body.token };
}

test('pcp-peca: webhook GET e o caminho até o Responder Peça', () => {
  const w = workflow('pcp-api.sdk.js');
  const gatilho = no(w, 'Peça');
  assert.equal(gatilho.type, 'n8n-nodes-base.webhook');
  assert.equal(gatilho.parameters.httpMethod, 'GET');
  assert.equal(gatilho.parameters.path, 'pcp-peca');
  assert.equal(gatilho.parameters.responseMode, 'responseNode');
  assert.deepEqual(destinos(w, 'Peça'), ['Validar Peça']);
  assert.deepEqual(destinos(w, 'Validar Peça'), ['Peça Pronta?']);
  assert.deepEqual(destinos(w, 'Peça Pronta?', 0), ['Responder Peça']);
  assert.deepEqual(destinos(w, 'Peça Pronta?', 1), ['Buscar Cards da Peça']);
  assert.deepEqual(destinos(w, 'Buscar Cards da Peça'), ['Preparar Leituras da Peça']);
  assert.deepEqual(destinos(w, 'Preparar Leituras da Peça'), ['Peça Pronta (Cards)?']);
  assert.deepEqual(destinos(w, 'Peça Pronta (Cards)?', 0), ['Responder Peça']);
  assert.deepEqual(destinos(w, 'Peça Pronta (Cards)?', 1), ['Buscar pela Referência?']);
  // Número que não é OS: segunda leitura, pela referência, que sempre fecha a resposta.
  assert.deepEqual(destinos(w, 'Buscar pela Referência?', 0), ['Buscar Cards por Referência']);
  assert.deepEqual(destinos(w, 'Buscar Cards por Referência'), ['Preparar Referência da Peça']);
  assert.deepEqual(destinos(w, 'Preparar Referência da Peça'), ['Responder Peça']);
  assert.deepEqual(destinos(w, 'Buscar pela Referência?', 1), ['Buscar Registros da Peça']);
  assert.deepEqual(destinos(w, 'Buscar Registros da Peça'), ['Buscar Trocas de Etapa']);
  assert.deepEqual(destinos(w, 'Buscar Trocas de Etapa'), ['Buscar Etapas do Funil']);
  assert.deepEqual(destinos(w, 'Buscar Etapas do Funil'), ['Montar Peça']);
  assert.deepEqual(destinos(w, 'Montar Peça'), ['Responder Peça']);
  const resp = no(w, 'Responder Peça');
  assert.equal(resp.parameters.responseBody, '={{ $json.body }}');
  assert.equal(resp.parameters.options.responseCode, '={{ $json.status }}');
});

test('pcp-peca: HTTP do Ploomes com Header Auth, GET, sem retry e sem derrubar o fluxo', () => {
  const w = workflow('pcp-api.sdk.js');
  const urls = {
    'Buscar Cards da Peça': '{{ $json.url }}',
    'Buscar Cards por Referência': '{{ $json.url }}',
    'Buscar Registros da Peça': '{{ $json.urls.registros }}',
    'Buscar Trocas de Etapa': "{{ $('Preparar Leituras da Peça').first().json.urls.trocas }}",
    'Buscar Etapas do Funil': "{{ $('Preparar Leituras da Peça').first().json.urls.etapas }}"
  };
  for (const nome of PLOOMES) {
    const n = no(w, nome);
    assert.equal(n.type, 'n8n-nodes-base.httpRequest', nome);
    assert.equal(n.parameters.method, 'GET', nome);
    assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth', nome);
    assert.deepEqual(n.credentials, { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } }, nome);
    assert.equal(n.parameters.url, '=' + urls[nome], nome);
    assert.equal(n.retryOnFail, undefined, nome);
    assert.equal(n.onError, 'continueRegularOutput', nome);
    assert.equal(n.parameters.options.response.response.fullResponse, true, nome);
  }
});

test('homolog: mesmo ramo com pcp-peca-h', () => {
  const w = workflow('pcp-api-homolog.sdk.js');
  assert.equal(no(w, 'Peça').parameters.path, 'pcp-peca-h');
  assert.deepEqual(destinos(w, 'Montar Peça'), ['Responder Peça']);
});

test('Code nodes: validar → preparar → montar com Ploomes fictício; a segunda busca vem do cache', () => {
  const s = sessao();
  const estatico = () => s.estado;
  const pedido = { headers: { authorization: s.cab }, query: { q: '123456' } };
  const [v] = rodarNode('validar-peca', { $: cifrao({ 'Peça': [pedido] }), $getWorkflowStaticData: estatico });
  assert.equal(v.json.pronto, false);
  assert.ok(v.json.url.startsWith('https://public-api2.ploomes.com/Deals?'));
  const deal = { Id: 607612577, Title: 'CARD', PipelineId: 60015827, StageId: 60105, LastUpdateDate: '2026-10-26T10:00:00-03:00',
    Stage: { Id: 60105, Name: '17. Costura' }, OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '123456' }] };
  const [l] = rodarNode('preparar-leituras-peca', {
    $: cifrao({ 'Validar Peça': [v.json] }), $input: entrada({ statusCode: 200, body: { value: [deal] } }), $getWorkflowStaticData: estatico
  });
  assert.equal(l.json.pronto, false);
  assert.equal(l.json.buscarReferencia, false);
  const vazio = { statusCode: 200, body: { value: [] } };
  const [m] = rodarNode('montar-peca', {
    $: cifrao({ 'Preparar Leituras da Peça': [l.json], 'Buscar Registros da Peça': [{ statusCode: 200, body: { value: [{ DealId: 607612577, Date: '2026-10-20T10:00:00-03:00', Content: 'Registro do comercial' }] } }],
      'Buscar Trocas de Etapa': [vazio], 'Buscar Etapas do Funil': [{ statusCode: 200, body: { value: [{ Id: 60105, Name: '17. Costura', Ordination: 6, PipelineId: 60015827 }] } }] }),
    $getWorkflowStaticData: estatico
  });
  assert.equal(m.json.status, 200);
  assert.equal(m.json.body.os, '123456');
  assert.deepEqual(m.json.body.eventos.map((e) => e.texto), ['Registro do comercial']);
  const [v2] = rodarNode('validar-peca', { $: cifrao({ 'Peça': [pedido] }), $getWorkflowStaticData: estatico });
  assert.deepEqual(v2.json, { pronto: true, status: 200, body: m.json.body });
});

test('Code nodes: número sem card com essa OS → leitura pela referência → lista de OS', () => {
  const s = sessao();
  const estatico = () => s.estado;
  const [v] = rodarNode('validar-peca', { $: cifrao({ 'Peça': [{ headers: { authorization: s.cab }, query: { q: '2024' } }] }), $getWorkflowStaticData: estatico });
  const [l] = rodarNode('preparar-leituras-peca', {
    $: cifrao({ 'Validar Peça': [v.json] }), $input: entrada({ statusCode: 200, body: { value: [] } }), $getWorkflowStaticData: estatico
  });
  assert.equal(l.json.pronto, false);
  assert.equal(l.json.buscarReferencia, true);
  assert.ok(decodeURIComponent(l.json.url).includes("o/FieldKey eq '" + CAMPO_REF + "' and o/StringValue eq '2024'"));
  const deal = { Id: 7100001, PipelineId: 60011710, Stage: { Name: 'Concluído' }, LastUpdateDate: '2026-10-26T10:00:00-03:00',
    OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '90001' }, { FieldKey: CAMPO_REF, StringValue: '2024' }] };
  const [r] = rodarNode('preparar-referencia-peca', {
    $: cifrao({ 'Validar Peça': [v.json] }), $input: entrada({ statusCode: 200, body: { value: [deal] } }), $getWorkflowStaticData: estatico
  });
  assert.equal(r.json.status, 200);
  assert.deepEqual(r.json.body.candidatos, [{ os: '90001', peca: '', etapa: 'Concluído', funil: 'PCP', dealId: '7100001' }]);
});
