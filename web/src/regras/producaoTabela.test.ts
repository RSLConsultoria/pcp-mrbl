// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Producao } from '../api/tipos';
import {
  COLUNAS_PRODUCAO, colunasVisiveis, dataBr, filtrarLinhas, lerColunasOcultas, lerVisao, linhasTabela,
  ordenarLinhas, proximaOrdem, salvarColunasOcultas, salvarVisao, temFiltroColuna
} from './producaoTabela';

const HOJE = '2026-10-13';
const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA MODELO',
  inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
  pecas: 120, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1',
  faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...extra
});
const ids = (linhas: { item: Producao }[]) => linhas.map((l) => l.item.dealId);

it('formata datas em dd/mm/aaaa', () => {
  expect(dataBr('2026-10-05')).toBe('05/10/2026');
  expect(dataBr('')).toBe('');
});

describe('linhas da tabela', () => {
  it('monta os valores exibidos de cada coluna', () => {
    const [l] = linhasTabela([prod({
      dataCombinada: '', leadTime: '2026-10-10',
      faltasCostura: [{ id: 'c' } as never], faltasAcabamento: [{ id: 'a' } as never, { id: 'b' } as never],
      sugestoes: [{ id: 's', status: 'PENDENTE' } as never]
    })], HOJE);
    expect(l.valores.os.exibir).toBe('90001');
    expect(l.valores.pecas.exibir).toBe('120');
    expect(l.valores.inicio.exibir).toBe('01/10/2026');
    expect(l.valores.combinada.exibir).toBe('');
    expect(l.valores.leadTime.exibir).toBe('10/10/2026');
    expect(l.valores.prazo.exibir).toBe('10/10/2026');
    expect(l.valores.situacao).toMatchObject({ exibir: 'Atrasada · 3 dias', filtro: 'ATRASADA' });
    expect(l.valores.faltasCostura.exibir).toBe('🚫 1');
    expect(l.valores.faltasAcabamento.exibir).toBe('⚠️ 2');
    expect(l.valores.sugestao.exibir).toBe('Sim');
  });

  it('mostra traço quando não há falta nem sugestão pendente', () => {
    const [l] = linhasTabela([prod({ sugestoes: [{ id: 's', status: 'ACEITA' } as never] })], HOJE);
    expect(l.valores.faltasCostura.exibir).toBe('—');
    expect(l.valores.faltasAcabamento.exibir).toBe('—');
    expect(l.valores.sugestao.exibir).toBe('—');
  });
});

describe('ordenação', () => {
  const lista = [
    prod({ dealId: 'a', os: '90010', cliente: 'Ébano', dataCombinada: '2026-10-20', pecas: 50 }),
    prod({ dealId: 'b', os: '90002', cliente: 'abacaxi', dataCombinada: '', pecas: 300 }),
    prod({ dealId: 'c', os: '90003', cliente: 'Zebra', dataCombinada: '2026-10-15', pecas: null })
  ];
  const linhas = linhasTabela(lista, HOJE);

  it('sem ordem escolhida mantém a ordem recebida (a do Gantt)', () => {
    expect(ids(ordenarLinhas(linhas, null))).toEqual(['a', 'b', 'c']);
  });

  it('datas vazias ficam no fim nas duas direções', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'combinada', direcao: 'asc' }))).toEqual(['c', 'a', 'b']);
    expect(ids(ordenarLinhas(linhas, { coluna: 'combinada', direcao: 'desc' }))).toEqual(['a', 'c', 'b']);
  });

  it('números como número e vazios no fim', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'pecas', direcao: 'asc' }))).toEqual(['a', 'b', 'c']);
    expect(ids(ordenarLinhas(linhas, { coluna: 'pecas', direcao: 'desc' }))).toEqual(['b', 'a', 'c']);
    expect(ids(ordenarLinhas(linhas, { coluna: 'os', direcao: 'asc' }))).toEqual(['b', 'c', 'a']);
  });

  it('textos em pt-BR ignorando acentos e maiúsculas', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'cliente', direcao: 'asc' }))).toEqual(['b', 'a', 'c']);
    expect(ids(ordenarLinhas(linhas, { coluna: 'cliente', direcao: 'desc' }))).toEqual(['c', 'a', 'b']);
  });

  it('situação ordena pelos dias até o prazo, sem prazo no fim', () => {
    const l = linhasTabela([prod({ dealId: 'x', dataCombinada: '', leadTime: '' }), prod({ dealId: 'y', dataCombinada: '2026-10-11' }), prod({ dealId: 'z', dataCombinada: '2026-10-14' })], HOJE);
    expect(ids(ordenarLinhas(l, { coluna: 'situacao', direcao: 'asc' }))).toEqual(['y', 'z', 'x']);
    expect(ids(ordenarLinhas(l, { coluna: 'situacao', direcao: 'desc' }))).toEqual(['z', 'y', 'x']);
  });

  it('clique alterna entre crescente e decrescente; outra coluna recomeça crescente', () => {
    expect(proximaOrdem(null, 'os')).toEqual({ coluna: 'os', direcao: 'asc' });
    expect(proximaOrdem({ coluna: 'os', direcao: 'asc' }, 'os')).toEqual({ coluna: 'os', direcao: 'desc' });
    expect(proximaOrdem({ coluna: 'os', direcao: 'desc' }, 'os')).toEqual({ coluna: 'os', direcao: 'asc' });
    expect(proximaOrdem({ coluna: 'os', direcao: 'desc' }, 'cliente')).toEqual({ coluna: 'cliente', direcao: 'asc' });
  });
});

describe('filtro por coluna', () => {
  const linhas = linhasTabela([
    prod({ dealId: 'a', peca: 'CAMISA ÁGUA', oficina: 'ALOCAR', dataCombinada: '2026-10-05' }),
    prod({ dealId: 'b', peca: 'Calça teste', oficina: 'OFICINA MODELO', dataCombinada: '2026-10-30' })
  ], HOJE);

  it('texto contém sem acento e sem diferenciar maiúsculas', () => {
    expect(ids(filtrarLinhas(linhas, { peca: 'agua' }))).toEqual(['a']);
    expect(ids(filtrarLinhas(linhas, { peca: 'CALCA' }))).toEqual(['b']);
    expect(ids(filtrarLinhas(linhas, { peca: '  ' }))).toEqual(['a', 'b']);
  });

  it('datas e números pelo valor exibido', () => {
    expect(ids(filtrarLinhas(linhas, { combinada: '30/10' }))).toEqual(['b']);
  });

  it('oficina e situação por seleção exata', () => {
    expect(ids(filtrarLinhas(linhas, { oficina: 'ALOCAR' }))).toEqual(['a']);
    expect(ids(filtrarLinhas(linhas, { situacao: 'NO_PRAZO' }))).toEqual(['b']);
    expect(ids(filtrarLinhas(linhas, { situacao: 'ATRASADA', peca: 'camisa' }))).toEqual(['a']);
  });

  it('sabe se há algum filtro preenchido', () => {
    expect(temFiltroColuna({})).toBe(false);
    expect(temFiltroColuna({ peca: ' ' })).toBe(false);
    expect(temFiltroColuna({ situacao: 'ATRASADA' })).toBe(true);
  });
});

describe('colunas visíveis', () => {
  it('esconde as escolhidas, mas a OS fica sempre', () => {
    const visiveis = colunasVisiveis(['cliente', 'os']).map((c) => c.id);
    expect(visiveis).not.toContain('cliente');
    expect(visiveis[0]).toBe('os');
    expect(visiveis).toHaveLength(COLUNAS_PRODUCAO.length - 1);
  });
});

describe('preferências lembradas no navegador', () => {
  beforeEach(() => localStorage.clear());

  it('visão padrão é o Gantt e a escolha fica gravada', () => {
    expect(lerVisao()).toBe('GANTT');
    salvarVisao('TABELA');
    expect(lerVisao()).toBe('TABELA');
    localStorage.setItem('pcp-mrbl.producao.visao', 'OUTRA');
    expect(lerVisao()).toBe('GANTT');
  });

  it('colunas ocultas ignoram lixo e colunas desconhecidas', () => {
    expect(lerColunasOcultas()).toEqual([]);
    salvarColunasOcultas(['cliente', 'pecas']);
    expect(lerColunasOcultas()).toEqual(['cliente', 'pecas']);
    localStorage.setItem('pcp-mrbl.producao.colunasOcultas', '["cliente","nao-existe","os"]');
    expect(lerColunasOcultas()).toEqual(['cliente']);
    localStorage.setItem('pcp-mrbl.producao.colunasOcultas', '{quebrado');
    expect(lerColunasOcultas()).toEqual([]);
  });
});
