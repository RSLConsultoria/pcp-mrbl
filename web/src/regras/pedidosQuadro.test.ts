import { describe, expect, it } from 'vitest';
import type { EtapaPedido, Pedido } from '../api/tipos';
import type { EstadoEditavel } from './pedidos';
import {
  acaoEditarPedido, estadoDoPedido, historicoDoPedido, motivoTravaEtapa, pedidoAtendeBusca, pedidoEditavel,
  itensQueSairam, itensSelecionados, pedidosForaDasEtapas, podeDarBaixa, qtdOsDoPedido, textoConfirmarBaixa,
  textoContagemFaltas, textoItensQueSairam, vazioDaEtapa
} from './pedidosQuadro';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'b', nome: 'Solicitado', ordem: 2 },
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'c', nome: 'Entregue', ordem: 3 }
];
const it1 = { itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '' };
const it2 = { itemId: 'i2', dealId: '2', os: '90002', nome: 'ZÍPER', un: 'UN', qtd: 5, fornecedor: 'ALFA' };
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'a', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '', responsavel: 'Maria',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [it1, it2], ...o
});

describe('busca, OS e baixa', () => {
  it('busca por id, item, OS e fornecedor, sem acento', () => {
    expect(pedidoAtendeBusca(ped(), 'vies')).toBe(true);
    expect(pedidoAtendeBusca(ped(), '90002')).toBe(true);
    expect(pedidoAtendeBusca(ped(), 'alfa')).toBe(true);
    expect(pedidoAtendeBusca(ped(), 'ped-0044')).toBe(true);
    expect(pedidoAtendeBusca(ped(), 'xyz')).toBe(false);
  });
  it('conta OS distintas', () => {
    expect(qtdOsDoPedido(ped({ itens: [it1, { ...it1, itemId: 'i3' }, it2] }))).toBe(2);
  });
  it('dar baixa só na última etapa e sem baixa anterior', () => {
    expect(podeDarBaixa(ped({ etapa: 'c' }), etapas)).toBe(true);
    expect(podeDarBaixa(ped({ etapa: 'b' }), etapas)).toBe(false);
    expect(podeDarBaixa(ped({ etapa: 'c', baixadoEm: '2026-10-08T10:00:00Z' }), etapas)).toBe(false);
  });
  it('editável: não finalizado e todas as OS liberadas', () => {
    expect(pedidoEditavel({ dealsEditaveis: [] }, ped())).toBe(true);
    expect(pedidoEditavel({ dealsEditaveis: ['1'] }, ped())).toBe(false);
    expect(pedidoEditavel({}, ped({ finalizado: true }))).toBe(false);
  });
});

describe('vazioDaEtapa', () => {
  it('textos por filtro e posição', () => {
    expect(vazioDaEtapa('aberto', 0, 3, false)).toBe('Pedidos gerados a partir das faltas entram aqui.');
    expect(vazioDaEtapa('aberto', 1, 3, false)).toBe('Arraste um pedido para esta etapa.');
    expect(vazioDaEtapa('finalizado', 2, 3, false)).toBe('Nenhum pedido finalizado ainda.');
    expect(vazioDaEtapa('finalizado', 0, 3, false)).toBe('Pedidos finalizados ficam só na última etapa.');
    expect(vazioDaEtapa('todos', 0, 3, true)).toBe('Nenhum pedido desta etapa atende à busca.');
  });
});

describe('acaoEditarPedido', () => {
  const p = ped();
  const antes = estadoDoPedido(p);
  it('nada mudou: null', () => {
    expect(acaoEditarPedido(p, antes, structuredClone(antes))).toBeNull();
  });
  it('só os campos e itens alterados', () => {
    const depois: EstadoEditavel = { ...structuredClone(antes), etapa: 'b', previsao: '2026-10-20' };
    depois.itens[1].qtd = 4;
    expect(acaoEditarPedido(p, antes, depois)).toEqual({
      tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'v1',
      campos: { etapa: 'b', previsao: '2026-10-20' },
      itens: [{ itemId: 'i2', qtd: 4, fornecedor: 'ALFA' }]
    });
  });
  it('sem itens alterados não manda a chave itens', () => {
    const r = acaoEditarPedido(p, antes, { ...antes, quem: 'GAMA' });
    expect(r).toEqual({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'v1', campos: { quem: 'GAMA' } });
  });
});

describe('historicoDoPedido', () => {
  it('pega as linhas que citam o PED, sem repetir, e ignora PED-00440', () => {
    const h = (texto: string, quando = '2026-10-08T10:00:00Z') => ({ quando, usuario: 'Lucca', texto, ploomes: 'ENVIADO' as const });
    const c1 = caixa({ historico: [h('Lucca gerou PED-0044 · 1 item desta OS'), h('Lucca moveu PED-0044 para Solicitado', '2026-10-08T11:00:00Z')] });
    const c2 = caixa({ historico: [h('Lucca moveu PED-0044 para Solicitado', '2026-10-08T11:00:00Z'), h('Lucca gerou PED-00440')] });
    expect(historicoDoPedido([c1, c2], 'PED-0044').map((x) => x.texto)).toEqual([
      'Lucca gerou PED-0044 · 1 item desta OS', 'Lucca moveu PED-0044 para Solicitado'
    ]);
  });
});

describe('motivoTravaEtapa', () => {
  it('etapa com pedido aberto ou quadro com 2 etapas não sai', () => {
    expect(motivoTravaEtapa('a', 4, [ped()])).toBe('Tem 1 pedido aberto nesta etapa');
    expect(motivoTravaEtapa('a', 4, [ped({ finalizado: true })])).toBeNull();
    expect(motivoTravaEtapa(undefined, 2, [])).toBe('O quadro precisa de pelo menos 2 etapas');
    expect(motivoTravaEtapa('z', 3, [ped()])).toBeNull();
  });
});

describe('itensSelecionados', () => {
  it('só as chaves marcadas que ainda estão sem pedido', () => {
    const c1 = caixa({ dealId: '1', itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' })] });
    const c2 = caixa({ id: '2', dealId: '2', itens: [item({ id: 'a' })] });
    const r = itensSelecionados({ geradoEm: '', avisos: [], usuarios: [], caixas: [c1, c2] }, new Set(['1|a', '1|b', '2|a', '9|z']));
    expect(r.map((x) => `${x.caixa.dealId}|${x.item.id}`)).toEqual(['1|a', '2|a']);
  });
});

describe('pedidosForaDasEtapas', () => {
  it('pedido com etapa que saiu do quadro', () => {
    const lista = [ped({ id: '1', etapa: 'a' }), ped({ id: '2', etapa: 'sumiu' }), ped({ id: '3', etapa: 'c', finalizado: true })];
    expect(pedidosForaDasEtapas(lista, etapas).map((p) => p.id)).toEqual(['2']);
    expect(pedidosForaDasEtapas(lista, etapas, (p) => (p.id === '1' ? 'outra' : p.etapa)).map((p) => p.id)).toEqual(['1', '2']);
    expect(pedidosForaDasEtapas(lista, [])).toHaveLength(3);
  });
});

describe('textoConfirmarBaixa', () => {
  it('itens e OS', () => {
    expect(textoConfirmarBaixa(ped())).toBe('Dar baixa de 2 itens em 2 OS? A baixa não pode ser desfeita.');
    expect(textoConfirmarBaixa(ped({ itens: [it1] }))).toBe('Dar baixa de 1 item em 1 OS? A baixa não pode ser desfeita.');
    expect(textoConfirmarBaixa(ped({ itens: [it1, { ...it1, itemId: 'i3' }] }))).toBe('Dar baixa de 2 itens em 1 OS? A baixa não pode ser desfeita.');
  });
});

describe('itensQueSairam', () => {
  const sel = (dealId: string, id: string) => ({ caixa: caixa({ dealId }), item: item({ id }) });
  it('conta só os que sumiram na recarga, não os removidos pelo usuário', () => {
    const iniciais = ['1|a', '1|b', '2|c', '2|d'];
    expect(itensQueSairam(iniciais, [sel('1', 'a'), sel('2', 'c'), sel('2', 'd'), sel('1', 'b')], new Set())).toBe(0);
    expect(itensQueSairam(iniciais, [sel('1', 'a')], new Set(['2|d']))).toBe(2);
  });
  it('texto da nota', () => {
    expect(textoItensQueSairam(0)).toBe('');
    expect(textoItensQueSairam(1)).toBe('1 item saiu da lista porque já está em pedido ou foi resolvido.');
    expect(textoItensQueSairam(2)).toBe('2 itens saíram da lista porque já estão em pedido ou foram resolvidos.');
  });
});

describe('textoContagemFaltas', () => {
  it('sem marcados mostra o total visível', () => {
    expect(textoContagemFaltas(1, 0, 0)).toBe('1 item');
    expect(textoContagemFaltas(5, 0, 0)).toBe('5 itens');
  });
  it('marcados contam todos e avisam os que a busca esconde', () => {
    expect(textoContagemFaltas(5, 1, 1)).toBe('1 selecionado');
    expect(textoContagemFaltas(5, 3, 3)).toBe('3 selecionados');
    expect(textoContagemFaltas(2, 3, 1)).toBe('3 selecionados (2 fora da busca)');
    expect(textoContagemFaltas(0, 1, 0)).toBe('1 selecionado (1 fora da busca)');
  });
});
