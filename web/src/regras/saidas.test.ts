import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, Pedido } from '../api/tipos';
import {
  caixasDeSaida, colunaSaida, colunasSaida, nomeColunaSaida, podeEnviarOficina, saidasComColuna, diasDesdeSaida, itensParaPedido,
  seloSaidaVermelho, textoEnviarSoNaUltima, textoParcial, textoPedidoDoItem, textoSaiu, textoTratativa
} from './saidas';
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
  const tres: EtapaPedido[] = [
    { id: 'z', nome: 'Z', ordem: 3 },
    { id: 'a', nome: 'A', ordem: 1 },
    { id: 'm', nome: 'M', ordem: 2 }
  ];
  it('sem itens abertos: resolvido até ir à oficina; enviado e concluído pela tratativa', () => {
    const c = saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })] });
    expect(colunaSaida(c, [], etapas)).toEqual({ coluna: 'resolvido' });
    expect(colunaSaida({ ...c, tratativa: 'ENVIADO' }, [], etapas)).toEqual({ coluna: 'enviado' });
    expect(colunaSaida({ ...c, tratativa: 'RECEBIDO' }, [], etapas)).toEqual({ coluna: 'concluido' });
  });
  it('tratativa ENVIADO: enviado', () => {
    const c = saiu({ tratativa: 'ENVIADO', itens: [item({ pedidoId: 'PED-0001' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z')], etapas).coluna).toBe('enviado');
  });
  it('item aberto sem pedido: sem pedido, sem selo parcial quando nenhum tem pedido', () => {
    expect(colunaSaida(saiu(), [], etapas)).toEqual({ coluna: 'sem_pedido' });
  });
  it('parcial: N de M com pedido, ainda em sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b' }), item({ id: 'c' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'a')], etapas)).toEqual({ coluna: 'sem_pedido', parcial: { com: 1, total: 3 } });
  });
  it('todos com pedido: a etapa do pedido mais atrasado (pela ordem)', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', pedidoId: 'PED-0002' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0002', 'z')], tres)).toEqual({ coluna: 'resolvido' });
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0002', 'm')], tres)).toEqual({ coluna: 'etapa:m', etapasDiferentes: true });
    expect(colunaSaida(c, [ped('PED-0001', 'a'), ped('PED-0002', 'm')], tres).coluna).toBe('etapa:a');
  });
  it('pedido dividido: a parte mais atrasada segura a caixa', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001', pedidoIds: ['PED-0001', 'PED-0001.1'] })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0001.1', 'm')], tres)).toEqual({ coluna: 'etapa:m', etapasDiferentes: true });
  });
  it('etapa que não existe mais conta como a primeira', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', pedidoId: 'PED-0002' })] });
    expect(colunaSaida(c, [ped('PED-0001', 'z'), ped('PED-0002', 'sumiu')], tres)).toEqual({ coluna: 'etapa:a', etapasDiferentes: true });
  });
  it('ignora itens resolvidos ao olhar os pedidos', () => {
    const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', status: 'RESOLVIDO', resta: 0 })] });
    expect(colunaSaida(c, [ped('PED-0001', 'a')], etapas).coluna).toBe('etapa:a');
    expect(colunaSaida(c, [ped('PED-0001', 'z')], etapas).coluna).toBe('resolvido');
  });
});

describe('colunasSaida', () => {
  const tres: EtapaPedido[] = [{ id: 'z', nome: 'Entregue', ordem: 3 }, { id: 'a', nome: 'A pedir', ordem: 1 }, { id: 'm', nome: 'Solicitado', ordem: 2 }];
  it('etapas do quadro na ordem (a última vira a coluna Resolvido), entre Sem pedido (opcional) e Enviado/Concluído', () => {
    expect(colunasSaida(tres, true).map((c) => c.nome)).toEqual(['Sem pedido', 'A pedir', 'Solicitado', 'Entregue', 'Enviado à oficina', 'Concluído']);
    expect(colunasSaida(tres, false).map((c) => c.id)).toEqual(['etapa:a', 'etapa:m', 'resolvido', 'enviado', 'concluido']);
    expect(colunasSaida(tres, true)[0].cor).toBe('var(--erro-text)');
  });
  it('nome da coluna', () => {
    expect(nomeColunaSaida('etapa:m', tres)).toBe('Solicitado');
    expect(nomeColunaSaida('etapa:x', tres)).toBe('Outra etapa');
    expect(nomeColunaSaida('sem_pedido', tres)).toBe('Sem pedido');
    expect(nomeColunaSaida('enviado', tres)).toBe('Enviado à oficina');
  });
});

describe('podeEnviarOficina', () => {
  const c = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', pedidoId: 'PED-0002', pedidoIds: ['PED-0002', 'PED-0002.1'] })] });
  it('só com todos os pedidos abertos de todos os itens abertos na última etapa', () => {
    expect(podeEnviarOficina(c, [ped('PED-0001', 'z'), ped('PED-0002', 'z'), ped('PED-0002.1', 'z')], etapas)).toBe(true);
    expect(podeEnviarOficina(c, [ped('PED-0001', 'z'), ped('PED-0002', 'z'), ped('PED-0002.1', 'a')], etapas)).toBe(false);
    expect(podeEnviarOficina(c, [ped('PED-0001', 'z'), ped('PED-0002', 'z'), ped('PED-0002.1', 'sumiu')], etapas)).toBe(false);
  });
  it('item sem pedido trava; item resolvido não conta; tudo baixado pode ir', () => {
    const sem = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b' })] });
    expect(podeEnviarOficina(sem, [ped('PED-0001', 'z')], etapas)).toBe(false);
    const res = saiu({ itens: [item({ id: 'a', pedidoId: 'PED-0001' }), item({ id: 'b', status: 'RESOLVIDO', resta: 0 })] });
    expect(podeEnviarOficina(res, [ped('PED-0001', 'z')], etapas)).toBe(true);
    expect(podeEnviarOficina(res, [ped('PED-0001', 'z')], [])).toBe(false);
    expect(podeEnviarOficina(saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })] }), [], [])).toBe(true);
  });
  it('texto da regra', () => {
    expect(textoEnviarSoNaUltima(etapas)).toBe('Para enviar à oficina, todo o material precisa estar na última etapa (Z).');
  });
});

describe('caixasDeSaida', () => {
  const hoje = new Date(2026, 9, 8);
  const resolvida = (extra = {}) => saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })], tratativa: 'RECEBIDO', ...extra });
  const board = (caixas: Board['caixas']): Board => ({ geradoEm: '', caixas, avisos: [], usuarios: [] });

  it('só saiu com falta', () => {
    const lista = caixasDeSaida(board([saiu({ id: '1' }), caixa({ id: '2' }), caixa({ id: '3', saiu: true })]), hoje);
    expect(lista.map((c) => c.id)).toEqual(['1']);
  });
  it('concluído some 30 dias depois da saída ou da última ação', () => {
    const velha = resolvida({ id: 'v', saiuEm: '2026-08-01' });
    const recente = resolvida({ id: 'r', saiuEm: '2026-09-20' });
    const comHist = resolvida({
      id: 'h', saiuEm: '2026-08-01',
      historico: [{ quando: '2026-10-05T10:00:00Z', usuario: 'x', texto: 't', ploomes: 'ENVIADO' }]
    });
    expect(caixasDeSaida(board([velha, recente, comHist]), hoje).map((c) => c.id)).toEqual(['r', 'h']);
  });
  it('resolvido sem tratativa: some com mais de 30 dias de atividade (29 vs 31)', () => {
    const sem = (extra = {}) => saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0, resolvidoEm: '2026-08-01' })], ...extra });
    const a29 = sem({ id: 'a29', saiuEm: '2026-09-09' });
    const a31 = sem({ id: 'a31', saiuEm: '2026-09-07' });
    const baixaRecente = sem({ id: 'b', saiuEm: '2026-08-01', itens: [item({ status: 'RESOLVIDO', resta: 0, resolvidoEm: '2026-09-09' })] });
    const hist = sem({ id: 'h', saiuEm: '2026-08-01', historico: [{ quando: '2026-09-09T10:00:00Z', usuario: 'x', texto: 't', ploomes: 'ENVIADO' }] });
    expect(caixasDeSaida(board([a29, a31, baixaRecente, hist]), hoje).map((c) => c.id)).toEqual(['a29', 'b', 'h']);
  });
  it('item aberto coberto por pedido na última etapa: sempre aparece, mesmo antiga', () => {
    const c = saiu({ id: 'o', saiuEm: '2026-06-01', itens: [item({ pedidoId: 'PED-0001' })] });
    const b = { ...board([c]), pedidos: [ped('PED-0001', 'z')], etapasPedido: etapas };
    const r = saidasComColuna(b, hoje);
    expect(r.map((x) => [x.caixa.id, x.coluna.coluna])).toEqual([['o', 'resolvido']]);
  });
  it('saidasComColuna traz a coluna junto', () => {
    const r = saidasComColuna(board([saiu({ id: '1' }), resolvida({ id: 'r', saiuEm: '2026-09-20' })]), hoje);
    expect(r.map((x) => [x.caixa.id, x.coluna.coluna])).toEqual([['1', 'sem_pedido'], ['r', 'concluido']]);
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
    expect(textoPedidoDoItem(item({ pedidoId: 'PED-0001' }), [ped('PED-0001', 'sumiu')], etapas)).toBe('PED-0001 · Outra etapa');
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
