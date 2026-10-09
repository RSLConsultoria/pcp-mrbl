const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// Janela de migracao (revisao final da branch): o codigo novo funciona com a aba
// ETAPAS_PEDIDO antiga (4 linhas, sem `concluido`), pedido que a API antiga levou
// para a ultima etapa (com a baixa la) nao fica preso, e o site antigo aberto
// numa aba nao da baixa sem querer na API nova.
const ctx = carregar();
const T0 = Date.UTC(2026, 9, 9, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
function falt(o) {
  return Object.assign({
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: ''
  }, o);
}
const FALT = [falt({ id: 'a' })];
function ped(o) {
  return Object.assign({
    id: 'PED-0044', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', concluido_em: '', atualizado_em: 'P1', pai: ''
  }, o);
}
const ITENS = [{ id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', previsao: '' }];
// Aba antiga: 4 linhas, `entregue` por ultimo.
const ETAPAS4 = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Resolvido', ordem: 4 }
];
const ETAPAS5 = ETAPAS4.concat([{ id: 'concluido', nome: 'Concluído', ordem: 5 }]);
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS.slice(), etapas: ETAPAS4 }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  let n = 0;
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, () => 'h-' + (++n)));
}
const board = (extras) => limpo(ctx.montarRespostaBoard({}, FALT, [], T0, Object.assign({ pedidosItens: ITENS, etapas: ETAPAS4 }, extras))).body;

// ---------- aba antiga sem `concluido` ----------

test('lerEtapas: aba sem `concluido` ganha a etapa virtual Concluido no fim (maior ordem + 1)', () => {
  assert.deepEqual(limpo(ctx.lerEtapas(ETAPAS4)), ETAPAS5);
  const pers = [{ id: 'x', nome: 'X', ordem: 2 }, { id: 'entregue', nome: 'Enviado', ordem: 10 }];
  assert.deepEqual(limpo(ctx.lerEtapas(pers)), pers.concat([{ id: 'concluido', nome: 'Concluído', ordem: 11 }]));
  const ja = ETAPAS4.concat([{ id: 'concluido', nome: 'Recebido', ordem: 5 }]);
  assert.deepEqual(limpo(ctx.lerEtapas(ja)), ja);
  assert.equal(limpo(ctx.lerEtapas([])).length, 5);
});

test('aba antiga: o board mostra Concluido e `entregue` vira a etapa da baixa (nao `aguardando`)', () => {
  const b = board({ pedidos: [ped({})] });
  assert.deepEqual(b.etapasPedido.map((e) => e.id), ['a_pedir', 'solicitado', 'aguardando', 'entregue', 'concluido']);
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue', confirmouBaixa: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.operacoes[r.operacoes.length - 1].linha.baixado_em, ISO);
  const v = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'aguardando' }, linhas({ pedidos: [ped({ etapa: 'a_pedir' })] }));
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.deepEqual(v.operacoes.map((o) => o.aba), ['PEDIDOS']);
  assert.ok(!('baixado_em' in v.operacoes[0].linha));
});

test('aba antiga: pedido que a API antiga baixou em `entregue` fica aberto na etapa da baixa e vai para Concluido', () => {
  const antigo = ped({ etapa: 'entregue', baixado_em: '2026-10-05T10:00:00.000Z' });
  const p = board({ pedidos: [antigo] }).pedidos[0];
  assert.deepEqual([p.finalizado, p.concluidoEm], [false, '']);
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'concluido' }, linhas({ pedidos: [antigo] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'concluido', concluido_em: ISO, atualizado_em: ISO } }]);
});

test('salvar_etapas com a aba antiga grava a linha `concluido` que faltava', () => {
  const r = acao({ tipo: 'salvar_etapas', etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' },
    { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }
  ] }, linhas({ pedidos: [] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes[4], { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'concluido', nome: 'Concluído', ordem: 5 } });
});

test('pedido levado a ultima etapa pela API antiga (baixa la, sem concluido_em) conta como concluido', () => {
  const preso = ped({ etapa: 'concluido', baixado_em: '2026-10-06T10:00:00.000Z' });
  const p = board({ pedidos: [preso], etapas: ETAPAS5 }).pedidos[0];
  assert.deepEqual([p.finalizado, p.concluidoEm], [true, '2026-10-06T10:00:00.000Z']);
  const lin = linhas({ pedidos: [preso], etapas: ETAPAS5 });
  const fim = { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } };
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue', confirmouBaixa: true }, lin), fim);
  assert.deepEqual(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { quem: 'X' } }, lin), fim);
  // na ultima etapa sem a baixa nao e o caso da API antiga: segue aberto
  const semBaixa = board({ pedidos: [ped({ etapa: 'concluido' })], etapas: ETAPAS5 }).pedidos[0];
  assert.equal(semBaixa.finalizado, false);
});

