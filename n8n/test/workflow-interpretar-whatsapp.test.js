// C2 (16/10): associação manual também passa pelo intérprete. A API grava a
// associação, responde rápido e dispara sem esperar o workflow
// "PCP MRBL - Interpretar WhatsApp", que grava a sugestão PENDENTE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, carregar, limpo } = require('./carregar');
const { IDS_SUBWORKFLOWS, idSubworkflowValido } = require('../scripts/ids-subworkflows');

const RAIZ = path.join(__dirname, '..');
const wfInterpretar = () => converter(path.join(RAIZ, 'workflows', 'pcp-interpretar-whatsapp.sdk.js'));
const wfApi = (arq) => converter(path.join(RAIZ, 'workflows', arq || 'pcp-api.sdk.js'));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

function rodarAdaptador(arq, nodes) {
  const ctx = vm.createContext({ require });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  ctx.$ = (nome) => {
    if (!(nome in nodes)) throw new Error('node inesperado: ' + nome);
    const itens = nodes[nome].map((json) => ({ json }));
    return { first: () => itens[0], all: () => itens };
  };
  ctx.$input = { first: () => ({ json: (nodes.$input || [{}])[0] }), all: () => (nodes.$input || []).map((json) => ({ json })) };
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
const CAB_MSG = ['id', 'evolution_id', 'quando', 'grupo_jid', 'grupo_nome', 'participante_jid', 'participante_nome', 'direcao', 'tipo',
  'tipo_conteudo', 'texto', 'resposta_a_evolution_id', 'deal_id', 'os', 'oficina_id', 'associacao', 'status_envio', 'erro', 'criado_em',
  'envio_tentativas', 'envio_proxima', 'interpretacao_status', 'interpretacao_tentativas', 'interpretacao_proxima'];
const CAB_SUG = ['id', 'mensagem_id', 'deal_id', 'os', 'tipo', 'valor', 'resumo', 'evidencia', 'confianca', 'status', 'criado_em',
  'decidido_em', 'decidido_por', 'versao'];
function leitura(sugestoes) {
  return { valueRanges: [
    vr('OFICINAS', [['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo'], ['of-1', 'OFICINA A', 'grupo-ficticio@g.us', 'GRUPO TESTE', 'SIM']]),
    vr('PRODUCAO', [['deal_id', 'os', 'oficina_id', 'oficina_nome', 'data_combinada', 'pecas', 'peca', 'em_costura', 'atualizado_em_ploomes'],
      ['700001', '90001', 'of-1', 'OFICINA A', '2026-10-20', 160, 'PECA TESTE B', 'SIM', 'v1']]),
    vr('WHATSAPP_MENSAGENS', [CAB_MSG,
      ['WA-R-abc', 'EV-9', '2026-10-13T13:20:00.000Z', 'grupo-ficticio@g.us', 'GRUPO TESTE', 'p@s.whatsapp.net', 'Pessoa Ficticia', 'RECEBIDA',
        'RESPOSTA', 'TEXTO', 'As duas ficam prontas dia 22.', '', '700001', '90001', 'of-1', 'MANUAL', '', '', '2026-10-13T13:20:00.000Z',
        '', '', 'PENDENTE', 0, '2026-10-13T13:30:00.000Z']]),
    vr('WHATSAPP_SUGESTOES', [CAB_SUG].concat(sugestoes || [])),
    vr('FALTANTES', [['id', 'os', 'deal_id', 'secao', 'ciclo', 'descricao_item', 'unidade', 'qtd_falta', 'qtd_baixada', 'status']]),
    vr('CAIXAS GANHAS', [['deal_id', 'os']])
  ] };
}
const PEDIDO = { mensagemId: 'WA-R-abc', dealId: '700001' };

test('workflow Interpretar WhatsApp: gatilho de subworkflow, intérprete configurável e sugestão sem retry', () => {
  const w = wfInterpretar();
  assert.equal(w.name, 'PCP MRBL - Interpretar WhatsApp');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.equal(w.settings.saveDataErrorExecution, 'none');
  assert.equal(no(w, 'Receber Pedido de Interpretação').type, 'n8n-nodes-base.executeWorkflowTrigger');
  assert.deepEqual(destinos(w, 'Receber Pedido de Interpretação'), ['Ler Contexto da Interpretação']);
  assert.deepEqual(destinos(w, 'Ler Contexto da Interpretação'), ['Preparar Interpretação']);
  assert.deepEqual(destinos(w, 'Ler Contexto da Interpretação', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Preparar Interpretação'), ['Deve Interpretar?']);
  assert.deepEqual(destinos(w, 'Preparar Interpretação', 1), ['Montar Erro de Interpretação']);
  // A tentativa é reservada (tentativas + 1, próxima em 10 min) antes de chamar o modelo.
  assert.deepEqual(destinos(w, 'Deve Interpretar?', 0), ['Gravar Tentativa de Interpretação']);
  assert.deepEqual(destinos(w, 'Gravar Tentativa de Interpretação'), ['Montar Contexto do Intérprete']);
  assert.deepEqual(destinos(w, 'Gravar Tentativa de Interpretação', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Deve Interpretar?', 1), []);
  assert.deepEqual(destinos(w, 'Montar Contexto do Intérprete'), ['Interpretar com Modelo']);
  assert.deepEqual(destinos(w, 'Interpretar com Modelo'), ['Finalizar Interpretação']);
  assert.deepEqual(destinos(w, 'Interpretar com Modelo', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Finalizar Interpretação'), ['Tem Sugestão?']);
  assert.deepEqual(destinos(w, 'Finalizar Interpretação', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Tem Sugestão?', 0), ['Gravar Sugestão WhatsApp']);
  assert.deepEqual(destinos(w, 'Gravar Sugestão WhatsApp', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Montar Erro de Interpretação'), ['Registrar Erro de Interpretação']);

  const modelo = no(w, 'Interpretar com Modelo');
  assert.equal(modelo.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(modelo.parameters.workflowId.value, IDS_SUBWORKFLOWS.INTERPRETE);
  assert.ok(idSubworkflowValido(modelo.parameters.workflowId.value));
  assert.equal(modelo.parameters.options.waitForSubWorkflow, true);
  assert.equal(no(w, 'Gravar Sugestão WhatsApp').retryOnFail, undefined);
  assert.equal(no(w, 'Registrar Erro de Interpretação').onError, 'continueRegularOutput');
  const lote = carregar();
  assert.equal(no(w, 'Ler Contexto da Interpretação').parameters.url, lote.urlLeitura(lote.PLANILHA_ID, lote.LEITURAS_WHATSAPP_ENTRADA));
  // Nunca responde nem envia ao grupo.
  assert.ok(!w.nodes.some((n) => n.type !== 'n8n-nodes-base.code' && /sendText|evolution/i.test(JSON.stringify(n.parameters))));
});

test('Preparar Interpretação monta o corpo do intérprete e pula mensagem que já tem sugestão', () => {
  const [saida] = rodarAdaptador('preparar-interpretacao-manual', { 'Receber Pedido de Interpretação': [PEDIDO], $input: [leitura()] });
  assert.equal(saida.json.interpretar, true);
  assert.equal(saida.json.entrada.peca, 'PECA TESTE B');
  assert.equal(saida.json.preparacao.mensagemId, 'WA-R-abc');
  // Pedido da reserva da tentativa: batchUpdate na WHATSAPP_MENSAGENS com tentativas 1.
  assert.match(saida.json.url, /values:batchUpdate/);
  assert.match(JSON.stringify(saida.json.body), /PENDENTE/);
  assert.match(JSON.stringify(saida.json.body), /WHATSAPP_MENSAGENS/);
  assert.doesNotMatch(JSON.stringify(saida.json), /@g\.us|s\.whatsapp\.net|Pessoa Ficticia/);

  const ja = rodarAdaptador('preparar-interpretacao-manual', {
    'Receber Pedido de Interpretação': [PEDIDO],
    $input: [leitura([['WA-S-abc', 'WA-R-abc', '700001', '90001', 'OBSERVACAO', '', 'x', 'x', 0.9, 'PENDENTE', '', '', '', 'v1']])]
  });
  assert.deepEqual(ja, [{ json: { interpretar: false, motivo: 'JA_TEM_SUGESTAO' } }]);

  const [contexto] = rodarAdaptador('montar-contexto-interpretacao-manual', { 'Preparar Interpretação': [saida.json] });
  assert.deepEqual(contexto.json, saida.json.entrada);
});

test('Finalizar Interpretação valida a saída e grava uma sugestão PENDENTE com id determinístico', () => {
  const [prep] = rodarAdaptador('preparar-interpretacao-manual', { 'Receber Pedido de Interpretação': [PEDIDO], $input: [leitura()] });
  const [r] = rodarAdaptador('finalizar-interpretacao-manual', {
    'Preparar Interpretação': [prep.json],
    'Ler Contexto da Interpretação': [leitura()],
    $input: [{ interpretacao: { tipo: 'NOVA_DATA_COMBINADA', valor: '22/10', resumo: 'Entrega dia 22.', evidencia: 'prontas dia 22', confianca: 0.9 } }]
  });
  assert.equal(r.json.gravar, true);
  assert.match(r.json.url, /WHATSAPP_SUGESTOES/);
  assert.match(JSON.stringify(r.json.body), /WA-S-abc/);
  assert.match(JSON.stringify(r.json.body), /PENDENTE/);
  assert.match(JSON.stringify(r.json.body), /2026-10-22/);
  assert.throws(() => rodarAdaptador('finalizar-interpretacao-manual', {
    'Preparar Interpretação': [prep.json], 'Ler Contexto da Interpretação': [leitura()], $input: [{ output: {} }]
  }), /interpretacao/);
});

test('erro da interpretação vai resumido para ERROS_APP, sem o texto da mensagem', () => {
  const [r] = rodarAdaptador('montar-erro-interpretacao-manual', { 'Receber Pedido de Interpretação': [PEDIDO] });
  assert.match(r.json.url, /ERROS_APP/);
  assert.match(JSON.stringify(r.json.body), /700001/);
  assert.doesNotMatch(JSON.stringify(r.json.body), /prontas dia 22|WA-R-abc/);
});

for (const arq of ['pcp-api.sdk.js', 'pcp-api-homolog.sdk.js']) {
  test('API (' + arq + ') dispara o Interpretar WhatsApp sem esperar, depois de gravar e antes de responder', () => {
    const w = wfApi(arq);
    assert.deepEqual(destinos(w, 'Limpar Cache'), ['Pedir Interpretação?']);
    assert.deepEqual(destinos(w, 'Pedir Interpretação?', 0), ['Montar Pedido de Interpretação']);
    assert.deepEqual(destinos(w, 'Pedir Interpretação?', 1), ['Responder Acao']);
    assert.deepEqual(destinos(w, 'Montar Pedido de Interpretação'), ['Disparar Interpretação']);
    assert.deepEqual(destinos(w, 'Disparar Interpretação'), ['Responder Acao']);
    const disparo = no(w, 'Disparar Interpretação');
    assert.equal(disparo.type, 'n8n-nodes-base.executeWorkflow');
    // O homolog chama o Interpretar WhatsApp de homologação (ambiente de QA, 30/10).
    assert.equal(disparo.parameters.workflowId.value, arq === 'pcp-api.sdk.js' ? IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP : IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP_HOMOLOG);
    assert.ok(idSubworkflowValido(disparo.parameters.workflowId.value));
    assert.equal(disparo.parameters.options.waitForSubWorkflow, false);
    // Falha no disparo não muda a resposta da associação já gravada.
    assert.equal(disparo.onError, 'continueRegularOutput');
  });
}

test('Montar Pedido de Interpretação manda só mensagemId e dealId', () => {
  const r = rodarAdaptador('montar-pedido-interpretacao', {
    'Processar Acao': [{ status: 200, body: { ok: true }, interpretar: { mensagemId: 'MSG-SEM', dealId: '700001' } }]
  });
  assert.deepEqual(r, [{ json: { mensagemId: 'MSG-SEM', dealId: '700001' } }]);
});

test('Preparar Interpretação repassa reservada: pedido do agendamento não conta a tentativa de novo', () => {
  const [normal] = rodarAdaptador('preparar-interpretacao-manual', { 'Receber Pedido de Interpretação': [PEDIDO], $input: [leitura()] });
  const [reservado] = rodarAdaptador('preparar-interpretacao-manual', {
    'Receber Pedido de Interpretação': [Object.assign({ reservada: true }, PEDIDO)], $input: [leitura()]
  });
  assert.match(JSON.stringify(normal.json.body), /"PENDENTE",1,/);
  assert.match(JSON.stringify(reservado.json.body), /"PENDENTE",0,/);
});
