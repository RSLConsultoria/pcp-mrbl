const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { converter } = require('../scripts/sdk-para-json');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-whatsapp-entrada.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

test('workflow de entrada recebe o evento sem responder nem enviar ao grupo', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Receber WhatsApp');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.equal(w.settings.saveDataErrorExecution, 'none');

  const webhook = no(w, 'Receber WhatsApp');
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.match(webhook.parameters.path, /CONFIGURAR_SEGREDO/);

  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest' && /sendText|evolution/i.test(String(n.parameters.url))));
  assert.ok(!w.nodes.some((n) => /responder grupo|enviar (ao|para|pela) whatsapp/i.test(n.name)));
});

test('workflow grava a mensagem antes de chamar o intérprete configurável', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Receber WhatsApp'), ['Ler Contexto WhatsApp']);
  assert.deepEqual(destinos(w, 'Ler Contexto WhatsApp'), ['Preparar Entrada WhatsApp']);
  assert.deepEqual(destinos(w, 'Preparar Entrada WhatsApp', 1), ['Montar Erro de Recepção']);
  assert.deepEqual(destinos(w, 'Preparar Entrada WhatsApp'), ['Gravar Mensagem?']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem?', 0), ['Gravar Mensagem Recebida']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem?', 1), ['Confirmar Recebimento']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem Recebida'), ['Confirmar Recebimento']);
  assert.deepEqual(destinos(w, 'Confirmar Recebimento'), ['Precisa Interpretar?']);
  assert.deepEqual(destinos(w, 'Precisa Interpretar?', 0), ['Montar Contexto do Intérprete']);
  assert.deepEqual(destinos(w, 'Montar Contexto do Intérprete'), ['Interpretar com Modelo']);

  assert.equal(no(w, 'Gravar Mensagem Recebida').parameters.method, 'POST');
  assert.equal(no(w, 'Gravar Mensagem Recebida').retryOnFail, undefined);
  assert.equal(no(w, 'Interpretar com Modelo').type, 'n8n-nodes-base.executeWorkflow');
  assert.match(JSON.stringify(no(w, 'Interpretar com Modelo').parameters.workflowId), /CONFIGURAR_INTERPRETE/);
  assert.equal(no(w, 'Interpretar com Modelo').parameters.options.waitForSubWorkflow, true);
  assert.equal(no(w, 'Confirmar Recebimento').parameters.options.responseCode, 200);
});

test('workflow valida a saída e registra somente erros resumidos', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Interpretar com Modelo'), ['Finalizar Entrada WhatsApp']);
  assert.deepEqual(destinos(w, 'Finalizar Entrada WhatsApp'), ['Tem Sugestão?']);
  assert.deepEqual(destinos(w, 'Tem Sugestão?', 0), ['Gravar Sugestão WhatsApp']);
  assert.equal(no(w, 'Gravar Sugestão WhatsApp').retryOnFail, undefined);

  const erro = no(w, 'Registrar Erro de Recepção');
  assert.equal(erro.parameters.method, 'POST');
  assert.equal(erro.parameters.url, '={{ $json.url }}');
  assert.match(no(w, 'Montar Erro de Recepção').parameters.jsCode, /ERROS_APP/);
  assert.doesNotMatch(no(w, 'Montar Erro de Recepção').parameters.jsCode, /payload.*linhaErroEntrada|texto.*linhaErroEntrada/);
  assert.equal(erro.onError, 'continueRegularOutput');
  assert.deepEqual(destinos(w, 'Registrar Erro de Recepção'), ['Solicitar Reentrega']);
  assert.equal(no(w, 'Solicitar Reentrega').parameters.options.responseCode, 503);
  assert.deepEqual(destinos(w, 'Registrar Erro de Interpretação'), []);
});
