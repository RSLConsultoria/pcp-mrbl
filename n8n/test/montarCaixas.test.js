const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const HOJE = new Date(2026, 9, 7);

function linha(o) {
  return Object.assign({
    id: '600001|PEDIDO|a', os: '90001', ciclo: 'PEDIDO', referencia: 'REF1',
    descricao_peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', secao: 'COSTURA',
    cod_item: '', descricao_item: 'ZIPER METAL MEDIO', cor: '00002', nome_cor: 'preto',
    tamanho: '', unidade: 'UN', qtd_necessaria: 52, qtd_separada: 0, qtd_falta: 52,
    qtd_necessaria_g: '', qtd_separada_g: '', qtd_falta_g: '', status: 'ABERTO',
    data_separacao: '2026-10-01 09:00', data_atualizacao: '', data_resolucao: '',
    obs_almoxarifado: '', deal_id: '600001', link_negocio: '', sincronizado_em: ''
  }, o);
}

function ganha(o) {
  return Object.assign({
    data_ganho: '2026-10-03 15:10', os: '90001', referencia: 'REF1',
    descricao_peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', caixa: 'Caixa de costura',
    saiu_com_falta: 'NÃO', qtd_itens_faltando: 0, itens_faltando: '', conferido_em: 'PEDIDO',
    titulo_card: '', deal_id: '600001', link_negocio: '', atualizado_em: ''
  }, o);
}

test('util: numero, dataISO e semAcento', () => {
  assert.equal(ctx.numero(''), null);
  assert.equal(ctx.numero('163,5'), 163.5);
  assert.ok(Number.isNaN(ctx.numero('abc')));
  assert.equal(ctx.dataISO('2026-10-01 09:00', 2026), '2026-10-01');
  assert.equal(ctx.dataISO('09/10', 2026), '2026-10-09');
  assert.equal(ctx.dataISO('9/10/26', 2026), '2026-10-09');
  assert.equal(ctx.dataISO('ontem', 2026), '');
  assert.equal(ctx.semAcento('Calça Açaí'), 'CALCA ACAI');
});

test('agrupa as linhas de um negocio numa caixa so', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'a' }),
    linha({ id: 'b', descricao_item: 'ETIQUETA TAMANHO (34)', nome_cor: '', cor: '', data_separacao: '2026-09-30 10:00' })
  ], [], HOJE));
  assert.equal(r.caixas.length, 1);
  const c = r.caixas[0];
  assert.equal(c.id, '600001');
  assert.equal(c.os, '90001');
  assert.equal(c.ciclo, 'PEDIDO');
  assert.equal(c.tipo, 'COSTURA');
  assert.equal(c.peca, 'PECA TESTE A');
  assert.equal(c.cliente, 'CLIENTE ALFA');
  assert.equal(c.registradoEm, '2026-09-30');
  assert.equal(c.saiu, false);
  assert.equal(c.itens.length, 2);
  assert.deepEqual(c.itens[0], {
    id: 'a', nome: 'ZIPER METAL MEDIO', cor: 'preto', un: 'UN', necessaria: 52, separada: 0,
    falta: 52, faltaG: null, status: 'ABERTO', baixada: 0, resta: 52, restaG: null,
    obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '', versao: '', editavel: true
  });
  assert.equal(c.itens[1].cor, '');
});

test('item: cor cai no codigo, obs junta as duas colunas, previsao e gramas', () => {
  const r = limpo(ctx.montarCaixas([linha({
    nome_cor: '', cor: '00002', obs_almoxarifado: 'fornecedor atrasou', observacao_pcp: 'cobrar sexta',
    previsao: '09/10', descricao_item: 'LINHA 120 RESISTENTE', unidade: 'cones', qtd_falta: 2, qtd_falta_g: 100,
    responsavel: 'Maria'
  })], [], HOJE));
  const c = r.caixas[0];
  assert.equal(c.responsavel, 'Maria');
  const i = c.itens[0];
  assert.equal(i.cor, '00002');
  assert.equal(i.obsAlmox, 'fornecedor atrasou');
  assert.equal(i.obsPcp, 'cobrar sexta');
  assert.equal(i.previsao, '2026-10-09');
  assert.equal(i.faltaG, 100);
});

test('com linhas de CORTE: caixa vira CORTE, some PEDIDO resolvido, fica PEDIDO aberto', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'p1', status: 'RESOLVIDO', qtd_falta: 0, data_resolucao: '2026-10-02 08:00' }),
    linha({ id: 'p2', descricao_item: 'TAG', status: 'ABERTO' }),
    linha({ id: 'p3', descricao_item: 'LACRE', status: 'SUBSTITUIDO', qtd_falta: 0 }),
    linha({ id: 'c1', ciclo: 'CORTE', descricao_item: 'LACRE', status: 'PARCIAL', qtd_falta: 10, data_separacao: '2026-10-04 10:00' })
  ], [], HOJE));
  const c = r.caixas[0];
  assert.equal(c.ciclo, 'CORTE');
  assert.deepEqual(c.itens.map((i) => i.id), ['p2', 'c1']);
  assert.equal(c.registradoEm, '2026-10-01');
});

test('sem CORTE: itens RESOLVIDO ficam na caixa (contam como resolvidos)', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'a' }),
    linha({ id: 'b', status: 'RESOLVIDO', qtd_falta: 0, data_resolucao: '2026-10-05 11:00' })
  ], [], HOJE));
  assert.deepEqual(r.caixas[0].itens.map((i) => [i.id, i.status, i.resolvidoEm]),
    [['a', 'ABERTO', ''], ['b', 'RESOLVIDO', '2026-10-05']]);
});

test('linhas invalidas viram aviso e nao derrubam o resto', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'sem-deal', deal_id: '' }),
    linha({ id: 'qtd-ruim', qtd_falta: 'muito' }),
    {},
    linha({ id: 'ok' })
  ], [], HOJE));
  assert.equal(r.caixas.length, 1);
  assert.deepEqual(r.caixas[0].itens.map((i) => i.id), ['ok']);
  assert.deepEqual(r.avisos, [
    'FALTANTES linha 2: sem deal_id ou os, ignorada',
    'FALTANTES linha 3 (OS 90001): qtd_falta invalida, ignorada'
  ]);
});

test('cruza com CAIXAS GANHAS: saiu, saiuComFalta e saiuEm', () => {
  const r = limpo(ctx.montarCaixas([linha({})], [ganha({ saiu_com_falta: 'SIM' })], HOJE));
  const c = r.caixas[0];
  assert.equal(c.saiu, true);
  assert.equal(c.saiuComFalta, true);
  assert.equal(c.saiuEm, '2026-10-03');
});

test('caixa so na CAIXAS GANHAS: sem falta fica sem itens; com falta le o texto', () => {
  const r = limpo(ctx.montarCaixas([], [
    ganha({ deal_id: '700001', os: '90002', caixa: 'Caixa de acabamento', saiu_com_falta: 'NÃO', data_ganho: '2026-10-02 10:00' }),
    ganha({
      deal_id: '700002', os: '90003', saiu_com_falta: 'SIM', conferido_em: 'CORTE', data_ganho: '2026-09-18 10:00',
      itens_faltando: 'VIES LINEAR 6 CM (falta 450 MT); LINHA 120 RESIST. PREPARACAO (falta 3 cones); GABARITO'
    })
  ], HOJE));
  const [a, b] = r.caixas.sort((x, y) => x.os.localeCompare(y.os));
  assert.equal(a.os, '90002');
  assert.equal(a.tipo, 'ACABAMENTO');
  assert.equal(a.ciclo, 'PEDIDO');
  assert.equal(a.registradoEm, '2026-10-02');
  assert.deepEqual(a.itens, []);
  assert.equal(b.ciclo, 'CORTE');
  assert.deepEqual(b.itens.map((i) => [i.id, i.nome, i.falta, i.un, i.status]), [
    ['700002|ganha|0', 'VIES LINEAR 6 CM', 450, 'MT', 'ABERTO'],
    ['700002|ganha|1', 'LINHA 120 RESIST. PREPARACAO', 3, 'cones', 'ABERTO'],
    ['700002|ganha|2', 'GABARITO', null, '', 'ABERTO']
  ]);
});

test('ordena as caixas pela data de registro, a mais antiga primeiro', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'x', deal_id: '2', os: '2', data_separacao: '2026-10-05 10:00' }),
    linha({ id: 'y', deal_id: '1', os: '1', data_separacao: '2026-09-20 10:00' })
  ], [], HOJE));
  assert.deepEqual(r.caixas.map((c) => c.os), ['1', '2']);
});

test('dataISO aceita sufixo de hora no formato dd/mm', () => {
  assert.equal(ctx.dataISO('07/10/2026 09:00:00', 2026), '2026-10-07');
  assert.equal(ctx.dataISO('7/10/2026 9:05', 2026), '2026-10-07');
});

test('qtd_falta vazia fica null e o item PEDIDO continua aberto num negocio com CORTE', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'p', ciclo: 'PEDIDO', status: 'ABERTO', qtd_falta: '' }),
    linha({ id: 'c', ciclo: 'CORTE', status: 'ABERTO', qtd_falta: 3 })
  ], [], HOJE));
  const itens = r.caixas[0].itens;
  assert.equal(itens.length, 2);
  assert.equal(itens.find((i) => i.id === 'p').falta, null);
});

test('status SUBSTITUIDO com acento e caixa baixa e descartado; status normaliza', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'a', status: 'Substituído' }),
    linha({ id: 'b', status: 'Parcial' })
  ], [], HOJE));
  assert.deepEqual(r.caixas[0].itens.map((i) => [i.id, i.status]), [['b', 'PARCIAL']]);
});

test('caixa so em GANHAS com falta e sem itens detalhados ganha item generico aberto', () => {
  const r = limpo(ctx.montarCaixas([], [
    ganha({ deal_id: '700009', os: '90009', saiu_com_falta: 'SIM', itens_faltando: '   ' })
  ], HOJE));
  assert.deepEqual(r.caixas[0].itens, [{
    id: '700009|ganha|0', nome: 'Itens não detalhados na planilha', cor: '', un: '',
    necessaria: null, separada: null, falta: null, faltaG: null, status: 'ABERTO',
    baixada: 0, resta: null, restaG: null, obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '',
    versao: '', editavel: false
  }]);
});
