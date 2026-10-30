const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Até o go-live, o envio ao Ploomes só vai para os cards de teste. O card de
// teste do funil Produção (F4) entra junto, para o registro da OS de teste.
test('envio ao Ploomes libera os cards de teste, inclusive o da Produção', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'selecionar-envio.js'), 'utf8');
  const lista = JSON.parse(fonte.match(/var DEALS_PERMITIDOS = MODO_QA \? \[\] : (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(lista, ['607479158', '607493886', '607493902', '607520448', '607612577']);
});
