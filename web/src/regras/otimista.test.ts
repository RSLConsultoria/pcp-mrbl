import { describe, expect, it } from 'vitest';
import type { Acao, Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import { aplicarOtimista, aplicarPendentes, pendentesVivos, versaoNoBoard, type Pendente } from './otimista';
import { faltasSemPedido } from './pedidos';
import { colunaSaida, textoPedidoDoItem } from './saidas';
import { caixa, item } from './teste-util';

const ctx = { hoje: '2026-10-08', n: 7 };
const etapas: EtapaPedido[] = [
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ent', nome: 'Resolvido', ordem: 3 }
];
const pi = (o: Partial<ItemPedido> = {}): ItemPedido => ({
  itemId: 'i1', dealId: '600001', os: '90001', nome: 'ZIPER METAL', un: 'UN', qtd: 52, fornecedor: '', previsao: '', ...o
});
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0002', pai: '', etapa: 'sol', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [pi()], ...o
});
// Caixa 600001 com o item i1 (falta 52) e o i2 (falta 10), os dois no PED-0002.
function quadro(o: Partial<Board> = {}): Board {
  return {
    geradoEm: '', avisos: [], usuarios: [], etapasPedido: etapas,
    caixas: [caixa({ versao: 'c1', itens: [item({ versao: 'v-i1', pedidoId: 'PED-0002' }), item({ id: 'i2', nome: 'VIES', un: 'MT', falta: 10, resta: 10, pedidoId: 'PED-0002' })] })],
    pedidos: [ped({ itens: [pi(), pi({ itemId: 'i2', nome: 'VIES', un: 'MT', qtd: 10 })] })],
    ...o
  };
}
const aplicar = (b: Board, a: Acao) => aplicarOtimista(b, a, ctx);
const itemDe = (b: Board, id: string) => b.caixas[0].itens.find((i) => i.id === id)!;
const pedidoDe = (b: Board, id: string) => (b.pedidos ?? []).find((p) => p.id === id);

describe('aplicarOtimista: campos da F2', () => {
  it('baixa soma na baixada e refaz o resta', () => {
    const b = aplicar(quadro(), { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 20, versao: 'v-i1' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 20, resta: 32 });
  });
  it('baixa do resto tira o item das faltas; restaG acompanha', () => {
    const b0 = quadro({ caixas: [caixa({ itens: [item({ un: 'cones', falta: 4, resta: 4, faltaG: 200, restaG: 200 })] })] });
    const b = aplicar(b0, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 1, versao: '' });
    expect(itemDe(b, 'i1')).toMatchObject({ resta: 3, restaG: 150 });
    const fim = aplicar(b, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 3, versao: '' });
    expect(itemDe(fim, 'i1').resta).toBe(0);
    expect(faltasSemPedido(fim)).toEqual([]);
  });
  it('previsão e observação do item, responsável, previsão e observação da caixa', () => {
    let b = aplicar(quadro(), { tipo: 'previsao_item', dealId: '600001', itemId: 'i1', valor: '2026-10-20', versao: '' });
    b = aplicar(b, { tipo: 'obs_item', dealId: '600001', itemId: 'i1', valor: '  linha 1\nlinha 2 ', versao: '' });
    b = aplicar(b, { tipo: 'responsavel', dealId: '600001', valor: 'Renata', versao: '' });
    b = aplicar(b, { tipo: 'previsao_caixa', dealId: '600001', valor: '2026-10-21', versao: '' });
    b = aplicar(b, { tipo: 'obs_caixa', dealId: '600001', valor: 'urgente', versao: '' });
    expect(itemDe(b, 'i1')).toMatchObject({ previsao: '2026-10-20', obsPcp: 'linha 1 linha 2' });
    expect(b.caixas[0]).toMatchObject({ responsavel: 'Renata', previsao: '2026-10-21', observacao: 'urgente' });
  });
  it('não altera o board de entrada nem as versões', () => {
    const b0 = quadro();
    const copia = structuredClone(b0);
    const b = aplicar(b0, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 5, versao: 'v-i1' });
    expect(b0).toEqual(copia);
    expect(itemDe(b, 'i1').versao).toBe('v-i1');
  });
  it('caixa ou item que não existe: board igual', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'obs_caixa', dealId: 'x', valor: 'a', versao: '' })).toBe(b0);
  });
});

describe('aplicarOtimista: pedidos', () => {
  it('mover_pedido troca a etapa', () => {
    const b = aplicar(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'a', finalizado: false, versao: 'v1' });
  });
  it('mover para a última etapa finaliza, dá a baixa e solta o item do pedido', () => {
    const b = aplicar(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'ent', finalizado: true, baixadoEm: '2026-10-08' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0, pedidoIds: [], pedidoId: '' });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0 });
  });
  it('baixa do pedido não passa do que falta', () => {
    const b0 = quadro();
    b0.pedidos![0].itens[0].qtd = 80;
    const b = aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0 });
  });
  it('pedido finalizado ou sumido: board igual', () => {
    const b0 = quadro({ pedidos: [ped({ finalizado: true })] });
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' })).toBe(b0);
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-9', versao: 'v1', etapa: 'a' })).toBe(b0);
  });
  it('baixar_pedido só na última etapa', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1' })).toBe(b0);
    const b1 = quadro({ pedidos: [ped({ etapa: 'ent' })] });
    expect(pedidoDe(aplicar(b1, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1' }), 'PED-0002')?.finalizado).toBe(true);
  });
  it('editar_pedido: campos, itens e a previsão herdada acompanha a do pedido', () => {
    const b0 = quadro({ pedidos: [ped({ previsao: '2026-10-10', itens: [pi({ previsao: '2026-10-10' }), pi({ itemId: 'i2', previsao: '2026-10-15' })] })] });
    const b = aplicar(b0, {
      tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: { previsao: '2026-10-12', quem: 'TECIDOS BETA' },
      itens: [{ itemId: 'i1', qtd: 40, fornecedor: 'GAMA' }]
    });
    const p = pedidoDe(b, 'PED-0002')!;
    expect(p).toMatchObject({ previsao: '2026-10-12', quem: 'TECIDOS BETA', previsaoMaisProxima: '2026-10-12', previsoesDiferentes: true });
    expect(p.itens[0]).toMatchObject({ qtd: 40, fornecedor: 'GAMA', previsao: '2026-10-12' });
    expect(p.itens[1].previsao).toBe('2026-10-15');
  });
  it('editar_pedido: previsão própria vazia volta a ser a do pedido', () => {
    const b0 = quadro({ pedidos: [ped({ previsao: '2026-10-10', itens: [pi({ previsao: '2026-10-15' })] })] });
    const b = aplicar(b0, { tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: {}, itens: [{ itemId: 'i1', qtd: 52, fornecedor: '', previsao: '' }] });
    expect(pedidoDe(b, 'PED-0002')!.itens[0].previsao).toBe('2026-10-10');
  });
  it('editar_pedido para a última etapa dá a baixa com a quantidade editada', () => {
    const b = aplicar(quadro(), { tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: { etapa: 'ent' }, itens: [{ itemId: 'i1', qtd: 30, fornecedor: '' }] });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'ent', finalizado: true });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 30, resta: 22, pedidoIds: [] });
  });
  it('dividir_pedido: parte provisória com o id previsto e o resto no original', () => {
    const b = aplicar(quadro(), { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent', itens: [{ itemId: 'i1', qtd: 20 }, { itemId: 'i2', qtd: 10 }] });
    expect(pedidoDe(b, 'PED-0002')!.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 32]]);
    const parte = pedidoDe(b, 'PED-0002.1')!;
    expect(parte).toMatchObject({ pai: 'PED-0002', etapa: 'ent', provisorio: true, finalizado: true, criadoEm: '2026-10-08' });
    expect(parte.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 20], ['i2', 10]]);
    // a parte em Resolvido já deu a baixa; o i2 foi todo e saiu do PED-0002
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 20, resta: 32, pedidoIds: ['PED-0002'] });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0, pedidoIds: [] });
  });
  it('dividir_pedido para uma etapa do meio: o item fica nos dois pedidos', () => {
    const b = aplicar(quadro(), { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a', itens: [{ itemId: 'i1', qtd: 20 }] });
    expect(itemDe(b, 'i1').pedidoIds).toEqual(['PED-0002', 'PED-0002.1']);
    expect(textoPedidoDoItem(itemDe(b, 'i1'), b.pedidos!, etapas)).toBe('PED-0002 · Solicitado, PED-0002.1 · A pedir');
  });
  it('dividir_por_previsao: uma parte por data, a mais próxima fica', () => {
    const b0 = quadro({ pedidos: [ped({ itens: [pi({ previsao: '2026-10-10' }), pi({ itemId: 'i2', previsao: '2026-10-20' })] })] });
    const b = aplicar(b0, { tipo: 'dividir_por_previsao', pedidoId: 'PED-0002', versao: 'v1' });
    expect(pedidoDe(b, 'PED-0002')!.itens.map((i) => i.itemId)).toEqual(['i1']);
    expect(pedidoDe(b, 'PED-0002.1')).toMatchObject({ previsao: '2026-10-20', etapa: 'sol', provisorio: true, previsoesDiferentes: false });
    expect(itemDe(b, 'i2').pedidoIds).toEqual(['PED-0002.1']);
  });
  it('gerar_pedido: pedido provisório na primeira etapa e os itens saem das faltas', () => {
    const b0 = quadro({ pedidos: [], caixas: [caixa({ itens: [item(), item({ id: 'i2', nome: 'VIES', un: 'MT' })] })] });
    expect(faltasSemPedido(b0)[0].itens).toHaveLength(2);
    const b = aplicar(b0, {
      tipo: 'gerar_pedido', origem: 'CLIENTE', quem: 'ALFA', local: 'SAO_PAULO', previsao: '2026-10-20', responsavel: 'Maria',
      itens: [{ itemId: 'i1', dealId: '600001', qtd: 10, fornecedor: '', previsao: '' }, { itemId: 'i2', dealId: '600001', qtd: 5, fornecedor: 'X', previsao: '2026-10-25' }]
    });
    const novo = pedidoDe(b, 'novo:7')!;
    expect(novo).toMatchObject({ etapa: 'a', origem: 'CLIENTE', provisorio: true, previsaoMaisProxima: '2026-10-20', previsoesDiferentes: true });
    expect(novo.itens.map((i) => [i.nome, i.os, i.qtd, i.previsao])).toEqual([['ZIPER METAL', '90001', 10, '2026-10-20'], ['VIES', '90001', 5, '2026-10-25']]);
    expect(faltasSemPedido(b)).toEqual([]);
    expect(textoPedidoDoItem(itemDe(b, 'i1'), b.pedidos!, etapas)).toBe('Novo pedido · A pedir');
  });
  it('salvar_etapas: nomes, ordem e id provisório para a etapa nova', () => {
    const b = aplicar(quadro(), { tipo: 'salvar_etapas', etapas: [{ id: 'a', nome: 'Compras' }, { nome: 'Em trânsito ' }, { id: 'ent', nome: 'Resolvido' }] });
    expect(b.etapasPedido).toEqual([
      { id: 'a', nome: 'Compras', ordem: 1 }, { id: 'novo:7.1', nome: 'Em trânsito', ordem: 2 }, { id: 'ent', nome: 'Resolvido', ordem: 3 }
    ]);
  });
});

describe('aplicarOtimista: oficina', () => {
  const saiu = () => quadro({ caixas: [caixa({ saiu: true, saiuComFalta: true, itens: [item({ resta: 0, baixada: 52 })] })], pedidos: [] });
  it('enviar à oficina leva a caixa para Enviado', () => {
    const b = aplicar(saiu(), { tipo: 'enviar_oficina', dealId: '600001', versao: '' });
    expect(b.caixas[0]).toMatchObject({ tratativa: 'ENVIADO', tratativaEm: '2026-10-08' });
    expect(colunaSaida(b.caixas[0], [], etapas).coluna).toBe('enviado');
  });
  it('oficina recebeu: Concluído e baixa total dos itens abertos', () => {
    const b0 = quadro({ caixas: [caixa({ saiu: true, saiuComFalta: true, tratativa: 'ENVIADO', itens: [item({ baixada: 2, resta: 50 })] })] });
    const b = aplicar(b0, { tipo: 'oficina_recebeu', dealId: '600001', versao: '' });
    expect(b.caixas[0].tratativa).toBe('RECEBIDO');
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0 });
  });
});

const pend = (id: number, acao: Acao, o: Partial<Pendente> = {}): Pendente => ({ id, acao, estado: 'fila', confirmadaEm: 0, ...o });
const obs = (valor: string, versao = 'v-i1'): Acao => ({ tipo: 'obs_item', dealId: '600001', itemId: 'i1', valor, versao });

describe('pendentesVivos', () => {
  it('as não confirmadas ficam sempre', () => {
    const ps = [pend(1, obs('a'), { estado: 'enviando' }), pend(2, obs('b'))];
    expect(pendentesVivos(ps, quadro(), 99)).toEqual(ps);
  });
  it('confirmada sai quando o board foi pedido depois da confirmação', () => {
    const p = pend(1, obs('a'), { estado: 'confirmada', confirmadaEm: 3, versaoNova: 'v2' });
    expect(pendentesVivos([p], quadro(), 2)).toEqual([p]);
    expect(pendentesVivos([p], quadro(), 3)).toEqual([]);
  });
  it('confirmada sai quando o alvo já tem a versão nova; as anteriores do mesmo alvo também', () => {
    const a = pend(1, obs('a'), { estado: 'confirmada', confirmadaEm: 5, versaoNova: 'v2' });
    const b = pend(2, obs('b', 'v2'), { estado: 'confirmada', confirmadaEm: 6, versaoNova: 'v3' });
    const c = pend(3, obs('c', 'v3'), { estado: 'enviando' });
    const outro = pend(4, { tipo: 'obs_caixa', dealId: '600001', valor: 'x', versao: 'c1' }, { estado: 'confirmada', confirmadaEm: 4, versaoNova: 'c2' });
    const comV = (v: string) => { const q = quadro(); q.caixas[0].itens[0].versao = v; return q; };
    expect(pendentesVivos([outro, a, b, c], comV('v2'), 0)).toEqual([outro, b, c]);
    expect(pendentesVivos([outro, a, b, c], comV('v3'), 0)).toEqual([outro, c]);
  });
  it('versaoNoBoard acha item, pedido e caixa', () => {
    expect(versaoNoBoard(quadro(), obs('a'))).toBe('v-i1');
    expect(versaoNoBoard(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: '', etapa: 'a' })).toBe('v1');
    expect(versaoNoBoard(quadro(), { tipo: 'enviar_oficina', dealId: '600001', versao: '' })).toBe('c1');
    expect(versaoNoBoard(quadro(), { tipo: 'salvar_etapas', etapas: [] })).toBeUndefined();
  });
});

describe('aplicarPendentes', () => {
  it('aplica na ordem da fila: a última observação vence', () => {
    const b = aplicarPendentes(quadro(), [pend(1, obs('a')), pend(2, obs('b'))], '2026-10-08');
    expect(itemDe(b, 'i1').obsPcp).toBe('b');
  });
  it('dois pedidos gerados na fila têm ids provisórios diferentes', () => {
    const gerar = (itemId: string): Acao => ({
      tipo: 'gerar_pedido', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
      itens: [{ itemId, dealId: '600001', qtd: 1, fornecedor: '', previsao: '' }]
    });
    const b0 = quadro({ pedidos: [], caixas: [caixa({ itens: [item(), item({ id: 'i2' })] })] });
    const b = aplicarPendentes(b0, [pend(1, gerar('i1')), pend(2, gerar('i2'))], '2026-10-08');
    expect(b.pedidos!.map((p) => p.id)).toEqual(['novo:1', 'novo:2']);
  });
});
