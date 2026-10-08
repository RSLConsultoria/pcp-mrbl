import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, Pedido } from '../api/tipos';
import { caixasDeSaida, colunaSaida, saidasComColuna, diasDesdeSaida, itensParaPedido, seloSaidaVermelho, textoParcial, textoPedidoDoItem, textoSaiu, textoTratativa } from './saidas';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'a', nome: 'A', ordem: 1 },
  { id: 'z', nome: 'Z', ordem: 2 }
];
const ped = (id: string, etapa: string): Pedido => ({
  id, pai: '', etapa, origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: '', finalizado: false, itens: []
});
const saiu = (o = {}) => caixa({ saiu: true, saiuComFalta: true, saiuEm: '2026-10-01', ...o });

describe('colunaSaida', () => {
  it('sem itens abertos: resolvido, mesmo com tratativa enviada', () => {
    const c = saiu({ tratativa: 'ENVIADO', itens: [item({ status: 'RESOLVIDO', resta: 0 })] });
    expect(colunaSaida(c, [], etapas)).toEqual({ coluna: 'resolvido' });
  });
  it('tratativa ENVIADO: enviado', () => {
    const c = saiu({ tratativa: 'ENVIADO', itens: [item({ pedidoId: 'PED-0001' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z')], etapas).coluna).toBe('enviado');
  });
  it('item aberto sem pedido: sem tratativa, sem selo parcial quando nenhum tem pedido', () => {
    expect(colunaSaida(saiu(), [], etapas)).toEqual({ coluna: 'sem_tratativa' });
  });
  it('parcial: N de M com pedido', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b' }), item({ id: 'c' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'a')], etapas)).toEqual({ coluna: 'sem_tratativa', parcial: { com: 1, total: 3 } });
  });
  it('todos na última etapa: almoxarifado; senão aguardando', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', pedidoId: 'PED-0002' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0002', 'z')], etapas).coluna).toBe('almoxarifado');
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0002', 'a')], etapas).coluna).toBe('aguardando');
  });
  it('ignora itens resolvidos ao olhar os pedidos', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', status: 'RESOLVIDO', resta: 0 })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z')], etapas).coluna).toBe('almoxarifado');
  });
});

describe('caixasDeSaida', () => {
  const hoje = new Date(2026, 9, 8);
  const resolvida = (extra = {}) => saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })], ...extra });
  const board = (caixas: Board['caixas']): Board => ({ geradoEm: '', caixas, avisos: [], usuarios: [] });

  it('só saiu com falta', () => {
    const lista = caixasDeSaida(board([saiu({ id: '1' }), caixa({ id: '2' }), caixa({ id: '3', saiu: true })]), hoje);
    expect(lista.map((c) => c.id)).toEqual(['1']);
  });
  it('resolvido some 30 dias depois da saída ou da última ação', () => {
    const velha = resolvida({ id: 'v', saiuEm: '2026-08-01' });
    const recente = resolvida({ id: 'r', saiuEm: '2026-09-20' });
    const comHist = resolvida({
      id: 'h', saiuEm: '2026-08-01',
      historico: [{ quando: '2026-10-05T10:00:00Z', usuario: 'x', texto: 't', ploomes: 'ENVIADO' }]
    });
    expect(caixasDeSaida(board([velha, recente, comHist]), hoje).map((c) => c.id)).toEqual(['r', 'h']);
  });
  it('saidasComColuna traz a coluna junto', () => {
    const r = saidasComColuna(board([saiu({ id: '1' }), resolvida({ id: 'r', saiuEm: '2026-09-20' })]), hoje);
    expect(r.map((x) => [x.caixa.id, x.coluna.coluna])).toEqual([['1', 'sem_tratativa'], ['r', 'resolvido']]);
  });
});

describe('selo de dias', () => {
  const hoje = new Date(2026, 9, 8);
  it('diasDesdeSaida e vermelho a partir de 7', () => {
    expect(diasDesdeSaida({ saiuEm: '2026-10-01' }, hoje)).toBe(7);
    expect(diasDesdeSaida({ saiuEm: '' }, hoje)).toBeNull();
    expect(seloSaidaVermelho(6)).toBe(false);
    expect(seloSaidaVermelho(7)).toBe(true);
    expect(seloSaidaVermelho(null)).toBe(false);
  });
});

describe('textos de Saídas', () => {
  it('pedido do item, saída, parcial e tratativa', () => {
    expect(textoPedidoDoItem(item({ pedidoId: 'PED-0001' }), [ped('PED-0001', 'z')], etapas)).toBe('PED-0001 · Z');
    expect(textoPedidoDoItem(item(), [], etapas)).toBe('sem pedido');
    expect(textoSaiu({ saiuEm: '2026-09-18' }, new Date(2026, 9, 7))).toBe('saiu 18/09 · há 19 dias');
    expect(textoParcial({ com: 1, total: 3 })).toBe('parcial · 1 de 3 com pedido');
    expect(textoTratativa({ tratativa: 'ENVIADO', tratativaEm: '2026-10-05' })).toBe('Enviado à oficina em 05/10');
    expect(textoTratativa({ tratativa: '', tratativaEm: '' })).toBe('Ainda não enviado à oficina');
  });
  it('itens para pedido: abertos, editáveis e sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' }), item({ id: 'c', editavel: false }), item({ id: 'd', status: 'RESOLVIDO', resta: 0 }), item({ id: 'e', resta: null })] });
    expect(itensParaPedido(c).map((i) => i.id)).toEqual(['a']);
  });
});
