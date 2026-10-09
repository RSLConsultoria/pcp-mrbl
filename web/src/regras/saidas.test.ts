import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import {
  chaveDaSaida, colunaDoPedido, colunasSaida, diasDesdeSaida, itensParaPedido, nomeColunaSaida, parteEntregue, partesDaSaida, rotuloDaSaida,
  saidasNaTela, seloSaidaVermelho, textoPedidoDoItem, textoPedidosDaParte, textoSaiu
} from './saidas';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'fim', nome: 'Concluído', ordem: 5 }, { id: 'a', nome: 'A pedir', ordem: 1 }, { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ag', nome: 'Aguardando entrega', ordem: 3 }, { id: 'ent', nome: 'Enviado ao destino final', ordem: 4 }
];
const pi = (itemId: string, qtd: number): ItemPedido => ({ itemId, dealId: '600001', os: '90001', nome: itemId, un: 'UN', qtd, fornecedor: '' });
const ped = (id: string, etapa: string, itens: ItemPedido[], o: Partial<Pedido> = {}): Pedido => ({
  id, pai: '', etapa, origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: '', finalizado: false, itens, ...o
});
const saiu = (o = {}) => caixa({ saiu: true, saiuComFalta: true, saiuEm: '2026-10-01', ...o });

describe('colunasSaida', () => {
  it('Sem pedido (opcional) e as etapas do quadro, na ordem; cores pela posição', () => {
    const cols = colunasSaida(etapas, true);
    expect(cols.map((c) => c.nome)).toEqual(['Sem pedido', 'A pedir', 'Solicitado', 'Aguardando entrega', 'Enviado ao destino final', 'Concluído']);
    expect(cols.map((c) => c.cor)).toEqual(['var(--erro-text)', 'var(--falta)', 'var(--falta)', 'var(--falta)', 'var(--navy)', 'var(--success)']);
    expect(colunasSaida(etapas, false).map((c) => c.id)).toEqual(['etapa:a', 'etapa:sol', 'etapa:ag', 'etapa:ent', 'etapa:fim']);
  });
  it('nome da coluna', () => {
    expect(nomeColunaSaida('sem_pedido', etapas)).toBe('Sem pedido');
    expect(nomeColunaSaida('etapa:ent', etapas)).toBe('Enviado ao destino final');
    expect(nomeColunaSaida('etapa:x', etapas)).toBe('Outra etapa');
  });
});

describe('colunaDoPedido', () => {
  it('aberto na etapa dele; etapa que saiu do quadro conta como a primeira; com baixa na da baixa; finalizado na final', () => {
    expect(colunaDoPedido(ped('P', 'sol', []), etapas)).toBe('etapa:sol');
    expect(colunaDoPedido(ped('P', 'sumiu', []), etapas)).toBe('etapa:a');
    expect(colunaDoPedido(ped('P', 'ag', [], { baixadoEm: '2026-10-05' }), etapas)).toBe('etapa:ent');
    expect(colunaDoPedido(ped('P', 'fim', [], { baixadoEm: '2026-10-05', finalizado: true }), etapas)).toBe('etapa:fim');
    expect(colunaDoPedido(ped('P', 'sol', []), [])).toBeNull();
  });
});

describe('partesDaSaida', () => {
  it('uma parte por coluna, cada uma só com os itens daquela etapa, na ordem das colunas', () => {
    const c = saiu({ itens: [
      item({ id: 'a', nome: 'VIÉS', resta: 10 }),
      item({ id: 'b', nome: 'BOTÃO', pedidoId: 'PED-0001' }),
      item({ id: 'c', nome: 'ZÍPER', status: 'RESOLVIDO', resta: 0, baixada: 52 })
    ] });
    const pedidos = [ped('PED-0001', 'sol', [pi('b', 30)]), ped('PED-0002', 'ent', [pi('c', 52)], { baixadoEm: '2026-10-05' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.indice, p.total, p.itens.map((x) => [x.item.id, x.pedidoIds, x.qtd])])).toEqual([
      ['sem_pedido', 1, 3, [['a', [], 10]]],
      ['etapa:sol', 2, 3, [['b', ['PED-0001'], 30]]],
      ['etapa:ent', 3, 3, [['c', ['PED-0002'], 52]]]
    ]);
  });
  it('item em pedidos de etapas diferentes (pedido dividido) aparece nas duas partes, com a quantidade de cada uma', () => {
    const c = saiu({ itens: [item({ id: 'z', baixada: 20, resta: 32, pedidoId: 'PED-0003', pedidoIds: ['PED-0003'] })] });
    const pedidos = [ped('PED-0003', 'ag', [pi('z', 32)]), ped('PED-0003.1', 'ent', [pi('z', 20)], { pai: 'PED-0003', baixadoEm: '2026-10-06' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.itens.map((x) => x.qtd)])).toEqual([['etapa:ag', [32]], ['etapa:ent', [20]]]);
  });
  it('resto aberto de um pedido com baixa: a parte da baixa e o resto em Sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'z', baixada: 20, resta: 32 })] });
    const pedidos = [ped('PED-0004', 'ent', [pi('z', 20)], { baixadoEm: '2026-10-06' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.itens[0].qtd])).toEqual([['sem_pedido', 32], ['etapa:ent', 20]]);
  });
  it('item fechado sem pedido vai para a etapa final; pedido que o board não trouxe conta como a primeira etapa', () => {
    const c = saiu({ itens: [item({ id: 'r', status: 'RESOLVIDO', resta: 0, baixada: 52 }), item({ id: 'p', pedidoId: 'PED-0009' })] });
    expect(partesDaSaida(c, [], etapas).map((p) => [p.coluna, p.itens.map((x) => [x.item.id, x.pedidoIds])])).toEqual([
      ['etapa:a', [['p', ['PED-0009']]]], ['etapa:fim', [['r', []]]]
    ]);
  });
  it('item de mesmo id em pedido de outra caixa não entra', () => {
    const c = saiu({ itens: [item({ id: 'b', resta: 5 })] });
    const pedidos = [ped('PED-0001', 'sol', [{ ...pi('b', 5), dealId: '999' }])];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => p.coluna)).toEqual(['sem_pedido']);
  });
});

describe('parteEntregue', () => {
  it('"material entregue no destino" só quando a parte tem pedido (item fechado sem pedido não conta)', () => {
    const fechado = saiu({ itens: [item({ id: 'c', status: 'RESOLVIDO', resta: 0, baixada: 5 })] });
    const [semPedido] = partesDaSaida(fechado, [], etapas);
    expect(semPedido.coluna).toBe('etapa:fim');
    expect(parteEntregue(semPedido)).toBe(false);
    const c = saiu({ itens: [item({ id: 'b', status: 'RESOLVIDO', resta: 0, baixada: 5 })] });
    const [comPedido] = partesDaSaida(c, [ped('PED-0001', 'fim', [pi('b', 5)], { baixadoEm: 'x', concluidoEm: 'y', finalizado: true })], etapas);
    expect(comPedido.coluna).toBe('etapa:fim');
    expect(parteEntregue(comPedido)).toBe(true);
  });
});

describe('saidasNaTela', () => {
  const hoje = new Date(2026, 9, 9);
  const board = (caixas: Board['caixas'], pedidos: Pedido[] = []): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas, pedidos, etapasPedido: etapas });
  it('só caixas que saíram com falta', () => {
    const r = saidasNaTela(board([saiu({ id: '1' }), caixa({ id: '2' }), caixa({ id: '3', saiu: true })]), hoje);
    expect(r.map((x) => x.caixa.id)).toEqual(['1']);
  });
  it('parte em Concluído some com mais de 30 dias sem atividade (29 x 31); as outras partes se renumeram', () => {
    const fechado = (id: string, saiuEm: string) => saiu({ id, saiuEm, itens: [item({ id: 'r', status: 'RESOLVIDO', resta: 0, baixada: 52 }), item({ id: 'a' })] });
    const r = saidasNaTela(board([fechado('c29', '2026-09-10'), fechado('c31', '2026-09-08')]), hoje);
    expect(r.map((x) => [x.caixa.id, x.parte.coluna, x.parte.indice, x.parte.total])).toEqual([
      ['c29', 'sem_pedido', 1, 2], ['c29', 'etapa:fim', 2, 2], ['c31', 'sem_pedido', 1, 1]
    ]);
  });
  it('a conclusão do pedido conta como atividade', () => {
    const c = saiu({ id: 'p', saiuEm: '2026-08-01', itens: [item({ id: 'z', status: 'RESOLVIDO', resta: 0, baixada: 52 })] });
    const fim = ped('PED-0005', 'fim', [pi('z', 52)], { baixadoEm: '2026-08-02', finalizado: true, concluidoEm: '2026-10-01' });
    expect(saidasNaTela(board([c], [fim]), hoje).map((x) => x.parte.coluna)).toEqual(['etapa:fim']);
    expect(saidasNaTela(board([c], [{ ...fim, concluidoEm: '2026-08-03' }]), hoje)).toEqual([]);
  });
  it('rótulo "90001 · 1 de 2" só com mais de uma parte; chave por caixa e coluna', () => {
    const [um] = saidasNaTela(board([saiu()]), hoje);
    expect(rotuloDaSaida(um)).toBe('90001');
    expect(chaveDaSaida(um)).toBe('600001|sem_pedido');
    const duas = saidasNaTela(board([saiu({ itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' })] })], [ped('PED-0001', 'sol', [pi('b', 52)])]), hoje);
    expect(duas.map(rotuloDaSaida)).toEqual(['90001 · 1 de 2', '90001 · 2 de 2']);
  });
});

describe('textos e selos', () => {
  const hoje = new Date(2026, 9, 8);
  it('pedidos da parte, pedido do item, saída e selo vermelho a partir de 7 dias', () => {
    expect(textoPedidosDaParte({ pedidoIds: ['PED-0001', 'PED-0001.1'] })).toBe('PED-0001, PED-0001.1');
    expect(textoPedidosDaParte({ pedidoIds: [] })).toBe('sem pedido');
    expect(textoPedidosDaParte({ pedidoIds: ['novo:3'] })).toBe('Novo pedido');
    expect(textoPedidoDoItem(item({ pedidoId: 'PED-0001' }), [ped('PED-0001', 'sol', [])], etapas)).toBe('PED-0001 · Solicitado');
    expect(textoSaiu({ saiuEm: '2026-09-18' }, new Date(2026, 9, 7))).toBe('saiu 18/09 · há 19 dias');
    expect(diasDesdeSaida({ saiuEm: '2026-10-01' }, hoje)).toBe(7);
    expect(diasDesdeSaida({ saiuEm: '' }, hoje)).toBeNull();
    expect(seloSaidaVermelho(6)).toBe(false);
    expect(seloSaidaVermelho(7)).toBe(true);
    expect(seloSaidaVermelho(null)).toBe(false);
  });
  it('itens para pedido: abertos, editáveis e sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' }), item({ id: 'c', editavel: false }), item({ id: 'd', status: 'RESOLVIDO', resta: 0 }), item({ id: 'e', resta: null })] });
    expect(itensParaPedido(c).map((i) => i.id)).toEqual(['a']);
  });
});
