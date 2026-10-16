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

function rodarAdaptador(arq, entrada) {
  const ctx = vm.createContext({ require, $input: { first: () => ({ json: entrada }), all: () => [{ json: entrada }] } });
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

test('workflow Retentar Interpretação: a cada 15 min, só pelo Interpretar WhatsApp', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Retentar Interpretação');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.deepEqual(no(w, 'A cada 15 minutos').parameters.rule.interval, [{ field: 'minutes', minutesInterval: 15 }]);
  assert.deepEqual(destinos(w, 'A cada 15 minutos'), ['Ler Interpretações Pendentes']);
  assert.deepEqual(destinos(w, 'Ler Interpretações Pendentes').sort(), ['Marcar Erros Definitivos', 'Selecionar Interpretações']);
  assert.deepEqual(destinos(w, 'Marcar Erros Definitivos'), ['Gravar Erros Definitivos']);
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
  assert.equal(no(w, 'Gravar Erros Definitivos').onError, 'continueRegularOutput');
  // Nunca chama o modelo direto: só pelo Interpretar WhatsApp.
  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.value === IDS_SUBWORKFLOWS.INTERPRETE));
  assert.ok(!w.nodes.some((n) => n.type !== 'n8n-nodes-base.code' && /sendText|evolution/i.test(JSON.stringify(n.parameters))));
});

test('Selecionar Interpretações manda só mensagemId e dealId das vencidas; Marcar Erros grava ERRO nas esgotadas', () => {
  assert.deepEqual(rodarAdaptador('selecionar-interpretacoes-pendentes', leitura()), [{ json: { mensagemId: 'VENCIDA', dealId: '700001' } }]);
  const [erro] = rodarAdaptador('marcar-erros-interpretacao', leitura());
  assert.match(erro.json.url, /values:batchUpdate/);
  assert.match(JSON.stringify(erro.json.body), /ERRO/);
  assert.match(JSON.stringify(erro.json.body), /WHATSAPP_MENSAGENS'!G3/);
  const nada = leitura();
  nada.valueRanges[1].values.pop();
  assert.deepEqual(rodarAdaptador('marcar-erros-interpretacao', nada), []);
});
