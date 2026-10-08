const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);

function falt(o) {
  return Object.assign({
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', data_separacao: '2026-10-01 09:00', atualizado_em_app: ''
  }, o);
}
const PEDIDOS = [
  { id: 'PED-0000', etapa: '', origem: '', quem: '', local: '', previsao: '', responsavel: '', criado_em: '', criado_por: '', baixado_em: '', atualizado_em: '' },
  { id: 'PED-0044', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-15',
    responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca', baixado_em: '', atualizado_em: 'P44' },
  { id: 'PED-0007', etapa: 'entregue', origem: 'cliente', quem: 'CLIENTE ALFA', local: 'SAO_PAULO', previsao: '',
    responsavel: '', criado_em: '2026-09-01T10:00:00.000Z', criado_por: 'Lucca', baixado_em: '2026-09-10T10:00:00.000Z', atualizado_em: 'P7' },
  { id: 'PED-0010', etapa: 'entregue', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '',
    responsavel: '', criado_em: '', criado_por: '', baixado_em: '', atualizado_em: 'P10' },
  { id: 'lixo', etapa: 'a_pedir' }
];
const ITENS = [
  { id: 'PED-0000|0', pedido_id: 'PED-0000', item_id: 'b', deal_id: '0', os: '0', nome: '', un: '', qtd: '', fornecedor: '' },
  { id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: '20', fornecedor: 'FITAS DELTA' },
  { id: 'PED-0007|b', pedido_id: 'PED-0007', item_id: 'b', deal_id: '600001', os: '90001', nome: 'ZÍPER', un: 'UN', qtd: 3, fornecedor: '' }
];

test('board: pedidos (sem semente/malformados), ordenados, finalizado derivado', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, { pedidos: PEDIDOS, pedidosItens: ITENS }));
  assert.deepEqual(r.body.pedidos.map((p) => [p.id, p.finalizado]), [['PED-0007', true], ['PED-0010', false], ['PED-0044', false]]);
  assert.deepEqual(r.body.pedidos[2], {
    id: 'PED-0044', pai: '', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-15',
    previsaoMaisProxima: '2026-10-15', previsoesDiferentes: false, responsavel: 'Renata', criadoEm: '2026-10-01T10:00:00.000Z', baixadoEm: '', versao: 'P44', finalizado: false,
    itens: [{ itemId: 'a', dealId: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: 'FITAS DELTA', previsao: '2026-10-15' }]
  });
  assert.equal(r.body.pedidos[0].origem, 'CLIENTE');
  assert.equal(r.body.pedidos[0].local, 'SAO_PAULO');
  assert.deepEqual(r.body.pedidos[1].itens, []);
});

test('board: etapasPedido padrao com aba vazia; ordenadas pela coluna ordem', () => {
  const vazio = limpo(ctx.montarRespostaBoard({}, [], [], T0, {}));
  assert.deepEqual(vazio.body.etapasPedido, [
    { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
    { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Resolvido', ordem: 4 }
  ]);
  assert.deepEqual(vazio.body.pedidos, []);
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, { etapas: [
    { id: 'c', nome: 'Três', ordem: '3' }, { id: 'a', nome: 'Um', ordem: 1 }, { id: 'x', nome: '', ordem: '' }, { id: 'b', nome: 'Dois', ordem: 2 }
  ] }));
  assert.deepEqual(r.body.etapasPedido.map((e) => e.id), ['a', 'b', 'c']);
  // finalizado usa a ultima etapa configurada
  const f = limpo(ctx.montarRespostaBoard({}, [], [], T0, { etapas: [{ id: 'a', nome: 'Um', ordem: 1 }, { id: 'entregue', nome: 'Fim', ordem: 2 }],
    pedidos: PEDIDOS, pedidosItens: ITENS }));
  assert.equal(f.body.pedidos.find((p) => p.id === 'PED-0007').finalizado, true);
  // finalizado = baixado_em preenchido, independente da etapa
  const g = limpo(ctx.montarRespostaBoard({}, [], [], T0, { etapas: [{ id: 'entregue', nome: 'Fim', ordem: 1 }, { id: 'z', nome: 'Z', ordem: 2 }],
    pedidos: PEDIDOS, pedidosItens: ITENS }));
  assert.equal(g.body.pedidos.find((p) => p.id === 'PED-0007').finalizado, true);
  assert.equal(g.body.pedidos.find((p) => p.id === 'PED-0010').finalizado, false);
});

test('board: item.pedidoId so de pedido aberto; caixa.tratativa e tratativaEm', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [falt({ id: 'a' }), falt({ id: 'b' }), falt({ id: 'c' })], [], T0, {
    pedidos: PEDIDOS, pedidosItens: ITENS,
    caixasPcp: [{ deal_id: '600001', os: '90001', tratativa: 'enviado', tratativa_em: '2026-10-08T12:00:00.000Z', atualizado_em: 'C1' }]
  }));
  const cx = r.body.caixas[0];
  assert.deepEqual(cx.itens.map((i) => [i.id, i.pedidoId]), [['a', 'PED-0044'], ['b', ''], ['c', '']]);
  assert.equal(cx.tratativa, 'ENVIADO');
  assert.equal(cx.tratativaEm, '2026-10-08T12:00:00.000Z');
  const sem = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, {})).body.caixas[0];
  assert.equal(sem.tratativa, '');
  assert.equal(sem.tratativaEm, '');
  assert.equal(sem.itens[0].pedidoId, '');
});

test('board: avisos de pedido duplicado e item em dois pedidos abertos', () => {
  const dup = Object.assign({}, PEDIDOS[1], { quem: 'OUTRO' });
  const itens = ITENS.concat([{ id: 'PED-0010|a', pedido_id: 'PED-0010', item_id: 'a', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 1, fornecedor: '' }]);
  const r = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, { pedidos: PEDIDOS.concat([dup]), pedidosItens: itens }));
  assert.deepEqual(r.body.avisos, [
    'Pedido PED-0044 duplicado na planilha (gerado ao mesmo tempo?). Revise a aba PEDIDOS.',
    'Item VIÉS (OS 90001) está em mais de um pedido aberto.'
  ]);
  assert.equal(r.body.pedidos.filter((p) => p.id === 'PED-0044').length, 1);
  assert.equal(r.body.pedidos.find((p) => p.id === 'PED-0044').quem, 'TECIDOS BETA');
});

test('board: fornecedores e responsaveis ativos (vazio ou SIM), sem repetir, em ordem pt-BR', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, {
    fornecedores: [
      { id: '1', nome: 'Tecidos Beta', ativo: '' }, { id: '2', nome: 'Aviamentos Delta', ativo: 'SIM' },
      { id: '3', nome: 'Ziper Antigo', ativo: 'NAO' }, { id: '4', nome: ' Tecidos Beta ', ativo: 'sim' },
      { id: '5', nome: '', ativo: '' }, { id: '6', nome: 'Ácido Ltda', ativo: 'S' }
    ],
    responsaveis: [{ nome: 'Lucca', ativo: '' }, { nome: 'Fátima', ativo: 'SIM' }, { nome: 'Gi' }, { nome: 'Ex', ativo: 'NÃO' }, { nome: 'Cesar', ativo: 'TRUE' }]
  }));
  assert.deepEqual(r.body.fornecedores, ['Ácido Ltda', 'Aviamentos Delta', 'Tecidos Beta']);
  assert.deepEqual(r.body.responsaveis, ['Cesar', 'Fátima', 'Gi', 'Lucca']);
  const vazio = limpo(ctx.montarRespostaBoard({}, [], [], T0, {}));
  assert.deepEqual(vazio.body.fornecedores, []);
  assert.deepEqual(vazio.body.responsaveis, []);
});
