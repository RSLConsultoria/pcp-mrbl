// F5a · Visão da peça: ação anotar_peca (única escrita) e anotações/histórico no board.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const ISO = '2026-10-27T12:00:00.000Z';
function contexto() {
  const ctx = carregar();
  const estado = {};
  const U = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'PCP', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-123' }, U, T0);
  // Board em cache com os deals usados nos testes (o deal tem de ser da OS).
  estado.board = { guardadoEm: T0, corpo: { caixas: [
    { dealId: '607479158', os: '123456' }, { dealId: '600000001', os: '123456' }
  ], producao: [{ dealId: '607612577', os: '123456' }] } };
  return { ctx, estado, cab: 'Bearer ' + r.body.token };
}
const corpo = (o) => Object.assign({ tipo: 'anotar_peca', os: '123456', dealId: '607612577', texto: '  Cliente pediu\npara segurar  ' }, o || {});

test('anotar_peca grava só o HISTORICO_APP (ANOTACAO) e devolve o id', () => {
  const { ctx, estado, cab } = contexto();
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo(), T0)), { ok: true });
  const r = limpo(ctx.processarAcao(estado, cab, corpo(), {}, T0, () => 'H-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, []);
  const texto = 'Pessoa PCP anotou: "Cliente pediu para segurar"';
  assert.deepEqual(r.historicos, [{ id: 'H-1', quando: ISO, usuario: 'Pessoa PCP', email: 'pcp@teste.local', deal_id: '607612577', os: '123456',
    item_id: '', acao: 'ANOTACAO', texto: texto, ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '' }]);
  assert.deepEqual(r.body, { ok: true, versao: ISO, historico: { quando: ISO, usuario: 'Pessoa PCP', texto: texto, ploomes: 'PENDENTE' }, anotacaoId: 'H-1' });
  assert.equal(r.ploomes, null);
  assert.equal(r.interpretar, null);
  assert.equal(r.gravacao, null);
});

test('anotar_peca: validações (400) e sessão (401)', () => {
  const { ctx, estado, cab } = contexto();
  const casos = [
    [corpo({ texto: '   ' }), 'Escreva a anotação.'],
    [corpo({ texto: 5 }), 'Escreva a anotação.'],
    [corpo({ texto: 'a'.repeat(501) }), 'Anotação com no máximo 500 caracteres.'],
    [corpo({ texto: 'linha 1\n\nlinha 2' }), 'A anotação não pode ter linha em branco.'],
    [corpo({ texto: 'linha 1\r\n  \r\nlinha 2' }), 'A anotação não pode ter linha em branco.'],
    [corpo({ os: '' }), 'Informe a OS.'],
    [corpo({ dealId: 'abc' }), 'Informe o card do Ploomes.']
  ];
  for (const [c, erro] of casos) {
    assert.deepEqual(limpo(ctx.processarAcao(estado, cab, c, {}, T0, () => 'H')), { status: 400, body: { erro } }, erro);
    assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, c, T0)), { ok: false, status: 400, body: { erro } }, erro);
  }
  assert.equal(ctx.processarAcao(estado, 'Bearer x', corpo(), {}, T0, () => 'H').status, 401);
  assert.equal(ctx.preValidarAcao(estado, 'Bearer x', corpo(), T0).status, 401);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ texto: 'a'.repeat(500) }), {}, T0, () => 'H').status, 200);
});

test('anotar_peca: só nos deals liberados até o go-live (lista vazia = todos)', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_EDITAVEIS = ['607479158'];
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['607612577'];
  const erro403 = { status: 403, body: { erro: 'Edição liberada em breve para esta OS.' } };
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607479158' }), {}, T0, () => 'H').status, 200);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607612577' }), {}, T0, () => 'H').status, 200);
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H')), erro403);
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo({ dealId: '600000001' }), T0)), Object.assign({ ok: false }, erro403));
  // Com uma lista vazia e a outra preenchida, vale a preenchida.
  ctx.DEALS_EDITAVEIS = [];
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H')), erro403);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607612577' }), {}, T0, () => 'H').status, 200);
  ctx.DEALS_EDITAVEIS = ['607479158'];
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H')), erro403);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607479158' }), {}, T0, () => 'H').status, 200);
  // As duas vazias: todos.
  ctx.DEALS_EDITAVEIS = [];
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H').status, 200);
});

test('anotar_peca: o card tem de ser da OS (board ou resposta do pcp-peca em cache)', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  const erro = { status: 400, body: { erro: 'Este card não é desta OS.' } };
  const tenta = (c) => limpo(ctx.processarAcao(estado, cab, c, {}, T0, () => 'H'));
  const pre = (c) => limpo(ctx.preValidarAcao(estado, cab, c, T0));
  // Pelo board: caixa e produção com essa OS e esse deal.
  assert.equal(tenta(corpo({ dealId: '607479158' })).status, 200);
  assert.equal(tenta(corpo({ dealId: '607612577' })).status, 200);
  // Deal de outra OS: recusa (no board, a caixa 600000002 é da OS 90002).
  estado.board.corpo.caixas.push({ dealId: '600000002', os: '90002' });
  assert.deepEqual(tenta(corpo({ dealId: '600000002' })), erro);
  assert.deepEqual(pre(corpo({ dealId: '600000002' })), Object.assign({ ok: false }, erro));
  // Deal desconhecido: recusa.
  assert.deepEqual(tenta(corpo({ dealId: '600000099' })), erro);
  // Sem board e sem cache da peça: recusa.
  delete estado.board;
  assert.deepEqual(tenta(corpo({ dealId: '607612577' })), erro);
  // Pelo cache do pcp-peca (mesmo vencido: a ligação card–OS não muda).
  estado.pecas = { '123456': { guardadoEm: T0 - 5 * 60e3, corpo: { os: '123456', cards: [{ dealId: '607612577', os: '123456' }, { dealId: '607600001', os: '123456' }] } } };
  assert.equal(tenta(corpo({ dealId: '607612577' })).status, 200);
  assert.equal(tenta(corpo({ dealId: '607600001' })).status, 200);
  assert.deepEqual(pre(corpo({ dealId: '607600001' })), { ok: true });
  // O card no cache é de outra OS: recusa.
  assert.deepEqual(tenta(corpo({ os: '90002', dealId: '607600001' })), erro);
});

test('anotar_peca: a OS aceita os mesmos caracteres da busca (inclusive espaço)', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  estado.board.corpo.caixas.push({ dealId: '600000003', os: 'REF Ç 01/A' });
  const r = limpo(ctx.processarAcao(estado, cab, corpo({ os: '  REF  Ç 01/A ', dealId: '600000003' }), {}, T0, () => 'H'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.historicos[0].os, 'REF Ç 01/A');
  for (const ruim of ["x' or 1", 'a'.repeat(61), '   ']) {
    assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ os: ruim }), {}, T0, () => 'H')), { status: 400, body: { erro: 'Informe a OS.' } }, ruim);
  }
});

test('board: histórico com id e acao quando existem; anotações numa lista própria', () => {
  const { ctx } = contexto();
  const hist = [
    { id: 'H1', deal_id: '600001', os: '90001', acao: 'baixa', quando: '2026-10-27T10:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes_status: 'ENVIADO' },
    { id: 'H2', deal_id: '607612577', os: '90001', acao: 'ANOTACAO', quando: '2026-10-27T11:00:00.000Z', usuario: 'Ana', texto: 'Ana anotou: "x"', ploomes_status: '' },
    { id: 'H3', deal_id: '600001', os: '90001', acao: 'ANOTACAO', quando: '2026-10-27T09:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "y"', ploomes_status: 'ENVIADO' },
    { id: 'H4', deal_id: '600001', os: '', acao: 'ANOTACAO', quando: '2026-10-27T08:00:00.000Z', usuario: 'Bia', texto: 'sem OS', ploomes_status: 'ENVIADO' }
  ];
  assert.deepEqual(limpo(ctx.historicoDoDeal(hist, '600001'))[0],
    { id: 'H1', acao: 'baixa', quando: '2026-10-27T10:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' });
  assert.deepEqual(limpo(ctx.historicoDoDeal([{ deal_id: '1', quando: 'q', usuario: 'A', texto: 't', ploomes_status: 'ENVIADO' }], '1')),
    [{ quando: 'q', usuario: 'A', texto: 't', ploomes: 'ENVIADO' }]);
  const anot = [
    { id: 'H2', quando: '2026-10-27T11:00:00.000Z', usuario: 'Ana', texto: 'Ana anotou: "x"', ploomes: 'PENDENTE', dealId: '607612577', os: '90001' },
    { id: 'H3', quando: '2026-10-27T09:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "y"', ploomes: 'ENVIADO', dealId: '600001', os: '90001' }
  ];
  assert.deepEqual(limpo(ctx.anotacoesDoBoard(hist)), anot);
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [], [], T0, { historico: hist })).body.anotacoes, anot);
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [], [], T0, {})).body.anotacoes, []);
});
