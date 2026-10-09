const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

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
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: ''
  }, o);
}
const FALT = [
  falt({ id: 'a' }),
  falt({ id: 'b', descricao_item: 'ZÍPER', unidade: 'UN', qtd_falta: 10, qtd_baixada: 4 }),
  falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', unidade: 'UN', qtd_falta: 50 }),
  falt({ id: 'd', os: '90002', deal_id: '600002', descricao_item: 'LINHA', unidade: 'UN', qtd_falta: 5, status: 'SUBSTITUIDO' })
];
function ped(o) {
  return Object.assign({
    id: 'PED-0043', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', atualizado_em: 'P1'
  }, o);
}
function pit(o) {
  return Object.assign({
    id: 'PED-0043|a', pedido_id: 'PED-0043', item_id: 'a', deal_id: '600001', os: '90001',
    nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: ''
  }, o);
}
const SEED_P = { id: 'PED-0000', etapa: '', origem: '', quem: '', local: '', previsao: '', responsavel: '',
  criado_em: '', criado_por: '', baixado_em: '', atualizado_em: '' };
const SEED_I = { id: 'PED-0000|0', pedido_id: 'PED-0000', item_id: 'b', deal_id: '0', os: '0', nome: '', un: '', qtd: '', fornecedor: '' };

function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [SEED_P], pedidosItens: [SEED_I], etapas: [] }, extra);
}
function acao(corpo, lin, opts) {
  const s = sessao();
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, gerarId));
}
const GERAR = {
  tipo: 'gerar_pedido',
  itens: [
    { itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '' },
    { itemId: 'b', dealId: '600001', qtd: 6, fornecedor: 'METAIS GAMA' },
    { itemId: 'c', dealId: '600002', qtd: 50 }
  ],
  origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: 'Renata'
};

// ---------- id ----------
test('proximoIdPedido: maior PED + 1, ignora semente e ids malformados', () => {
  assert.equal(ctx.proximoIdPedido([]), 'PED-0001');
  assert.equal(ctx.proximoIdPedido([SEED_P]), 'PED-0001');
  assert.equal(ctx.proximoIdPedido([{ id: 'PED-0043' }, { id: 'PED-0007' }, { id: 'PED-9x' }, { id: 'XYZ-0999' }, null]), 'PED-0044');
  assert.equal(ctx.proximoIdPedido([{ id: 'PED-9999' }]), 'PED-10000');
});

// ---------- gerar_pedido ----------
test('gerar_pedido: operacoes, historico por OS e resposta', () => {
  const r = acao(GERAR, linhas({ pedidos: [SEED_P, ped({ baixado_em: '2026-10-05T00:00:00.000Z' })], pedidosItens: [SEED_I, pit({})] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes[0], {
    aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0044', etapa: 'a_pedir', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
      previsao: '2026-10-20', responsavel: 'Renata', criado_em: ISO, criado_por: 'Lucca', baixado_em: '', atualizado_em: ISO
    }
  });
  assert.deepEqual(r.operacoes.slice(1), [
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: { id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', previsao: '' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: { id: 'PED-0044|b', pedido_id: 'PED-0044', item_id: 'b', deal_id: '600001', os: '90001', nome: 'ZÍPER', un: 'UN', qtd: 6, fornecedor: 'METAIS GAMA', previsao: '' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: { id: 'PED-0044|c', pedido_id: 'PED-0044', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 50, fornecedor: '', previsao: '' } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto, h.ploomes_status, h.item_id, h.email]), [
    ['600001', '90001', 'gerar_pedido', 'Lucca gerou PED-0044 · 2 itens desta OS · Fornecedor TECIDOS BETA', 'PENDENTE', '', 'lucca@exemplo.com'],
    ['600002', '90002', 'gerar_pedido', 'Lucca gerou PED-0044 · 1 item desta OS · Fornecedor TECIDOS BETA', 'PENDENTE', '', 'lucca@exemplo.com']
  ]);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.pedidoId, 'PED-0044');
  assert.equal(r.body.versao, ISO);
  assert.equal(r.body.historicos.length, 2);
  assert.equal(r.body.historicos[1].dealId, '600002');
  // o workflow publicado nao pode gravar tipos F3 pela via da F2
  assert.equal(r.gravacao, null);
  assert.equal(r.historico, null);
});

test('gerar_pedido: origem Cliente, etapas configuradas e local com acento', () => {
  const r = acao(Object.assign({}, GERAR, { itens: [GERAR.itens[0]], origem: 'cliente', quem: 'CLIENTE ALFA', local: 'São Paulo' }),
    linhas({ etapas: [{ id: 'x2', nome: 'Dois', ordem: 2 }, { id: 'x1', nome: 'Um', ordem: 1 }] }));
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[0].linha.etapa, 'x1');
  assert.equal(r.operacoes[0].linha.local, 'SAO_PAULO');
  assert.equal(r.operacoes[0].linha.origem, 'CLIENTE');
  assert.equal(r.historicos[0].texto, 'Lucca gerou PED-0001 · 1 item desta OS · Cliente CLIENTE ALFA');
});

test('gerar_pedido: 409 item ja em pedido aberto ou inexistente', () => {
  const lin = linhas({ pedidos: [SEED_P, ped({})], pedidosItens: [SEED_I, pit({})] });
  assert.deepEqual(acao(GERAR, lin), { status: 409, body: { erro: 'Item já está no PED-0043.' } });
  const sem = acao(Object.assign({}, GERAR, { itens: [{ itemId: 'zz', dealId: '600001', qtd: 1 }] }));
  assert.equal(sem.status, 409);
  const outroDeal = acao(Object.assign({}, GERAR, { itens: [{ itemId: 'c', dealId: '600001', qtd: 1 }] }));
  assert.equal(outroDeal.status, 409);
  const subst = acao(Object.assign({}, GERAR, { itens: [{ itemId: 'd', dealId: '600002', qtd: 1 }] }));
  assert.equal(subst.status, 409);
  // semente (PED-0000) nao prende o item b
  assert.equal(acao(Object.assign({}, GERAR, { itens: [GERAR.itens[1]] })).status, 200);
});

test('gerar_pedido: quantidade > 0 e <= resta; validacoes de campos', () => {
  const um = (it, extra) => acao(Object.assign({}, GERAR, { itens: [it] }, extra));
  assert.deepEqual(um({ itemId: 'b', dealId: '600001', qtd: 7 }), { status: 400, body: { erro: 'Falta só 6 UN de ZÍPER' } });
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: 0 }).status, 400);
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: -1 }).status, 400);
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: '2,5' }).status, 200);
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: 1 }, { origem: 'OUTRO' }).body.erro, 'Origem inválida.');
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: 1 }, { local: 'RIO' }).body.erro, 'Local inválido.');
  assert.equal(um({ itemId: 'b', dealId: '600001', qtd: 1 }, { previsao: '20/10' }).body.erro, 'Data inválida.');
  assert.equal(acao(Object.assign({}, GERAR, { itens: [] })).status, 400);
  assert.equal(acao(Object.assign({}, GERAR, { itens: [GERAR.itens[0], GERAR.itens[0]] })).body.erro, 'Item repetido no pedido.');
});

test('gerar_pedido: 403 quando qualquer deal envolvido nao e editavel (pre e processar)', () => {
  const s = sessao();
  ctx.DEALS_EDITAVEIS = ['600001'];
  try {
    const pre = limpo(ctx.preValidarAcao(s.e, s.cab, GERAR, T0));
    assert.deepEqual(pre, { ok: false, status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
    const p = limpo(ctx.processarAcao(s.e, s.cab, GERAR, linhas(), T0, gerarId));
    assert.deepEqual(p, { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
    const so1 = Object.assign({}, GERAR, { itens: [GERAR.itens[0]] });
    assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, so1, T0)), { ok: true });
    assert.equal(limpo(ctx.processarAcao(s.e, s.cab, so1, linhas(), T0, gerarId)).status, 200);
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

test('preValidarAcao: 400 das acoes novas com a mesma mensagem do processarAcao', () => {
  const s = sessao();
  for (const corpo of [
    { tipo: 'gerar_pedido', itens: [] },
    { tipo: 'mover_pedido', versao: 'P1', etapa: 'x' },
    { tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: {} },
    { tipo: 'salvar_etapas', etapas: [{ nome: 'Só uma' }] },
    { tipo: 'enviar_oficina' }
  ]) {
    const pre = limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0));
    const p = limpo(ctx.processarAcao(s.e, s.cab, corpo, linhas(), T0, gerarId));
    assert.equal(pre.ok, false);
    assert.deepEqual({ status: pre.status, body: pre.body }, p);
  }
});

// ---------- mover / editar ----------
const LIN_P = () => linhas({ pedidos: [SEED_P, ped({})], pedidosItens: [SEED_I, pit({}), pit({ id: 'PED-0043|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 30 })] });

test('mover_pedido: update da etapa e historico por OS', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'aguardando' }, LIN_P());
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', etapa: 'aguardando', atualizado_em: ISO } }]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca moveu PED-0043 para Aguardando entrega'],
    ['600002', 'Lucca moveu PED-0043 para Aguardando entrega']
  ]);
  assert.equal(r.body.versao, ISO);
});

test('mover_pedido: 409 versao, 404, etapa invalida, mesma etapa, finalizado', () => {
  const m = (o, lin) => acao(Object.assign({ tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'entregue' }, o), lin || LIN_P());
  assert.deepEqual(m({ versao: 'VELHA' }), { status: 409, body: { erro: 'Alguém alterou este pedido agora há pouco.' } });
  assert.deepEqual(m({ pedidoId: 'PED-0099' }), { status: 404, body: { erro: 'Pedido não encontrado.' } });
  assert.equal(m({ pedidoId: 'PED-0000' }).status, 404);
  assert.equal(m({ etapa: 'nao_existe' }).body.erro, 'Etapa inválida.');
  assert.equal(m({ etapa: 'solicitado' }).status, 400);
  const fin = linhas({ pedidos: [ped({ etapa: 'entregue', baixado_em: 'X' })], pedidosItens: [pit({})] });
  assert.equal(m({ etapa: 'a_pedir' }, fin).status, 409);
});

test('mover/editar/baixar: 403 quando o pedido tem item de deal nao editavel', () => {
  ctx.DEALS_EDITAVEIS = ['600001'];
  try {
    const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'entregue' }, LIN_P());
    assert.deepEqual(r, { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
    assert.equal(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }, LIN_P()).status, 403);
    assert.equal(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { quem: 'X' } }, LIN_P()).status, 403);
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

test('editar_pedido: resumo com nomes amigaveis e itens por OS', () => {
  const r = acao({
    tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1',
    campos: { etapa: 'aguardando', origem: 'CLIENTE', quem: 'TECIDOS BETA', local: 'SAO_PAULO', previsao: '2026-10-18', responsavel: 'Gi' },
    itens: [{ itemId: 'a', qtd: 15, fornecedor: 'FITAS DELTA' }, { itemId: 'c', qtd: 30 }]
  }, LIN_P());
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', etapa: 'aguardando', origem: 'CLIENTE', local: 'SAO_PAULO', previsao: '2026-10-18', responsavel: 'Gi', atualizado_em: ISO } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043|a', qtd: 15, fornecedor: 'FITAS DELTA' } }
  ]);
  const comum = 'Etapa: Solicitado → Aguardando entrega, Origem: Fornecedor → Cliente, Local: Bragança → São Paulo, Previsão: 15/10 → 18/10, Responsável: Renata → Gi';
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca alterou PED-0043: ' + comum + ', qtd de VIÉS: 20 → 15, fornecedor de VIÉS: — → FITAS DELTA'],
    ['600002', 'Lucca alterou PED-0043: ' + comum]
  ]);
});

test('editar_pedido: so item de uma OS gera historico so nela; nada alterado; qtd > resta', () => {
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: 'c', qtd: 40 }] }, LIN_P());
  assert.equal(r.status, 200);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [['600002', 'Lucca alterou PED-0043: qtd de BOTÃO: 30 → 40']]);
  assert.deepEqual(r.operacoes[0], { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', atualizado_em: ISO } });
  const nada = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { quem: 'TECIDOS BETA' } }, LIN_P());
  assert.deepEqual(nada, { status: 400, body: { erro: 'Nada alterado.' } });
  const muito = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: 'c', qtd: 51 }] }, LIN_P());
  assert.deepEqual(muito, { status: 400, body: { erro: 'Falta só 50 UN de BOTÃO' } });
  const fora = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: 'b', qtd: 1 }] }, LIN_P());
  assert.equal(fora.status, 400);
  const etapa = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { etapa: 'xx' } }, LIN_P());
  assert.equal(etapa.body.erro, 'Etapa inválida.');
  const versao = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P0', campos: { quem: 'Z' } }, LIN_P());
  assert.equal(versao.status, 409);
});

// ---------- baixar ----------
test('baixar_pedido: so na ultima etapa; soma limitada ao que resta; historico por OS', () => {
  const lin = linhas({
    faltantes: [falt({ id: 'a', qtd_baixada: 0 }), falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', unidade: 'UN', qtd_falta: 50, qtd_baixada: 45 })],
    pedidos: [ped({ etapa: 'entregue' })],
    pedidosItens: [pit({}), pit({ id: 'PED-0043|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 30 })]
  });
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }, lin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'c', qtd_baixada: 50, atualizado_em_app: ISO } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', baixado_em: ISO, atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto]), [
    ['600001', '90001', 'baixar_pedido', 'Lucca deu baixa do PED-0043: 20 MT de VIÉS (resta 80 MT)'],
    ['600002', '90002', 'baixar_pedido', 'Lucca deu baixa do PED-0043: 5 UN de BOTÃO (resta 0 UN)']
  ]);
  const naoUltima = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }, LIN_P());
  assert.deepEqual(naoUltima, { status: 400, body: { erro: 'Dar baixa só na última etapa.' } });
  const ja = linhas({ pedidos: [ped({ etapa: 'entregue', baixado_em: 'X' })], pedidosItens: [pit({})] });
  assert.equal(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }, ja).status, 409);
});

// ---------- etapas ----------
test('salvar_etapas: regrava com ordem, cria ids, remove sem pedido aberto', () => {
  const ETAPAS = [{ id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
    { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Entregue', ordem: 4 }];
  const r = acao({ tipo: 'salvar_etapas', etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Pedido feito' }, { nome: 'Em trânsito' }, { id: 'entregue', nome: 'Entregue' }
  ] }, linhas({ etapas: ETAPAS, pedidos: [ped({})], pedidosItens: [pit({})] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'a_pedir', nome: 'A pedir', ordem: 1 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'solicitado', nome: 'Pedido feito', ordem: 2 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'em_transito', nome: 'Em trânsito', ordem: 3 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'entregue', nome: 'Entregue', ordem: 4 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'update', chave: 'id', linha: { id: 'aguardando', nome: '', ordem: '' } }
  ]);
  assert.deepEqual(r.historicos, []);
  assert.equal(r.body.historico, null);
  assert.equal(r.historico, null);
});

test('salvar_etapas: validacoes e bloqueio de etapa com pedido aberto', () => {
  const s = (etapas, lin) => acao({ tipo: 'salvar_etapas', etapas }, lin);
  assert.equal(s([{ nome: 'Uma' }]).status, 400);
  assert.equal(s([{ nome: 'Uma' }, { nome: '  ' }]).status, 400);
  assert.equal(s([{ nome: 'Uma' }, { nome: 'UMA' }]).status, 400);
  assert.equal(s('x').status, 400);
  assert.equal(s([{ id: 'nao_existe', nome: 'X' }, { nome: 'Y' }]).body.erro, 'Etapa inválida.');
  const lin = linhas({ pedidos: [ped({})], pedidosItens: [pit({})] });
  assert.deepEqual(s([{ id: 'a_pedir', nome: 'A pedir' }, { id: 'entregue', nome: 'Entregue' }], lin),
    { status: 409, body: { erro: 'A etapa Solicitado tem pedidos abertos.' } });
  // pedido finalizado nao bloqueia; aba vazia (padrao) nao gera update de remocao
  const fin = linhas({ pedidos: [ped({ baixado_em: 'X' })], pedidosItens: [pit({})] });
  const ok = s([{ id: 'a_pedir', nome: 'A pedir' }, { id: 'entregue', nome: 'Entregue' }], fin);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.operacoes.map((o) => o.operacao), ['appendOrUpdate', 'appendOrUpdate']);
  // id gerado nao colide com existente
  const col = s([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'A-pedir!' }, { id: 'entregue', nome: 'Entregue' }]);
  assert.equal(col.status, 200);
  assert.equal(col.operacoes[1].linha.id, 'a_pedir_2');
});

// ---------- oficina ----------
// Material da caixa todo na ultima etapa: a e b no PED-0043 (Resolvido, ainda sem baixa: dado antigo).
const NA_ULTIMA = { pedidos: [SEED_P, ped({ etapa: 'entregue' })], pedidosItens: [SEED_I, pit({}), pit({ id: 'PED-0043|b', item_id: 'b', nome: 'ZÍPER', un: 'UN', qtd: 6 })] };

test('enviar_oficina: CAIXAS_PCP appendOrUpdate e herda responsavel ao criar', () => {
  const lin = linhas(Object.assign({ faltantes: [falt({ id: 'a', responsavel: '' }), falt({ id: 'b', responsavel: 'Maria' })] }, NA_ULTIMA));
  const r = acao({ tipo: 'enviar_oficina', dealId: '600001', versao: '' }, lin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [{ aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id', linha: {
    deal_id: '600001', os: '90001', tratativa: 'ENVIADO', tratativa_em: ISO, atualizado_em: ISO, responsavel: 'Maria' } }]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto]), [['600001', '90001', 'enviar_oficina', 'Lucca enviou o material faltante à oficina']]);
  assert.equal(r.gravacao, null);
  assert.equal(r.historico, null);
  const comCp = acao({ tipo: 'enviar_oficina', dealId: '600001', versao: 'C1' }, linhas(Object.assign({ caixasPcp: [{ deal_id: '600001', os: '90001', responsavel: '', atualizado_em: 'C1' }] }, NA_ULTIMA)));
  assert.equal(comCp.status, 200);
  assert.equal('responsavel' in comCp.operacoes[0].linha, false);
  assert.equal(acao({ tipo: 'enviar_oficina', dealId: '600001', versao: 'X' }).status, 409);
  assert.deepEqual(acao({ tipo: 'enviar_oficina', dealId: '777', versao: '' }), { status: 404, body: { erro: 'Caixa não encontrada.' } });
});

test('enviar_oficina: 409 enquanto o material nao esta todo na ultima etapa', () => {
  const erro = { status: 409, body: { erro: 'O material desta caixa ainda não chegou (etapa Resolvido).' } };
  const env = (lin) => acao({ tipo: 'enviar_oficina', dealId: '600001', versao: '' }, lin);
  // a e b sem pedido
  assert.deepEqual(env(linhas()), erro);
  // b sem pedido
  assert.deepEqual(env(linhas({ pedidos: [SEED_P, ped({ etapa: 'entregue' })], pedidosItens: [SEED_I, pit({})] })), erro);
  // tudo com pedido, mas o pedido em etapa anterior
  assert.deepEqual(env(linhas(Object.assign({}, NA_ULTIMA, { pedidos: [SEED_P, ped({ etapa: 'aguardando' })] }))), erro);
  // pedido dividido: a parte ainda em Solicitado segura a caixa
  const partes = {
    pedidos: [SEED_P, ped({ etapa: 'entregue' }), ped({ id: 'PED-0043.1', pai: 'PED-0043', etapa: 'solicitado' })],
    pedidosItens: NA_ULTIMA.pedidosItens.concat([pit({ id: 'PED-0043.1|a', pedido_id: 'PED-0043.1', qtd: 5 })])
  };
  assert.deepEqual(env(linhas(partes)), erro);
  // etapa que nao existe mais conta como a primeira
  assert.deepEqual(env(linhas(Object.assign({}, NA_ULTIMA, { pedidos: [SEED_P, ped({ etapa: 'sumiu' })] }))), erro);
  // pedido baixado nao conta; item resolvido nao conta
  const baixado = linhas(Object.assign({}, NA_ULTIMA, { pedidos: [SEED_P, ped({ etapa: 'entregue' }), ped({ id: 'PED-0044', etapa: 'a_pedir', baixado_em: 'X' })],
    pedidosItens: NA_ULTIMA.pedidosItens.concat([pit({ id: 'PED-0044|a', pedido_id: 'PED-0044' })]) }));
  assert.equal(env(baixado).status, 200);
  const resolvido = linhas({ faltantes: [falt({ id: 'a' }), falt({ id: 'b', qtd_falta: 10, qtd_baixada: 10 })], pedidos: NA_ULTIMA.pedidos, pedidosItens: [SEED_I, pit({})] });
  assert.equal(env(resolvido).status, 200);
  // etapas customizadas: o nome vem da ultima
  const etapas = [{ id: 'x', nome: 'Pedir', ordem: 1 }, { id: 'y', nome: 'No almoxarifado', ordem: 2 }];
  assert.deepEqual(env(linhas(Object.assign({ etapas }, NA_ULTIMA, { pedidos: [SEED_P, ped({ etapa: 'x' })] }))),
    { status: 409, body: { erro: 'O material desta caixa ainda não chegou (etapa No almoxarifado).' } });
  assert.equal(env(linhas(Object.assign({ etapas }, NA_ULTIMA, { pedidos: [SEED_P, ped({ etapa: 'y' })] }))).status, 200);
  // oficina_recebeu nao tem a regra
  assert.equal(acao({ tipo: 'oficina_recebeu', dealId: '600001', versao: '' }, linhas()).status, 200);
});

test('oficina_recebeu: baixa total dos itens abertos e tratativa RECEBIDO', () => {
  const lin = linhas({ faltantes: [
    falt({ id: 'a' }), falt({ id: 'b', qtd_falta: 10, qtd_baixada: 4 }), falt({ id: 'r', qtd_falta: 3, qtd_baixada: 3 }),
    falt({ id: 's', status: 'SUBSTITUIDO' }), falt({ id: 'v', status: 'RESOLVIDO' }), falt({ id: 'n', qtd_falta: '' }),
    falt({ id: 'c', deal_id: '600002', os: '90002' })
  ] });
  const r = acao({ tipo: 'oficina_recebeu', dealId: '600001', versao: '' }, lin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id', linha: { deal_id: '600001', os: '90001', tratativa: 'RECEBIDO', tratativa_em: ISO, atualizado_em: ISO, responsavel: '' } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 100, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'b', qtd_baixada: 10, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), ['Lucca registrou que a oficina recebeu o material']);
});

test('oficina: 403 fora de DEALS_EDITAVEIS', () => {
  ctx.DEALS_EDITAVEIS = ['600002'];
  try {
    const s = sessao();
    const corpo = { tipo: 'oficina_recebeu', dealId: '600001', versao: '' };
    assert.equal(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)).status, 403);
    assert.equal(acao(corpo).status, 403);
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

// ---------- F2 continua ----------
test('acoes da F2 tambem devolvem operacoes e historicos', () => {
  const r = acao({ tipo: 'baixa', dealId: '600001', itemId: 'b', valor: 2, versao: '' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [{ aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'b', qtd_baixada: 6, atualizado_em_app: ISO } }]);
  assert.equal(r.historicos.length, 1);
  assert.deepEqual(r.historico, r.historicos[0]);
  assert.equal(r.gravacao.aba, 'FALTANTES');
  const c = acao({ tipo: 'obs_caixa', dealId: '600001', valor: 'x', versao: '' });
  assert.deepEqual(c.operacoes[0].operacao, 'appendOrUpdate');
  assert.deepEqual(c.operacoes[0].chave, 'deal_id');
  assert.equal(c.operacoes[0].linha.deal_id, '600001');
});

// ---------- revisao da F3 ----------
test('ACOES_F3_ATIVAS=false: 400 no pre e no processar para tipos F3; F2 intacta', () => {
  const s = sessao();
  ctx.ACOES_F3_ATIVAS = false;
  try {
    const esperado = { status: 400, body: { erro: 'Esta ação ainda não está disponível.' } };
    for (const corpo of [GERAR, { tipo: 'enviar_oficina', dealId: '600001', versao: '' }, { tipo: 'salvar_etapas', etapas: [] }]) {
      assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), Object.assign({ ok: false }, esperado));
      assert.deepEqual(limpo(ctx.processarAcao(s.e, s.cab, corpo, linhas(), T0, gerarId)), esperado);
    }
    assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, { tipo: 'obs_caixa', dealId: '600001', valor: 'x', versao: '' }, T0)), { ok: true });
  } finally {
    ctx.ACOES_F3_ATIVAS = true;
  }
  assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, GERAR, T0)), { ok: true });
});

test('pedido sem itens validos: editar/mover/baixar -> 409', () => {
  const lin = linhas({ pedidos: [ped({ etapa: 'entregue' })], pedidosItens: [pit({ deal_id: '0' })] });
  for (const corpo of [
    { tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'aguardando' },
    { tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { quem: 'X' } },
    { tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }
  ]) {
    assert.deepEqual(acao(corpo, lin), { status: 409, body: { erro: 'Pedido sem itens válidos.' } });
  }
});

test('baixar_pedido: pula SUBSTITUIDO e omite itens com dar 0 do historico', () => {
  const lin = linhas({
    faltantes: [falt({ id: 'a' }), falt({ id: 'd', status: 'SUBSTITUIDO' }), falt({ id: 'c', os: '90002', deal_id: '600002', qtd_falta: 5, qtd_baixada: 5 })],
    pedidos: [ped({ etapa: 'entregue' })],
    pedidosItens: [pit({}), pit({ id: 'PED-0043|d', item_id: 'd', nome: 'LINHA' }),
      pit({ id: 'PED-0043|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', qtd: 3 })]
  });
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1' }, lin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes.map((o) => [o.aba, o.linha.id]), [['FALTANTES', 'a'], ['PEDIDOS', 'PED-0043']]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca deu baixa do PED-0043: 20 MT de VIÉS (resta 80 MT)']
  ]);
});

test('gerar_pedido: item ja resolvido -> 409', () => {
  const corpo = (id) => ({ tipo: 'gerar_pedido', origem: 'Fornecedor', quem: 'TECIDOS BETA', local: 'Bragança', responsavel: 'Gi', itens: [{ itemId: id, dealId: '600001', qtd: 1 }] });
  const lin = linhas({ faltantes: [falt({ id: 'v', status: 'RESOLVIDO' }), falt({ id: 'z', qtd_falta: 5, qtd_baixada: 5 }), falt({ id: 'a' })] });
  const esperado = { status: 409, body: { erro: 'Item já resolvido.' } };
  assert.deepEqual(acao(corpo('v'), lin), esperado);
  assert.deepEqual(acao(corpo('z'), lin), esperado);
  assert.equal(acao(corpo('a'), lin).status, 200);
});

test('oficina_recebeu: qtd_baixada ilegivel -> 400', () => {
  const lin = linhas({ faltantes: [falt({ id: 'a', qtd_baixada: 'abc' })] });
  assert.deepEqual(acao({ tipo: 'oficina_recebeu', dealId: '600001', versao: '' }, lin),
    { status: 400, body: { erro: 'Baixa registrada ilegível na planilha.' } });
});

test('editar_pedido: previsao dd/mm usa o ano corrente', () => {
  const lin = linhas({ pedidos: [ped({ previsao: '15/10' })], pedidosItens: [pit({})] });
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { previsao: '2026-10-15', quem: 'NOVO' } }, lin);
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[0].linha.previsao, undefined);
  assert.equal(r.operacoes[0].linha.quem, 'NOVO');
});

// ---------- fornecedor e responsavel obrigatorios; locais novos ----------

test('gerar_pedido: fornecedor (ou cliente) e responsavel obrigatorios, no pre e no processar', () => {
  const s = sessao();
  const casos = [
    [{ quem: '' }, 'Informe o fornecedor.'],
    [{ quem: '   ' }, 'Informe o fornecedor.'],
    [{ origem: 'CLIENTE', quem: '' }, 'Informe o cliente.'],
    [{ responsavel: '' }, 'Informe o responsável.'],
    [{ responsavel: undefined }, 'Informe o responsável.']
  ];
  for (const [extra, erro] of casos) {
    const corpo = Object.assign({}, GERAR, extra);
    assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), { ok: false, status: 400, body: { erro } });
    assert.deepEqual(acao(corpo), { status: 400, body: { erro } });
  }
});

test('local de entrega: Oficina e Cliente', () => {
  const r = acao(Object.assign({}, GERAR, { itens: [GERAR.itens[0]], local: 'OFICINA' }));
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[0].linha.local, 'OFICINA');
  assert.equal(acao(Object.assign({}, GERAR, { itens: [GERAR.itens[0]], local: 'Cliente' })).operacoes[0].linha.local, 'CLIENTE');
  const e = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { local: 'OFICINA' } }, LIN_P());
  assert.equal(e.status, 200);
  assert.equal(e.historicos[0].texto, 'Lucca alterou PED-0043: Local: Bragança → Oficina');
});

test('editar_pedido: nao deixa limpar fornecedor nem responsavel', () => {
  const ed = (campos) => acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos }, LIN_P());
  assert.deepEqual(ed({ quem: '' }), { status: 400, body: { erro: 'Informe o fornecedor.' } });
  assert.deepEqual(ed({ origem: 'CLIENTE', quem: '' }), { status: 400, body: { erro: 'Informe o cliente.' } });
  assert.deepEqual(ed({ responsavel: ' ' }), { status: 400, body: { erro: 'Informe o responsável.' } });
  assert.equal(ed({ quem: 'AVIAMENTOS DELTA', responsavel: 'Gi' }).status, 200);
});
