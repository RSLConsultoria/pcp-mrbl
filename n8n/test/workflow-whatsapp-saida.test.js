const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, limpo } = require('./carregar');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-whatsapp-saida.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

function rodarSelecao(linhas) {
  const contexto = vm.createContext({ $input: { all: () => linhas.map((json) => ({ json })) } });
  for (const arquivoSrc of ARQUIVOS) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', arquivoSrc), 'utf8'), contexto);
  }
  const adaptador = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'selecionar-whatsapp-saida.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', contexto));
}

test('workflow de saida usa o contrato instalado da Evolution e nao repete a chamada', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Enviar WhatsApp');
  assert.equal(w.settings.executionTimeout, 90);
  assert.equal(w.settings.saveDataErrorExecution, 'none');
  assert.deepEqual(no(w, 'A cada 2 minutos').parameters.rule.interval, [{ field: 'minutes', minutesInterval: 2 }]);

  const enviar = no(w, 'Enviar pela Evolution');
  assert.equal(enviar.parameters.method, 'POST');
  assert.equal(enviar.parameters.url, 'http://evolution:8080/message/sendText/producao');
  assert.equal(enviar.credentials.httpHeaderAuth.id, 'G24I6UDBgu3Z5X0b');
  assert.equal(enviar.credentials.httpHeaderAuth.name, 'Evolution API');
  assert.match(enviar.parameters.jsonBody, /number/);
  assert.match(enviar.parameters.jsonBody, /text/);
  assert.equal(enviar.parameters.options.timeout, 30000);
  assert.equal(enviar.retryOnFail, undefined);
});

test('workflow grava ENVIANDO antes da chamada e sempre persiste o resultado', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'A cada 2 minutos'), ['Execucao Agendada?']);
  assert.deepEqual(destinos(w, 'Execucao Agendada?', 0), ['Ler Fila WhatsApp']);
  assert.deepEqual(destinos(w, 'Execucao Agendada?', 1), []);
  assert.deepEqual(destinos(w, 'Ler Fila WhatsApp'), ['Selecionar Saida WhatsApp']);
  assert.deepEqual(destinos(w, 'Selecionar Saida WhatsApp'), ['Gravar Tentativa WhatsApp']);
  assert.deepEqual(destinos(w, 'Gravar Tentativa WhatsApp'), ['Deve Enviar?']);
  assert.deepEqual(destinos(w, 'Deve Enviar?', 0), ['Enviar pela Evolution']);
  assert.deepEqual(destinos(w, 'Enviar pela Evolution'), ['Resultado WhatsApp']);
  assert.deepEqual(destinos(w, 'Resultado WhatsApp'), ['Gravar Resultado WhatsApp']);
  assert.equal(no(w, 'Gravar Tentativa WhatsApp').parameters.operation, 'update');
  assert.equal(no(w, 'Gravar Resultado WhatsApp').parameters.operation, 'update');
  assert.equal(no(w, 'Enviar pela Evolution').onError, 'continueRegularOutput');
});

test('execucao manual para antes de ler ou enviar a fila', () => {
  const w = workflow();
  const trava = no(w, 'Execucao Agendada?');
  assert.equal(trava.parameters.conditions.conditions[0].leftValue, '={{ $execution.mode }}');
  assert.equal(trava.parameters.conditions.conditions[0].rightValue, 'trigger');
  assert.deepEqual(destinos(w, 'Execucao Agendada?', 1), []);
});

test('workflow fica local e le somente a fila necessaria', () => {
  const w = workflow();
  assert.equal(no(w, 'Ler Fila WhatsApp').parameters.sheetName.value, 'WHATSAPP_MENSAGENS');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.ok(!w.nodes.some((n) => /webhook/i.test(n.type)));
});

test('selecao entrega ao Google somente colunas existentes da fila', () => {
  const [item] = rodarSelecao([{
    id: 'MSG-1', grupo_jid: 'grupo-ficticio@g.us', texto: 'Teste de *CAMISA TESTE*',
    direcao: 'ENVIADA', status_envio: 'PENDENTE', criado_em: '2026-10-15T13:00:00.000Z',
    campo_auxiliar_do_node: 'nao pode ir para a planilha'
  }]);
  assert.deepEqual(Object.keys(item.json).sort(), ['erro', 'grupo_jid', 'id', 'status_envio', 'texto']);
});

test('Resultado WhatsApp usa as tentativas da linha lida e agenda a próxima quando não saiu', () => {
  const contexto = vm.createContext({
    $: (nome) => {
      const dados = {
        'Selecionar Saida WhatsApp': [{ id: 'MSG-1', grupo_jid: 'grupo-ficticio@g.us', texto: 'Teste', status_envio: 'ENVIANDO', erro: '' }],
        'Ler Fila WhatsApp': [{ id: 'MSG-0', envio_tentativas: 9 }, { id: 'MSG-1', envio_tentativas: 2 }]
      }[nome];
      if (!dados) throw new Error('node inesperado: ' + nome);
      const itens = dados.map((json) => ({ json }));
      return { first: () => itens[0], all: () => itens };
    },
    $input: { first: () => ({ json: { error: { message: 'The service refused the connection - perhaps it is offline' } } }) }
  });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), contexto);
  const adaptador = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'resultado-whatsapp-saida.js'), 'utf8');
  const [r] = limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', contexto));
  assert.equal(r.json.status_envio, 'PENDENTE');
  assert.equal(r.json.envio_tentativas, 3);
  assert.ok(Date.parse(r.json.envio_proxima) > Date.now() + 25 * 60000);
});
