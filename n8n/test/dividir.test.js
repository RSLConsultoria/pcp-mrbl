const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// F3: dividir_pedido (parte de um pedido chegou e vira PED-xxxx.n).
const ctx = carregar();
const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
let n = 0;
const gerarId = () => 'h-' + (++n);

function falt(o) {
  return Object.assign({
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'ZÍPER METAL', unidade: 'UN',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: ''
  }, o);
}
const FALT = [
  falt({ id: 'a' }),
  falt({ id: 'b', descricao_item: 'VIÉS', unidade: 'MT', qtd_falta: 40 }),
  falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', qtd_falta: 50 })
];
function ped(o) {
  return Object.assign({
    id: 'PED-0002', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'METAIS GAMA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', atualizado_em: 'P2'
  }, o);
}
function pit(o) {
  return Object.assign({
    id: 'PED-0002|a', pedido_id: 'PED-0002', item_id: 'a', deal_id: '600001', os: '90001',
    nome: 'ZÍPER METAL', un: 'UN', qtd: 52, fornecedor: 'METAIS GAMA'
  }, o);
}
const ITENS_P = [
  pit({}),
  pit({ id: 'PED-0002|b', item_id: 'b', nome: 'VIÉS', un: 'MT', qtd: 10, fornecedor: '' }),
  pit({ id: 'PED-0002|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', qtd: 50, fornecedor: '' })
];
const ETAPAS = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'recebidos', nome: 'Recebidos', ordem: 3 }, { id: 'entregue', nome: 'Entregue', ordem: 4 }
];
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS_P.slice(), etapas: ETAPAS }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, gerarId));
}
const DIV = { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'P2', etapa: 'recebidos', itens: [{ itemId: 'a', qtd: 20 }] };
const div = (o, lin) => acao(Object.assign({}, DIV, o), lin);

test('ids: PED-0002.1 e valido, proximo id principal ignora filhos, ordem do board', () => {
  assert.equal(ctx.proximoIdPedido([{ id: 'PED-0002' }, { id: 'PED-0002.7' }]), 'PED-0003');
  assert.equal(ctx.proximoIdPedido([{ id: 'PED-0005.1' }]), 'PED-0006');
  assert.equal(ctx.proximoIdFilho([{ id: 'PED-0002' }], 'PED-0002'), 'PED-0002.1');
  assert.equal(ctx.proximoIdFilho([{ id: 'PED-0002.1' }, { id: 'PED-0002.3' }, { id: 'PED-0020.9' }], 'PED-0002'), 'PED-0002.4');
  assert.equal(ctx.raizDoPedido('PED-0002.3'), 'PED-0002');
  assert.equal(ctx.raizDoPedido('PED-0002'), 'PED-0002');
});

test('dividir_pedido: operacoes, historico por OS envolvida e pedidoId do filho', () => {
  const r = div({ itens: [{ itemId: 'a', qtd: 20 }, { itemId: 'b', qtd: 10 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1', etapa: 'recebidos', origem: 'FORNECEDOR', quem: 'METAIS GAMA', local: 'BRAGANCA', previsao: '2026-10-15',
      responsavel: 'Renata', criado_em: ISO, criado_por: 'Lucca', baixado_em: '', atualizado_em: ISO, pai: 'PED-0002' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', item_id: 'a', deal_id: '600001', os: '90001', nome: 'ZÍPER METAL', un: 'UN', qtd: 20, fornecedor: 'METAIS GAMA' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1|b', pedido_id: 'PED-0002.1', item_id: 'b', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 10, fornecedor: '' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002|a', qtd: 32 } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002|b', qtd: 0 } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002', atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto]), [
    ['600001', '90001', 'dividir_pedido', 'Lucca dividiu PED-0002: 20 UN de ZÍPER METAL; 10 MT de VIÉS foram para PED-0002.1 (Recebidos)']
  ]);
  assert.equal(r.body.pedidoId, 'PED-0002.1');
  assert.equal(r.body.versao, ISO);
  assert.equal(r.body.historicos.length, 1);
});

test('dividir_pedido: numero do filho = maior filho + 1; dividir um filho cria outro filho da raiz', () => {
  const lin = linhas({
    pedidos: [ped({}), ped({ id: 'PED-0002.1', pai: 'PED-0002', etapa: 'recebidos', atualizado_em: 'F1' }),
      ped({ id: 'PED-0002.2', pai: 'PED-0002', baixado_em: 'X' })],
    pedidosItens: ITENS_P.concat([pit({ id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', qtd: 5 })])
  });
  const r = div({}, lin);
  assert.equal(r.body.pedidoId, 'PED-0002.3');
  assert.equal(r.operacoes[0].linha.pai, 'PED-0002');
  const f = div({ pedidoId: 'PED-0002.1', versao: 'F1', etapa: 'entregue', itens: [{ itemId: 'a', qtd: 2 }] }, lin);
  assert.equal(f.status, 200);
  assert.equal(f.body.pedidoId, 'PED-0002.3');
  assert.equal(f.operacoes[0].linha.pai, 'PED-0002');
  assert.deepEqual(f.operacoes[2].linha, { id: 'PED-0002.1|a', qtd: 3 });
  assert.equal(f.historicos[0].texto, 'Lucca dividiu PED-0002.1: 2 UN de ZÍPER METAL foram para PED-0002.3 (Entregue)');
});

test('dividir_pedido: validacoes', () => {
  assert.deepEqual(div({ pedidoId: 'PED-0099' }), { status: 404, body: { erro: 'Pedido não encontrado.' } });
  assert.deepEqual(div({ versao: 'VELHA' }), { status: 409, body: { erro: 'Alguém alterou esta caixa agora há pouco.' } });
  assert.deepEqual(div({}, linhas({ pedidos: [ped({ baixado_em: 'X' })] })), { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } });
  assert.deepEqual(div({ etapa: 'nao_existe' }), { status: 400, body: { erro: 'Etapa inválida.' } });
  assert.deepEqual(div({ itens: [] }), { status: 400, body: { erro: 'Marque ao menos um item que chegou.' } });
  assert.deepEqual(div({ itens: [{ itemId: 'zz', qtd: 1 }] }), { status: 400, body: { erro: 'Item não está no pedido.' } });
  assert.deepEqual(div({ itens: [{ itemId: 'a', qtd: 0 }] }), { status: 400, body: { erro: 'Informe uma quantidade maior que zero' } });
  assert.deepEqual(div({ itens: [{ itemId: 'a', qtd: 53 }] }), { status: 400, body: { erro: 'O pedido tem só 52 UN de ZÍPER METAL.' } });
  assert.deepEqual(div({ itens: [{ itemId: 'a', qtd: 1 }, { itemId: 'a', qtd: 1 }] }), { status: 400, body: { erro: 'Item repetido no pedido.' } });
  assert.deepEqual(div({ itens: [{ itemId: 'a', qtd: 52 }, { itemId: 'b', qtd: 10 }, { itemId: 'c', qtd: 50 }] }),
    { status: 400, body: { erro: 'Para mover o pedido inteiro, arraste o card.' } });
  // tudo de alguns itens, mas nao de todos: ok
  assert.equal(div({ itens: [{ itemId: 'a', qtd: 52 }, { itemId: 'b', qtd: 10 }] }).status, 200);
  // o pre valida o corpo com a mesma mensagem
  const s = sessao();
  const pre = limpo(ctx.preValidarAcao(s.e, s.cab, Object.assign({}, DIV, { itens: [] }), T0));
  assert.deepEqual({ ok: pre.ok, status: pre.status, body: pre.body }, { ok: false, status: 400, body: { erro: 'Marque ao menos um item que chegou.' } });
});

test('dividir_pedido: 403 quando qualquer deal do pedido nao e editavel', () => {
  ctx.DEALS_EDITAVEIS = ['600001'];
  try {
    assert.deepEqual(div({}), { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

test('posse: item pode estar no pai e no filho; outra familia continua 409 no gerar', () => {
  const lin = linhas({
    pedidos: [ped({}), ped({ id: 'PED-0002.1', pai: 'PED-0002', etapa: 'recebidos' })],
    pedidosItens: ITENS_P.concat([pit({ id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', qtd: 20 })])
  });
  const g = acao({ tipo: 'gerar_pedido', itens: [{ itemId: 'a', dealId: '600001', qtd: 1 }], origem: 'FORNECEDOR', local: 'BRAGANCA' }, lin);
  assert.deepEqual(g, { status: 409, body: { erro: 'Item já está no PED-0002.' } });
});

test('board: pai, pedidoIds da familia, qtd 0 ignorada, sem aviso de duplicidade na mesma familia', () => {
  const pedidos = [ped({}), ped({ id: 'PED-0002.1', pai: 'PED-0002', etapa: 'recebidos', atualizado_em: 'F1' }), ped({ id: 'PED-0001' })];
  const itens = [pit({ qtd: 32 }), pit({ id: 'PED-0002|b', item_id: 'b', nome: 'VIÉS', qtd: 0 }),
    pit({ id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', qtd: 20 }), pit({ id: 'PED-0002.1|b', pedido_id: 'PED-0002.1', item_id: 'b', qtd: 10 })];
  const r = limpo(ctx.montarRespostaBoard({}, [falt({ id: 'a' }), falt({ id: 'b' })], [], T0, { pedidos, pedidosItens: itens }));
  assert.deepEqual(r.body.pedidos.map((p) => [p.id, p.pai]), [['PED-0001', ''], ['PED-0002', ''], ['PED-0002.1', 'PED-0002']]);
  assert.deepEqual(r.body.pedidos[1].itens.map((i) => i.itemId), ['a']);
  const its = r.body.caixas[0].itens;
  assert.deepEqual(its.map((i) => [i.id, i.pedidoId, i.pedidoIds]), [
    ['a', 'PED-0002', ['PED-0002', 'PED-0002.1']],
    ['b', 'PED-0002.1', ['PED-0002.1']]
  ]);
  assert.deepEqual(r.body.avisos, []);
});
