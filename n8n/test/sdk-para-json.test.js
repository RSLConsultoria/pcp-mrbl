const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { converter } = require('../scripts/sdk-para-json');

const wf = (n) => converter(path.join(__dirname, '..', 'workflows', n));
const destinos = (w, de, saida) => ((w.connections[de] || { main: [] }).main[saida] || []).map((c) => c.node);

test('API: loop de escritas liga done ao Responder Acao e cada lote ao Gravar Lote', () => {
  const w = wf('pcp-api.sdk.js');
  assert.deepStrictEqual(destinos(w, 'Loop Escritas', 0), ['Responder Acao']);
  assert.deepStrictEqual(destinos(w, 'Loop Escritas', 1), ['Gravar Lote']);
  assert.deepStrictEqual(destinos(w, 'Gravar Lote', 0), ['Loop Escritas']);
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
  for (const f of ['pcp-api.sdk.js', 'pcp-api-homolog.sdk.js', 'pcp-envio.sdk.js']) {
    const w = wf(f);
    const nomes = new Set(w.nodes.map((n) => n.name));
    for (const [de, c] of Object.entries(w.connections)) {
      assert.ok(nomes.has(de), f + ': ' + de);
      c.main.flat().forEach((x) => assert.ok(nomes.has(x.node), f + ': ' + x.node));
    }
  }
});
