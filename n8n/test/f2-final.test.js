const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const c = carregar();
const T0 = Date.UTC(2026, 9, 7, 15, 0, 0);
const HOJE = new Date(2026, 9, 7);

// ---- I-1: item de erro de rede (continueRegularOutput) ----
test('decidirContato: resposta sem status numerico (erro de rede) pula o item', () => {
  for (const r of [{}, { error: { message: 'ETIMEDOUT' } }, { error: 'socket hang up' }, { statusCode: '' }, { statusCode: null }, { statusCode: 'abc' }]) {
    assert.deepEqual(limpo(c.decidirContato(r)), { pular: true, contactId: null });
  }
});

test('resultadoEnvio: sem status conta como tentativa falha', () => {
  const l = { id: 'a', tentativas: 2 };
  const r = limpo(c.resultadoEnvio(l, { status: undefined, body: undefined, erro: { message: 'timeout of 30000ms exceeded' } }));
  assert.deepEqual(r, { id: 'a', ploomes_status: 'PENDENTE', tentativas: 3, erro: 'timeout of 30000ms exceeded' });
  const r2 = limpo(c.resultadoEnvio({ id: 'b', tentativas: 4 }, { erro: 'ECONNRESET' }));
  assert.equal(r2.ploomes_status, 'ERRO');
  assert.equal(r2.tentativas, 5);
  assert.equal(r2.erro, 'ECONNRESET');
  const r3 = limpo(c.resultadoEnvio({ id: 'c', tentativas: 0 }, {}));
  assert.equal(r3.tentativas, 1);
  assert.equal(r3.ploomes_status, 'PENDENTE');
  assert.ok(r3.erro);
  assert.equal(limpo(c.resultadoEnvio({ id: 'd', tentativas: 0 }, undefined)).tentativas, 1);
});

// ---- I-2: preValidarAcao ----
const HASH = c.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'ana@x.com', nome: 'Ana', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' },
  { email: 'pcp@x.com', nome: 'Paulo', perfil: 'pcp', senha_hash: HASH, ativo: 'SIM' }];
function sessao(estado, email) {
  return 'Bearer ' + c.processarLogin(crypto, estado, { email, senha: 'senha-forte-123' }, USUARIOS, T0).body.token;
}

test('preValidarAcao: 401 sem sessao valida, igual ao processarAcao', () => {
  const corpo = { tipo: 'baixa', dealId: '1', itemId: 'a', valor: 1, versao: '' };
  for (const cab of [undefined, '', 'Bearer xyz', 'Bearer ' + '0'.repeat(64)]) {
    const r = limpo(c.preValidarAcao({}, cab, corpo, T0));
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, limpo(c.processarAcao({}, cab, corpo, {}, T0, () => 'x')).body);
  }
  const e = {}; const cab = sessao(e, 'ana@x.com');
  assert.equal(limpo(c.preValidarAcao(e, cab, corpo, T0 + 13 * 3600 * 1000)).status, 401);
});

test('preValidarAcao: 400 com a mesma mensagem do processarAcao', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  const ePcp = {}; const cabPcp = sessao(ePcp, 'pcp@x.com');
  const casos = [
    [e, cab, null],
    [e, cab, { tipo: 'xyz', dealId: '1' }],
    [e, cab, { tipo: 'baixa', dealId: '1', valor: 1 }],
    [e, cab, { tipo: 'baixa', dealId: '1', itemId: 'a', valor: 0 }],
    [ePcp, cabPcp, { tipo: 'mover', dealId: '1', valor: 'saiu_sem', justificativa: 'curta' }]
  ];
  for (const [est, cb, corpo] of casos) {
    const r = limpo(c.preValidarAcao(est, cb, corpo, T0));
    const p = limpo(c.processarAcao(est, cb, corpo, {}, T0, () => 'x'));
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.deepEqual({ status: r.status, body: r.body }, p);
  }
});

test('preValidarAcao: ok com sessao e corpo validos', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  assert.deepEqual(limpo(c.preValidarAcao(e, cab, { tipo: 'obs_caixa', dealId: '1', valor: 'x', versao: '' }, T0)), { ok: true });
  const ePcp = {}; const cabPcp = sessao(ePcp, 'pcp@x.com');
  assert.deepEqual(limpo(c.preValidarAcao(ePcp, cabPcp,
    { tipo: 'mover', dealId: '1', valor: 'saiu_sem', justificativa: 'a'.repeat(15) }, T0)), { ok: true });
});

// ---- I-3: qtd_baixada ilegivel ----
const AGORA = '2026-10-07T12:00:00.000Z';
const ctxAcao = { usuario: 'Ana', email: 'ana@x.com', agora: AGORA, os: '9', nomeItem: 'ZIPER', un: 'UN', gerarId: () => 'id' };
const acaoBaixa = { tipo: 'baixa', dealId: '1', itemId: 'a', valor: 1, versao: '' };

test('aplicarAcao baixa: qtd_baixada ilegivel = 400; vazia = 0', () => {
  for (const bx of ['abc', '2x', '--']) {
    assert.deepEqual(limpo(c.aplicarAcao(acaoBaixa, { qtd_falta: 10, qtd_baixada: bx, atualizado_em_app: '' }, ctxAcao)),
      { ok: false, status: 400, erro: 'Baixa registrada ilegível na planilha.' });
  }
  for (const bx of ['', null, undefined, '  ']) {
    const r = limpo(c.aplicarAcao(acaoBaixa, { qtd_falta: 10, qtd_baixada: bx, atualizado_em_app: '' }, ctxAcao));
    assert.equal(r.ok, true);
    assert.equal(r.gravacao.campos.qtd_baixada, 1);
  }
});

function linha(o) {
  return Object.assign({
    id: 'a', os: '90001', ciclo: 'PEDIDO', descricao_item: 'ZIPER', unidade: 'UN', qtd_falta: 10, qtd_falta_g: 500,
    status: 'ABERTO', data_separacao: '2026-10-01 09:00', deal_id: '600001', qtd_baixada: '', atualizado_em_app: ''
  }, o);
}

test('montarCaixas: qtd_baixada ilegivel deixa resta null, editavel e gera aviso', () => {
  const r = limpo(c.montarCaixas([linha({ id: 'ok' }), linha({ id: 'ruim', qtd_baixada: 'abc' })], [], HOJE));
  const it = r.caixas[0].itens.find((i) => i.id === 'ruim');
  assert.equal(it.resta, null);
  assert.equal(it.restaG, null);
  assert.equal(it.editavel, true);
  assert.deepEqual(r.avisos, ['FALTANTES linha 3 (OS 90001): qtd_baixada ilegivel']);
  const ok = r.caixas[0].itens.find((i) => i.id === 'ok');
  assert.equal(ok.resta, 10);
});

// ---- edicao restrita (DEALS_EDITAVEIS) ----
test('edicao restrita: 403 em preValidarAcao e processarAcao para caixa fora da lista', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  c.DEALS_EDITAVEIS = ['607479158'];
  try {
    const corpo = { tipo: 'obs_caixa', dealId: '1', valor: 'x', versao: '' };
    const pre = limpo(c.preValidarAcao(e, cab, corpo, T0));
    assert.deepEqual(pre, { ok: false, status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
    const p = limpo(c.processarAcao(e, cab, corpo, {}, T0, () => 'x'));
    assert.equal(p.status, 403);
    assert.equal(p.body.erro, 'Edição liberada em breve para esta caixa.');
    // 401 vem antes do 403; corpo invalido da caixa de teste cai no 400 normal
    assert.equal(limpo(c.preValidarAcao({}, 'Bearer ' + '0'.repeat(64), corpo, T0)).status, 401);
    assert.equal(limpo(c.preValidarAcao(e, cab, { tipo: 'baixa', dealId: '607479158' }, T0)).status, 400);
    assert.deepEqual(limpo(c.preValidarAcao(e, cab, { ...corpo, dealId: '607479158' }, T0)), { ok: true });
  } finally { c.DEALS_EDITAVEIS = []; }
});

test('edicao restrita: board leva dealsEditaveis e o padrao de producao e a OS de teste', () => {
  assert.deepEqual(limpo(c.montarRespostaBoard({}, [], [], T0).body.dealsEditaveis), []);
  const real = carregar({ real: true });
  assert.deepEqual(limpo(real.montarRespostaBoard({}, [], [], T0).body.dealsEditaveis), ['607479158']);
  assert.equal(real.dealEditavel('607479158'), true);
  assert.equal(real.dealEditavel('1'), false);
});
