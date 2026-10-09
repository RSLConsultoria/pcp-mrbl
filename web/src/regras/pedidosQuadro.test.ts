import { describe, expect, it } from 'vitest';
import type { EtapaPedido, Pedido } from '../api/tipos';
import type { EstadoEditavel } from './pedidos';
import {
  acaoEditarPedido, camposAlterados, comAlterados, estadoDoPedido, historicoDoPedido, motivoTravaEtapa, pedidoAtendeBusca, pedidoEditavel,
  itensQueSairam, itensSelecionados, pedidosForaDasEtapas, qtdOsDoPedido,
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
    expect(vazioDaEtapa('finalizado', 0, 3, false)).toBe('Pedidos finalizados ficam na última etapa.');
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

  // O servidor grava uma linha por OS para a mesma ação (mesmo instante e usuário). No painel
  // do pedido isso parecia repetição: vira uma entrada só, com a lista de OS.
  const h = (texto: string, ploomes: 'ENVIADO' | 'PENDENTE' | 'ERRO' = 'ENVIADO', quando = '2026-10-08T11:00:00Z') => ({ quando, usuario: 'Lucca', texto, ploomes });
  const c1 = (historico: ReturnType<typeof h>[]) => caixa({ os: '90001', historico });
  const c4 = (historico: ReturnType<typeof h>[]) => caixa({ id: '600004', dealId: '600004', os: '90004', historico });

  it('a mesma ação em 2 OS aparece uma vez, com as 2 OS', () => {
    const t = 'Lucca moveu PED-0044 para Solicitado';
    expect(historicoDoPedido([c1([h(t)]), c4([h(t, 'PENDENTE')])], 'PED-0044')).toEqual([
      { quando: '2026-10-08T11:00:00Z', usuario: 'Lucca', texto: t, ploomes: 'PENDENTE', os: ['90001', '90004'] }
    ]);
  });

  it('a edição com mudança de item só numa OS junta o que é do pedido e o que é do item', () => {
    const base = 'Lucca alterou PED-0044: Local: São Paulo → Cliente, Responsável: Renata → Cesar';
    const r = historicoDoPedido([c1([h(base)]), c4([h(`${base}, previsão de TECIDO: 15/10 → 30/10`)])], 'PED-0044');
    expect(r.map((x) => [x.texto, x.os])).toEqual([[`${base}, previsão de TECIDO: 15/10 → 30/10`, ['90001', '90004']]]);
  });

  it('a baixa por OS junta as listas depois de "deu baixa:"', () => {
    const r = historicoDoPedido([
      c1([h('Lucca moveu PED-0044 para Resolvido e deu baixa: 20 MT de VIÉS (resta 0 MT)')]),
      c4([h('Lucca moveu PED-0044 para Resolvido e deu baixa: 5 UN de ZÍPER (resta 0 UN)')])
    ], 'PED-0044');
    expect(r.map((x) => [x.texto, x.os])).toEqual([
      ['Lucca moveu PED-0044 para Resolvido e deu baixa: 20 MT de VIÉS (resta 0 MT); 5 UN de ZÍPER (resta 0 UN)', ['90001', '90004']]
    ]);
  });

  it('textos que não se juntam bem ficam separados, cada um com a sua OS; instantes diferentes também', () => {
    const r = historicoDoPedido([
      c1([h('Lucca gerou PED-0044 · 2 itens desta OS · Fornecedor BETA')]),
      c4([h('Lucca gerou PED-0044 · 1 item desta OS · Fornecedor BETA'), h('Lucca moveu PED-0044 para Solicitado', 'ENVIADO', '2026-10-08T12:00:00Z')])
    ], 'PED-0044');
    expect(r.map((x) => [x.texto, x.os])).toEqual([
      ['Lucca gerou PED-0044 · 2 itens desta OS · Fornecedor BETA', ['90001']],
      ['Lucca gerou PED-0044 · 1 item desta OS · Fornecedor BETA', ['90004']],
      ['Lucca moveu PED-0044 para Solicitado', ['90004']]
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

describe('formulário do painel sobre o pedido atual', () => {
  const base = { etapa: 'a', quem: 'BETA', responsavel: 'Maria' };
  it('guarda só o que o usuário mudou', () => {
    expect(camposAlterados(base, { ...base, responsavel: 'Lucca' })).toEqual({ responsavel: 'Lucca' });
    expect(camposAlterados(base, base)).toEqual({});
  });
  it('voltar ao valor do pedido deixa de contar como alterado', () => {
    const alt = camposAlterados(base, { ...base, etapa: 'b' });
    expect(camposAlterados(base, { ...comAlterados(base, alt), etapa: 'a' })).toEqual({});
  });
  it('o pedido mudou por fora (arraste): o formulário acompanha nos campos não mexidos', () => {
    const alt = camposAlterados(base, { ...base, responsavel: 'Lucca' });
    const depoisDoArraste = { ...base, etapa: 'c' };
    expect(comAlterados(depoisDoArraste, alt)).toEqual({ etapa: 'c', quem: 'BETA', responsavel: 'Lucca' });
  });
  it('salvar a partir do formulário refeito não manda a etapa antiga de volta', () => {
    const p = ped({ etapa: 'a' });
    const alt = camposAlterados(estadoDoPedido(p), { ...estadoDoPedido(p), responsavel: 'Lucca' });
    const movido = ped({ etapa: 'c' });
    const atual = estadoDoPedido(movido);
    const acao = acaoEditarPedido(movido, atual, comAlterados(atual, alt));
    expect(acao).toEqual({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'v1', campos: { responsavel: 'Lucca' } });
  });
});
