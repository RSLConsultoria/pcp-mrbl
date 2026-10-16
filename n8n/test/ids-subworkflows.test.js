// Ids dos subworkflows chamados por Execute Workflow: uma constante só
// (scripts/ids-subworkflows.js). Pode ficar o marcador CONFIGURAR_* (antes de
// criar o workflow no n8n) ou o id real; vazio nunca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { IDS_SUBWORKFLOWS, idSubworkflowValido } = require('../scripts/ids-subworkflows');

test('validador aceita marcador CONFIGURAR_* ou id real e recusa vazio', () => {
  assert.equal(idSubworkflowValido('CONFIGURAR_INTERPRETE'), true);
  assert.equal(idSubworkflowValido('dI2NUYzxfApYM8iA'), true);
  for (const ruim of ['', '   ', 'CONFIGURAR_', null, undefined, 'id com espaço']) assert.equal(idSubworkflowValido(ruim), false, String(ruim));
});

test('os ids configurados são válidos', () => {
  assert.deepEqual(Object.keys(IDS_SUBWORKFLOWS).sort(), ['INTERPRETAR_WHATSAPP', 'INTERPRETE']);
  for (const id of Object.values(IDS_SUBWORKFLOWS)) assert.equal(idSubworkflowValido(id), true, id);
});
