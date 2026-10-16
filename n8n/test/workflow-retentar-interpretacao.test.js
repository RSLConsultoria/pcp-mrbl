// Agendamento das novas tentativas do intérprete (16/10): a cada 15 min lê a
// planilha, marca ERRO definitivo nas que esgotaram as 5 tentativas e manda as
// vencidas, uma a uma, ao workflow Interpretar WhatsApp (mesmo caminho da
// associação manual). Nunca chama o modelo nem envia ao grupo diretamente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, carregar, limpo } = require('./carregar');
const { IDS_SUBWORKFLOWS, idSubworkflowValido } = require('../scripts/ids-subworkflows');

const RAIZ = path.join(__dirname, '..');
const workflow = () => converter(path.join(RAIZ, 'workflows', 'pcp-retentar-interpretacao.sdk.js'));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

function rodarAdaptador(arq, entrada, nodes) {
  const ctx = vm.createContext({ require, $input: { first: () => ({ json: entrada }), all: () => [{ json: entrada }] },
    $: (nome) => { if (!nodes || !(nome in nodes)) throw new Error('node inesperado: ' + nome); const itens = nodes[nome].map((json) => ({ json })); return { first: () => itens[0], all: () => itens }; } });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
const CAB = ['id', 'quando', 'direcao', 'tipo_conteudo', 'texto', 'deal_id', 'interpretacao_status', 'interpretacao_tentativas', 'interpretacao_proxima'];
const leitura = () => ({ valueRanges: [
  vr('PRODUCAO', [['deal_id', 'os', 'em_costura'], ['700001', '90001', 'SIM']]),
  vr('WHATSAPP_MENSAGENS', [CAB,
    ['VENCIDA', '2026-10-13T12:00:00.000Z', 'RECEBIDA', 'TEXTO', 'Fica pronta dia 22.', '700001', 'PENDENTE', 2, '2026-10-13T12:10:00.000Z'],
    ['ESGOTADA', '2026-10-13T11:00:00.000Z', 'RECEBIDA', 'TEXTO', 'Sem leitura.', '700001', 'PENDENTE', 5, '2026-10-13T11:10:00.000Z']]),
  vr('WHATSAPP_SUGESTOES', [['id', 'mensagem_id', 'status']])
] });

test('workflow Retentar Interpretação: conta as tentativas antes de disparar, só pelo Interpretar WhatsApp', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Retentar Interpretação');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.deepEqual(no(w, 'A cada 15 minutos').parameters.rule.interval, [{ field: 'minutes', minutesInterval: 15 }]);
  assert.deepEqual(destinos(w, 'A cada 15 minutos'), ['Ler Interpretações Pendentes']);
  assert.deepEqual(destinos(w, 'Ler Interpretações Pendentes'), ['Marcar Tentativas']);
  assert.deepEqual(destinos(w, 'Marcar Tentativas'), ['Gravar Tentativas']);
  // Sem gravar a tentativa, não dispara (falha na gravação para o workflow).
  assert.deepEqual(destinos(w, 'Gravar Tentativas'), ['Selecionar Interpretações']);
  assert.deepEqual(destinos(w, 'Gravar Tentativas', 1), []);
  assert.equal(no(w, 'Gravar Tentativas').onError, undefined);
  assert.equal(no(w, 'Gravar Tentativas').retryOnFail, true);
  assert.deepEqual(destinos(w, 'Selecionar Interpretações'), ['Interpretar de Novo']);
  const lote = carregar();
  assert.equal(no(w, 'Ler Interpretações Pendentes').parameters.url,
    lote.urlLeitura(lote.PLANILHA_ID, ['PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES']));
  const disparo = no(w, 'Interpretar de Novo');
  assert.equal(disparo.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(disparo.parameters.workflowId.value, IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP);
  assert.ok(idSubworkflowValido(disparo.parameters.workflowId.value));
  assert.equal(disparo.parameters.mode, 'each');
  assert.equal(disparo.parameters.options.waitForSubWorkflow, true);
  assert.equal(disparo.onError, 'continueRegularOutput');
  // Nunca chama o modelo direto: só pelo Interpretar WhatsApp.
  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.value === IDS_SUBWORKFLOWS.INTERPRETE));
  assert.ok(!w.nodes.some((n) => n.type !== 'n8n-nodes-base.code' && /sendText|evolution/i.test(JSON.stringify(n.parameters))));
});

test('Marcar Tentativas grava ERRO nas esgotadas e reserva as vencidas num batchUpdate; Selecionar manda as reservadas', () => {
  const [marcar] = rodarAdaptador('marcar-tentativas-interpretacao', leitura());
  assert.match(marcar.json.url, /values:batchUpdate/);
  const corpo = JSON.stringify(marcar.json.body);
  assert.match(corpo, /WHATSAPP_MENSAGENS'!G3/);          // ESGOTADA (linha 3) -> ERRO
  assert.match(corpo, /"ERRO"/);
  assert.match(corpo, /WHATSAPP_MENSAGENS'!G2:I2","values":\[\["PENDENTE",3,/);  // VENCIDA: 2 -> 3 tentativas
  assert.deepEqual(marcar.json.pedidos, [{ mensagemId: 'VENCIDA', dealId: '700001', reservada: true }]);
  // Selecionar usa a mesma escolha gravada (não recalcula com outra hora).
  assert.deepEqual(rodarAdaptador('selecionar-interpretacoes-pendentes', {}, { 'Marcar Tentativas': [marcar.json] }),
    [{ json: { mensagemId: 'VENCIDA', dealId: '700001', reservada: true } }]);
  const nada = leitura();
  nada.valueRanges[1].values.splice(1);
  assert.deepEqual(rodarAdaptador('marcar-tentativas-interpretacao', nada), []);
});
