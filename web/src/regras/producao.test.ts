import { describe, expect, it } from 'vitest';
import type { Producao } from '../api/tipos';
import { filtrarProducoes, indicadoresProducao, janelaGantt, modeloMensagemProducao, prazoProducao, statusProducao, validarMudancaProducao } from './producao';

const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA MODELO',
  inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
  pecas: 120, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1',
  faltasCostura: [], mensagens: [], sugestoes: [], historico: [], ...extra
});

describe('prazo e status da producao', () => {
  it('prefere a combinada e cai no lead time', () => {
    expect(prazoProducao(prod())).toEqual({ data: '2026-10-20', origem: 'COMBINADA' });
    expect(prazoProducao(prod({ dataCombinada: '' }))).toEqual({ data: '2026-10-18', origem: 'LEAD_TIME' });
    expect(prazoProducao(prod({ dataCombinada: '', leadTime: '' }))).toEqual({ data: '', origem: 'SEM_PRAZO' });
  });

  it('classifica atrasado, hoje, proximo e sem prazo sem usar o fuso do navegador', () => {
    expect(statusProducao(prod({ dataCombinada: '2026-10-12' }), '2026-10-13').status).toBe('ATRASADO');
    expect(statusProducao(prod({ dataCombinada: '2026-10-13' }), '2026-10-13').status).toBe('HOJE');
    expect(statusProducao(prod({ dataCombinada: '2026-10-16' }), '2026-10-13').status).toBe('PROXIMO');
    expect(statusProducao(prod({ dataCombinada: '', leadTime: '' }), '2026-10-13').status).toBe('SEM_PRAZO');
  });
});

it('filtra por texto sem acento, oficina e falta na costura', () => {
  const lista = [
    prod({ dealId: '1', oficinaId: '', oficina: 'ALOCAR', cliente: 'Árvore', faltasCostura: [{ id: 'f1', nome: 'VIÉS', un: 'MT', status: 'ABERTO', resta: 2 } as never] }),
    prod({ dealId: '2', os: '90002', oficinaId: 'of-2', oficina: 'OFICINA BETA', referencia: 'AZ-2' })
  ];
  expect(filtrarProducoes(lista, { busca: 'arvore', oficinaId: '', soComFalta: true }).map((p) => p.dealId)).toEqual(['1']);
  expect(filtrarProducoes(lista, { busca: 'az-2', oficinaId: 'of-2', soComFalta: false }).map((p) => p.dealId)).toEqual(['2']);
});

it('calcula os quatro indicadores sem duplicar oficinas', () => {
  const lista = [
    prod({ dealId: '1', oficinaId: 'a', pecas: 100, dataCombinada: '2026-10-10', faltasCostura: [{ id: 'f' } as never] }),
    prod({ dealId: '2', oficinaId: 'a', pecas: 50, dataCombinada: '' }),
    prod({ dealId: '3', oficinaId: '', oficina: 'ALOCAR', pecas: null, dataCombinada: '', leadTime: '' })
  ];
  expect(indicadoresProducao(lista, '2026-10-13')).toEqual({ os: 3, pecas: 150, oficinas: 1, caixasComFalta: 1, itensEmFalta: 1, atrasadas: 1, semCombinada: 2 });
});

it('janela do Gantt inclui datas e respeita o limite de 180 dias', () => {
  expect(janelaGantt([prod({ inicioCostura: '2026-09-01', dataCombinada: '2026-11-30' })], '2026-10-13')).toEqual({ inicio: '2026-09-01', fim: '2026-11-30', dias: 91 });
  const longa = janelaGantt([prod({ inicioCostura: '2025-01-01', dataCombinada: '2027-12-31' })], '2026-10-13');
  expect(longa.dias).toBe(180);
  expect(longa.inicio <= '2026-10-13' && longa.fim >= '2026-10-13').toBe(true);
});

it('mudanca de data exige motivo; mudar somente oficina nao', () => {
  expect(validarMudancaProducao(prod(), { oficinaId: 'of-1', dataCombinada: '2026-10-22', motivo: '' })).toBe('Informe o motivo da alteração da data combinada.');
  expect(validarMudancaProducao(prod(), { oficinaId: 'of-2', dataCombinada: '2026-10-20', motivo: '' })).toBeNull();
  expect(validarMudancaProducao(prod(), { oficinaId: 'of-1', dataCombinada: '2026-10-20', motivo: '' })).toBe('Nada alterado.');
});

it('modelos de mensagem sempre identificam a OS e podem ser editados antes da fila', () => {
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod(), '2026-10-21')).toContain('*OS 90001*');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod(), '2026-10-21')).toContain('estava prevista para 20/10');
  expect(modeloMensagemProducao('CONFIRMAR_DATA', prod(), '2026-10-13')).toContain('120 peças');
  expect(modeloMensagemProducao('MATERIAL_ENVIADO', prod(), '2026-10-13')).toContain('material que faltava');
});
