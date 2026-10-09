const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// 08/10/2026: "Resolvido" e a ultima etapa (mover para ela da a baixa) e a
// previsao por item (PEDIDOS_ITENS.previsao, dividir_por_previsao).
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
  falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', unidade: 'UN', qtd_falta: 50, qtd_baixada: 45 }),
  falt({ id: 'd', os: '90002', deal_id: '600002', descricao_item: 'LINHA', unidade: 'UN', qtd_falta: 5, status: 'SUBSTITUIDO' })
];
function ped(o) {
  return Object.assign({
    id: 'PED-0044', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', atualizado_em: 'P1'
  }, o);
}
function pit(o) {
  return Object.assign({
    id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001',
    nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', previsao: ''
  }, o);
}
const ITENS = [
  pit({}),
  pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 30 })
];
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS.slice(), etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, gerarId));
}

// ---------- A) Resolvido e a ultima etapa ----------
test('etapas padrao: a ultima tem id entregue e nome Resolvido', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, {}));
  assert.deepEqual(r.body.etapasPedido, [
    { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
    { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Resolvido', ordem: 4 }
  ]);
});

test('mover_pedido para a ultima etapa da a baixa e finaliza o pedido', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'c', qtd_baixada: 50, atualizado_em_app: ISO } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'entregue', baixado_em: ISO, atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.acao, h.texto]), [
    ['600001', 'mover_pedido', 'Lucca moveu PED-0044 para Resolvido e deu baixa: 20 MT de VIÉS (resta 80 MT)'],
    ['600002', 'mover_pedido', 'Lucca moveu PED-0044 para Resolvido e deu baixa: 5 UN de BOTÃO (resta 0 UN)']
  ]);
});

test('mover_pedido para a ultima etapa: SUBSTITUIDO e item ja resolvido ficam sem baixa', () => {
  const lin = linhas({
    faltantes: [falt({ id: 'a' }), falt({ id: 'd', status: 'SUBSTITUIDO' }), falt({ id: 'c', os: '90002', deal_id: '600002', qtd_falta: 5, qtd_baixada: 5 })],
    pedidosItens: [pit({}), pit({ id: 'PED-0044|d', item_id: 'd', nome: 'LINHA' }), pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', qtd: 3 })]
  });
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue' }, lin);
  assert.deepEqual(r.operacoes.map((o) => [o.aba, o.linha.id]), [['FALTANTES', 'a'], ['PEDIDOS', 'PED-0044']]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca moveu PED-0044 para Resolvido e deu baixa: 20 MT de VIÉS (resta 80 MT)'],
    ['600002', 'Lucca moveu PED-0044 para Resolvido']
  ]);
});

test('mover_pedido: etapas configuradas, a ultima pela ordem e a que da baixa', () => {
  const etapas = [{ id: 'x', nome: 'Pedir', ordem: 1 }, { id: 'fim', nome: 'Chegou', ordem: 3 }, { id: 'y', nome: 'Meio', ordem: 2 }];
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'fim' }, linhas({ etapas, pedidos: [ped({ etapa: 'x' })] }));
  assert.equal(r.operacoes[r.operacoes.length - 1].linha.baixado_em, ISO);
  assert.match(r.historicos[0].texto, /^Lucca moveu PED-0044 para Chegou e deu baixa: /);
  const meio = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'y' }, linhas({ etapas, pedidos: [ped({ etapa: 'x' })] }));
  assert.deepEqual(meio.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'y', atualizado_em: ISO } }]);
});

test('mover_pedido: sair da ultima etapa depois da baixa -> 409', () => {
  const lin = linhas({ pedidos: [ped({ etapa: 'entregue', baixado_em: '2026-10-07T10:00:00.000Z' })] });
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'aguardando' }, lin),
    { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } });
});

test('baixar_pedido continua funcionando no servidor (compatibilidade)', () => {
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1' }, linhas({ pedidos: [ped({ etapa: 'entregue' })] }));
  assert.equal(r.status, 200);
  assert.equal(r.historicos[0].texto, 'Lucca deu baixa do PED-0044: 20 MT de VIÉS (resta 80 MT)');
});

test('editar_pedido com etapa = ultima tambem da a baixa (com as qtds novas)', () => {
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { etapa: 'entregue' }, itens: [{ itemId: 'a', qtd: 15 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'entregue', baixado_em: ISO, atualizado_em: ISO } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044|a', qtd: 15 } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 15, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'c', qtd_baixada: 50, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca alterou PED-0044: Etapa: Aguardando entrega → Resolvido, qtd de VIÉS: 20 → 15 e deu baixa: 15 MT de VIÉS (resta 85 MT)'],
    ['600002', 'Lucca alterou PED-0044: Etapa: Aguardando entrega → Resolvido e deu baixa: 5 UN de BOTÃO (resta 0 UN)']
  ]);
});

test('dividir_pedido para a ultima etapa da a baixa so da parte nova', () => {
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue', itens: [{ itemId: 'a', qtd: 5 }] });
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[0].linha.id, 'PED-0044.1');
  assert.equal(r.operacoes[0].linha.baixado_em, ISO);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'FALTANTES'), [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 5, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca dividiu PED-0044: 5 MT de VIÉS foram para PED-0044.1 (Resolvido) e deu baixa: 5 MT de VIÉS (resta 95 MT)']
  ]);
  const meio = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'solicitado', itens: [{ itemId: 'a', qtd: 5 }] });
  assert.equal(meio.operacoes[0].linha.baixado_em, '');
  assert.equal(meio.operacoes.some((o) => o.aba === 'FALTANTES'), false);
});

// ---------- B) previsao por item ----------
const GERAR = {
  tipo: 'gerar_pedido',
  itens: [
    { itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '', previsao: '2026-10-25' },
    { itemId: 'c', dealId: '600002', qtd: 5 }
  ],
  origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: 'Gi'
};

test('gerar_pedido: previsao por item gravada na PEDIDOS_ITENS (vazia = a do pedido)', () => {
  const r = acao(GERAR, linhas({ pedidos: [], pedidosItens: [] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes.slice(1).map((o) => [o.linha.item_id, o.linha.previsao]), [['a', '2026-10-25'], ['c', '']]);
  const ruim = acao(Object.assign({}, GERAR, { itens: [{ itemId: 'a', dealId: '600001', qtd: 1, previsao: '31/02' }] }), linhas({ pedidos: [], pedidosItens: [] }));
  assert.deepEqual(ruim, { status: 400, body: { erro: 'Data inválida.' } });
});

test('board: previsao efetiva do item, previsaoMaisProxima e previsoesDiferentes', () => {
  const itens = [pit({ previsao: '2026-10-25' }), pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', previsao: '' })];
  const r = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, { pedidos: [ped({})], pedidosItens: itens }));
  const p = r.body.pedidos[0];
  assert.deepEqual(p.itens.map((i) => [i.itemId, i.previsao]), [['a', '2026-10-25'], ['c', '2026-10-15']]);
  assert.equal(p.previsaoMaisProxima, '2026-10-15');
  assert.equal(p.previsoesDiferentes, true);
  const igual = limpo(ctx.montarRespostaBoard({}, [], [], T0, { pedidos: [ped({})], pedidosItens: [pit({}), pit({ id: 'PED-0044|c', item_id: 'c', previsao: '2026-10-15' })] }));
  assert.equal(igual.body.pedidos[0].previsoesDiferentes, false);
  assert.equal(igual.body.pedidos[0].previsaoMaisProxima, '2026-10-15');
  const sem = limpo(ctx.montarRespostaBoard({}, [], [], T0, { pedidos: [ped({ previsao: '' })], pedidosItens: [pit({})] }));
  assert.equal(sem.body.pedidos[0].previsaoMaisProxima, '');
  assert.equal(sem.body.pedidos[0].itens[0].previsao, '');
});

test('editar_pedido: previsao do item com resumo "previsão de <item>: a → b"', () => {
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', previsao: '2026-10-22' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', atualizado_em: ISO } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044|a', previsao: '2026-10-22' } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [['600001', 'Lucca alterou PED-0044: previsão de VIÉS: 15/10 → 22/10']]);
  // voltar para a do pedido (vazio) quando o item tinha previsao propria
  const lin = linhas({ pedidosItens: [pit({ previsao: '2026-10-22' })] });
  const volta = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', previsao: '' }] }, lin);
  assert.deepEqual(volta.operacoes[1].linha, { id: 'PED-0044|a', previsao: '' });
  assert.equal(volta.historicos[0].texto, 'Lucca alterou PED-0044: previsão de VIÉS: 22/10 → 15/10');
  // mesma previsao efetiva: nada alterado
  assert.deepEqual(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', previsao: '2026-10-15' }] }),
    { status: 400, body: { erro: 'Nada alterado.' } });
  assert.deepEqual(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', previsao: 'x' }] }),
    { status: 400, body: { erro: 'Data inválida.' } });
});

test('dividir_pedido: a parte leva a previsao do item', () => {
  const lin = linhas({ pedidosItens: [pit({ previsao: '2026-10-22' }), ITENS[1]] });
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'solicitado', itens: [{ itemId: 'a', qtd: 5 }] }, lin);
  assert.equal(r.operacoes[1].linha.previsao, '2026-10-22');
});

// Tres previsoes: a 15/10 (do pedido), c 25/10, b 20/10.
const TRES = () => linhas({
  pedidosItens: [
    pit({}),
    pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 5, previsao: '2026-10-25' }),
    pit({ id: 'PED-0044|b', item_id: 'b', nome: 'ZÍPER', un: 'UN', qtd: 6, previsao: '2026-10-20' })
  ]
});

test('dividir_por_previsao: a mais proxima fica; uma parte por data, na etapa do pedido', () => {
  const r = acao({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'P1' }, TRES());
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0044.1', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20',
      responsavel: 'Renata', criado_em: ISO, criado_por: 'Lucca', baixado_em: '', atualizado_em: ISO, pai: 'PED-0044' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0044.1|b', pedido_id: 'PED-0044.1', item_id: 'b', deal_id: '600001', os: '90001', nome: 'ZÍPER', un: 'UN', qtd: 6, fornecedor: '', previsao: '2026-10-20' } },
    { aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0044.2', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-25',
      responsavel: 'Renata', criado_em: ISO, criado_por: 'Lucca', baixado_em: '', atualizado_em: ISO, pai: 'PED-0044' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0044.2|c', pedido_id: 'PED-0044.2', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 5, fornecedor: '', previsao: '2026-10-25' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044|b', qtd: 0 } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044|c', qtd: 0 } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.acao, h.texto]), [
    ['600001', 'dividir_por_previsao', 'Lucca dividiu PED-0044 por previsão: 6 UN de ZÍPER foram para PED-0044.1 (previsão 20/10)'],
    ['600002', 'dividir_por_previsao', 'Lucca dividiu PED-0044 por previsão: 5 UN de BOTÃO foram para PED-0044.2 (previsão 25/10)']
  ]);
  assert.equal(r.body.pedidoId, 'PED-0044.1');
  assert.deepEqual(r.body.partes, ['PED-0044.1', 'PED-0044.2']);
});

test('dividir_por_previsao: item sem data vai por ultimo; validacoes', () => {
  const lin = linhas({ pedidos: [ped({ previsao: '' })], pedidosItens: [pit({ previsao: '2026-10-20' }), ITENS[1]] });
  const r = acao({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'P1' }, lin);
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[0].linha.previsao, '');
  assert.equal(r.operacoes[1].linha.item_id, 'c');
  assert.equal(r.historicos[0].texto, 'Lucca dividiu PED-0044 por previsão: 30 UN de BOTÃO foram para PED-0044.1 (sem previsão)');
  assert.deepEqual(acao({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'P1' }),
    { status: 400, body: { erro: 'Os itens têm a mesma previsão.' } });
  assert.deepEqual(acao({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'X' }, TRES()),
    { status: 409, body: { erro: 'Alguém alterou este pedido agora há pouco.' } });
  assert.deepEqual(acao({ tipo: 'dividir_por_previsao', versao: 'P1' }), { status: 400, body: { erro: 'Pedido não informado.' } });
  assert.deepEqual(acao({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'P1' }, linhas({ pedidos: [ped({ baixado_em: 'X' })] })),
    { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } });
});

// ---------- revisao final: ultima etapa fixa, so ADM, baixa so de item aberto ----------
test('salvar_etapas: a ultima etapa (Resolvido) precisa continuar por ultimo', () => {
  const erro = { status: 400, body: { erro: 'A última etapa (Resolvido) precisa continuar por último.' } };
  // nova etapa depois da ultima
  assert.deepEqual(acao({ tipo: 'salvar_etapas', etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' },
    { id: 'entregue', nome: 'Resolvido' }, { nome: 'Depois' }
  ] }, linhas({ pedidos: [] })), erro);
  // ultima removida
  assert.deepEqual(acao({ tipo: 'salvar_etapas', etapas: [{ id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' }] },
    linhas({ pedidos: [] })), erro);
  // ultima reordenada
  assert.deepEqual(acao({ tipo: 'salvar_etapas', etapas: [{ id: 'entregue', nome: 'Resolvido' }, { id: 'a_pedir', nome: 'A pedir' }] },
    linhas({ pedidos: [] })), erro);
  // nome atual da ultima na mensagem; renomear a ultima mantendo a posicao vale
  const ETAPAS = [{ id: 'a', nome: 'Pedir', ordem: 1 }, { id: 'fim', nome: 'Chegou', ordem: 2 }];
  assert.deepEqual(acao({ tipo: 'salvar_etapas', etapas: [{ id: 'fim', nome: 'Chegou' }, { id: 'a', nome: 'Pedir' }] },
    linhas({ pedidos: [], etapas: ETAPAS })), { status: 400, body: { erro: 'A última etapa (Chegou) precisa continuar por último.' } });
  const ok = acao({ tipo: 'salvar_etapas', etapas: [{ id: 'a', nome: 'Pedir' }, { nome: 'Nova' }, { id: 'fim', nome: 'Chegou na fábrica' }] },
    linhas({ pedidos: [], etapas: ETAPAS }));
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.operacoes[2].linha, { id: 'fim', nome: 'Chegou na fábrica', ordem: 3 });
});

test('salvar_etapas: so administradores', () => {
  const crypto2 = require('crypto');
  const us = [{ email: 'op@exemplo.com', nome: 'Op', perfil: 'operador', senha_hash: ctx.gerarHash(crypto2, 'senha-forte-123'), ativo: 'SIM' }];
  const e = {};
  const login = ctx.processarLogin(crypto2, e, { email: 'op@exemplo.com', senha: 'senha-forte-123' }, us, T0);
  const cab = 'Bearer ' + login.body.token;
  const corpo = { tipo: 'salvar_etapas', etapas: [{ id: 'a_pedir', nome: 'A pedir' }, { id: 'entregue', nome: 'Resolvido' }] };
  const esperado = { status: 403, body: { erro: 'Só administradores podem alterar as etapas do quadro.' } };
  assert.deepEqual(limpo(ctx.preValidarAcao(e, cab, corpo, T0)), Object.assign({ ok: false }, esperado));
  assert.deepEqual(limpo(ctx.processarAcao(e, cab, corpo, linhas({ pedidos: [] }), T0, gerarId)), esperado);
});

test('baixa na ultima etapa so para linhas ABERTO/PARCIAL', () => {
  const lin = linhas({ faltantes: [falt({ id: 'a', status: 'RESOLVIDO' }), falt({ id: 'c', os: '90002', deal_id: '600002', qtd_falta: 50, status: 'PARCIAL' })] });
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue' }, lin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes.map((o) => [o.aba, o.linha.id]), [['FALTANTES', 'c'], ['PEDIDOS', 'PED-0044']]);
});
