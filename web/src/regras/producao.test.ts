import { describe, expect, it } from 'vitest';
import type { Producao } from '../api/tipos';
import { chaveEnvioWhatsapp, filtrarProducoes, indicadoresProducao, janelaGantt, modeloMensagemProducao, prazoProducao, resumoFaltasAviamentos, statusProducao, validarMudancaProducao } from './producao';

const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA MODELO',
  inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
  pecas: 120, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1',
  faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...extra
});

it('resume o alerta de aviamentos de costura e acabamento', () => {
  expect(resumoFaltasAviamentos(prod())).toEqual({ total: 0, costura: 0, acabamento: 0, textoCostura: '', textoAcabamento: '' });
  expect(resumoFaltasAviamentos(prod({ faltasCostura: [{ id: 'c1' } as never] })))
    .toEqual({ total: 1, costura: 1, acabamento: 0, textoCostura: '1 aviamento faltando na costura; impede finalizar a costura', textoAcabamento: '' });
  expect(resumoFaltasAviamentos(prod({ faltasCostura: [{ id: 'c1' } as never], faltasAcabamento: [{ id: 'a1' } as never, { id: 'a2' } as never] })))
    .toEqual({ total: 3, costura: 1, acabamento: 2, textoCostura: '1 aviamento faltando na costura; impede finalizar a costura', textoAcabamento: '2 aviamentos faltando no acabamento; precisam estar prontos para a etapa seguinte' });
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

it('modelos de mensagem citam a peça em negrito, sem o número da OS, com o mesmo texto do servidor', () => {
  const p = prod({ peca: 'PECA TESTE B', pecas: 160, dataCombinada: '2026-10-20' });
  expect(modeloMensagemProducao('COBRANCA_PRAZO', p, '2026-10-13'))
    .toBe('Bom dia. A entrega de *PECA TESTE B*, 160 peças, está prevista para 20/10. Segue dentro do prazo?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', p, '2026-10-21'))
    .toBe('Bom dia. A entrega de *PECA TESTE B*, 160 peças, estava prevista para 20/10. Qual a nova data de entrega?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: 160, dataCombinada: '', leadTime: '' }), '2026-10-13'))
    .toBe('Bom dia. Qual a previsão de entrega de *PECA TESTE B*, 160 peças?');
  expect(modeloMensagemProducao('CONFIRMAR_DATA', p, '2026-10-13'))
    .toBe('Bom dia. Confirmando a entrega de *PECA TESTE B*, 160 peças, para 20/10. Segue combinado?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: null, dataCombinada: '2026-10-20' }), '2026-10-13'))
    .toBe('Bom dia. A entrega de *PECA TESTE B* está prevista para 20/10. Segue dentro do prazo?');
  expect(modeloMensagemProducao('CONFIRMAR_DATA', prod({ pecas: 1 }), '2026-10-13')).toContain(', 1 peça, para');
  expect(modeloMensagemProducao('CONFIRMAR_DATA', prod({ pecas: 1600 }), '2026-10-13')).toContain('1.600 peças');
  for (const tipo of ['COBRANCA_PRAZO', 'CONFIRMAR_DATA'] as const) expect(modeloMensagemProducao(tipo, p, '2026-10-13')).not.toMatch(/90001|OS /);
});

it('gera uma chave de envio por clique no formato que o servidor aceita', () => {
  const a = chaveEnvioWhatsapp();
  const b = chaveEnvioWhatsapp();
  expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  expect(a).not.toBe(b);
});
