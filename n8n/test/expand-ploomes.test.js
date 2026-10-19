// Restrição do $expand=OtherProperties às FieldKeys realmente lidas (19/10).
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./carregar');
const { urlsPloomes } = require("../scripts/gerar-workflow-sdk-urls");

const ctx = carregar();

// Chaves presentes no filtro de uma URL.
function chavesDaUrl(url) {
  const dec = decodeURIComponent(url);
  const m = /OtherProperties\(\$filter=([^)]*)\)/.exec(dec);
  assert.ok(m, 'URL sem $expand filtrado: ' + dec);
  return new Set([...m[1].matchAll(/FieldKey eq '([^']+)'/g)].map((x) => x[1]));
}

// Roda f registrando cada FieldKey pedida a propriedadeDoDeal.
function chavesLidas(f) {
  const lidas = new Set();
  const original = ctx.propriedadeDoDeal;
  ctx.propriedadeDoDeal = (deal, campo) => { lidas.add(campo); return original(deal, campo); };
  try { f(); } finally { ctx.propriedadeDoDeal = original; }
  return lidas;
}

const comparar = (lidas, naUrl) => {
  assert.deepEqual([...lidas].sort(), [...naUrl].sort());
};

test('Costura: filtro = chaves lidas por normalizarDealProducao', () => {
  comparar(chavesLidas(() => ctx.normalizarDealProducao({ Id: 1, OtherProperties: [] })), chavesDaUrl(urlsPloomes.costura));
});

test('Previstas: filtro = chaves lidas por normalizarDealPrevisto em todas as etapas 12 a 16', () => {
  const lidas = new Set();
  for (const nome of ['12. A', '13. B', '14. C', '15. D', '16. E']) {
    chavesLidas(() => ctx.normalizarDealPrevisto({ Id: 1, Stage: { Name: nome }, OtherProperties: [] })).forEach((c) => lidas.add(c));
  }
  comparar(lidas, chavesDaUrl(urlsPloomes.previstas));
});

test('Negócios das médias: filtro = chaves lidas por normalizarDealPrevisao', () => {
  comparar(chavesLidas(() => ctx.normalizarDealPrevisao({ Id: 1, OtherProperties: [] })), chavesDaUrl(urlsPloomes.negociosPrevisao));
});

test('Registros das médias: filtro = chaves lidas por normalizarRegistroPrevisao', () => {
  comparar(chavesLidas(() => ctx.normalizarRegistroPrevisao({ DealId: 1, OtherProperties: [] })), chavesDaUrl(urlsPloomes.registrosPrevisao));
});

test('chave CONFIGURAR_ não entra no filtro', () => {
  const c = carregar();
  c.CAMPO_PCP_COMPLETO = 'CONFIGURAR_X';
  assert.ok(!c.fieldKeysConsulta('negocios_previsao').includes('CONFIGURAR_X'));
  assert.ok(!c.fieldKeysConsulta('previstas').includes('CONFIGURAR_X'));
});

test('URLs com aspas simples literais, sem espaço cru e abaixo de 2000 caracteres', () => {
  for (const [nome, url] of Object.entries(urlsPloomes)) {
    assert.ok(url.length < 2000, nome + ' tem ' + url.length);
    assert.ok(!/ /.test(url), nome);
    assert.match(url, /\$expand=OtherProperties\(\$filter=FieldKey%20eq%20'/, nome);
  }
});

test('workflows gerados usam as URLs filtradas, sem $expand=OtherProperties solto', () => {
  const fs = require('fs');
  const path = require('path');
  for (const [arq, urls] of [['pcp-producao-sync', ['costura', 'previstas']], ['pcp-medias-previsao', ['registrosPrevisao', 'negociosPrevisao']]]) {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'json', arq + '.json'), 'utf8');
    assert.ok(!/\$expand=OtherProperties[&,]/.test(txt), arq);
    for (const u of urls) assert.ok(txt.includes(urlsPloomes[u]), arq + ' ' + u);
  }
});
