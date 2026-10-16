const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { converter } = require('../scripts/sdk-para-json');

const wf = (n) => converter(path.join(__dirname, '..', 'workflows', n));
const destinos = (w, de, saida) => ((w.connections[de] || { main: [] }).main[saida] || []).map((c) => c.node);

test('API: loop de escritas liga done ao Limpar Cache (e dele, pelo pedido de interpretação, ao Responder Acao) e cada lote ao Gravar Lote', () => {
  const w = wf('pcp-api.sdk.js');
  assert.deepStrictEqual(destinos(w, 'Loop Escritas', 0), ['Limpar Cache']);
  assert.deepStrictEqual(destinos(w, 'Limpar Cache', 0), ['Pedir Interpretação?']);
  assert.deepStrictEqual(destinos(w, 'Pedir Interpretação?', 1), ['Responder Acao']);
  assert.deepStrictEqual(destinos(w, 'Disparar Interpretação', 0), ['Responder Acao']);
  assert.deepStrictEqual(destinos(w, 'Loop Escritas', 1), ['Repetir?']);
  assert.deepStrictEqual(destinos(w, 'Repetir?', 0), ['Gravar Lote']);
  assert.deepStrictEqual(destinos(w, 'Repetir?', 1), ['Gravar Anexo']);
  assert.deepStrictEqual(destinos(w, 'Gravar Lote', 0), ['Loop Escritas']);
  assert.deepStrictEqual(destinos(w, 'Gravar Anexo', 0), ['Loop Escritas']);
  // saida de erro (index 1): Montar Erro -> Gravar Erro -> Responder Erro; nunca o Responder Acao
  assert.deepStrictEqual(destinos(w, 'Gravar Lote', 1), ['Montar Erro']);
  assert.deepStrictEqual(destinos(w, 'Gravar Anexo', 1), ['Montar Erro']);
  assert.deepStrictEqual(destinos(w, 'Montar Erro', 0), ['Gravar Erro']);
  assert.deepStrictEqual(destinos(w, 'Gravar Erro', 0), ['Responder Erro']);
  const no = (n) => w.nodes.find((x) => x.name === n);
  assert.strictEqual(no('Gravar Lote').onError, 'continueErrorOutput');
  assert.strictEqual(no('Gravar Lote').retryOnFail, true);
  assert.strictEqual(no('Gravar Anexo').onError, 'continueErrorOutput');
  assert.strictEqual(no('Gravar Anexo').retryOnFail, undefined);
  assert.strictEqual(no('Gravar Erro').retryOnFail, undefined);
  assert.strictEqual(w.settings.saveDataErrorExecution, 'none');
  // Responder Acao: so pelo fim do loop (via Limpar Cache e o pedido de interpretação), Tem Escritas? (nao) e Acao OK? (nao)
  const paraResponder = Object.entries(w.connections)
    .flatMap(([de, c]) => c.main.flatMap((saida, i) => saida.filter((x) => x.node === 'Responder Acao').map(() => de + ':' + i)));
  assert.deepStrictEqual(paraResponder.sort(), ['Acao OK?:1', 'Disparar Interpretação:0', 'Pedir Interpretação?:1', 'Tem Escritas?:1']);
  assert.deepStrictEqual(destinos(w, 'Precisa Ler?', 1), ['Responder Board']);
});

test('nomes de node unicos, webhooks com webhookId e credencial nas leituras em lote', () => {
  const w = wf('pcp-api-homolog.sdk.js');
  const nomes = w.nodes.map((n) => n.name);
  assert.strictEqual(new Set(nomes).size, nomes.length);
  const hooks = w.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  assert.deepStrictEqual(hooks.map((n) => n.parameters.path).sort(), ['pcp-acao-h', 'pcp-board-h', 'pcp-login-h']);
  assert.ok(hooks.every((n) => /^[0-9a-f-]{36}$/.test(n.webhookId)));
  const ler = w.nodes.find((n) => n.name === 'Ler Planilha');
  assert.strictEqual(ler.credentials.googleApi.id, '72hvCT9jkADwOOo1');
});

test('toda conexao aponta para node existente', () => {
  for (const f of ['pcp-api.sdk.js', 'pcp-api-homolog.sdk.js', 'pcp-envio.sdk.js', 'pcp-producao-sync.sdk.js', 'pcp-whatsapp-entrada.sdk.js', 'pcp-whatsapp-saida.sdk.js']) {
    const w = wf(f);
    const nomes = new Set(w.nodes.map((n) => n.name));
    for (const [de, c] of Object.entries(w.connections)) {
      assert.ok(nomes.has(de), f + ': ' + de);
      c.main.flat().forEach((x) => assert.ok(nomes.has(x.node), f + ': ' + x.node));
    }
  }
});
