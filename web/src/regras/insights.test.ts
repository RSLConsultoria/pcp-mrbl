// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MensagemProducao, Producao } from '../api/tipos';
import { caixa, item } from './teste-util';
import {
  caixasParadas, cobrancasSemResposta, insightsDoDia, lerInsightsAbertos, oficinasComAtraso, prazosEstourando,
  resumoInsights, salvarInsightsAbertos
} from './insights';

const HOJE = '2026-10-27';
const AGORA = new Date('2026-10-27T15:00:00.000Z');

const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'OF-1', oficina: 'OFICINA MODELO',
  inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '', pecas: 100, cliente: 'CLIENTE FICTICIO',
  peca: 'CAMISA TESTE', referencia: 'REF-1', versao: 'v1', faltasCostura: [], faltasAcabamento: [],
  mensagens: [], sugestoes: [], historico: [], ...extra
});

const msg = (extra: Partial<MensagemProducao> = {}): MensagemProducao => ({
  id: 'M1', quando: '2026-10-25T12:00:00.000Z', participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Olá.',
  associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO', ...extra
});

describe('prazo estourando', () => {
  it('entra o prazo vencido e o que vence em até 3 dias; 4 dias fica fora', () => {
    const lista = prazosEstourando([
      prod({ os: '1', dataCombinada: '2026-10-30' }),
      prod({ os: '2', dataCombinada: '2026-10-31' }),
      prod({ os: '3', dataCombinada: '2026-10-27' }),
      prod({ os: '4', dataCombinada: '2026-10-25' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.dias, l.texto])).toEqual([
      ['4', -2, 'venceu há 2 dias'], ['3', 0, 'vence hoje'], ['1', 3, 'vence em 3 dias']
    ]);
  });

  it('usa o lead time sem data combinada e ignora OS sem prazo', () => {
    const lista = prazosEstourando([
      prod({ os: '1', dataCombinada: '', leadTime: '2026-10-26' }),
      prod({ os: '2', dataCombinada: '', leadTime: '' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.texto])).toEqual([['1', 'venceu há 1 dia']]);
  });

  it('deixa as previstas de fora e mantém ALOCAR', () => {
    const lista = prazosEstourando([
      prod({ os: '1', dataCombinada: '2026-10-20', prevista: true }),
      prod({ os: '2', dataCombinada: '2026-10-28', oficinaId: '', oficina: 'ALOCAR' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.oficina, l.texto])).toEqual([['2', 'ALOCAR', 'vence em 1 dia']]);
  });

  it('desempata pela OS', () => {
    const lista = prazosEstourando([
      prod({ os: '90010', dataCombinada: '2026-10-25' }), prod({ os: '90002', dataCombinada: '2026-10-25' })
    ], HOJE);
    expect(lista.map((l) => l.os)).toEqual(['90002', '90010']);
  });

  it('traz peça e oficina', () => {
    expect(prazosEstourando([prod({ dataCombinada: '2026-10-27' })], HOJE)[0])
      .toMatchObject({ os: '90001', peca: 'CAMISA TESTE', oficina: 'OFICINA MODELO' });
  });
});

describe('caixas paradas', () => {
  it('entra a caixa registrada há 7 dias ou mais; 6 dias fica fora', () => {
    const lista = caixasParadas([
      caixa({ id: 'a', os: '1', registradoEm: '2026-10-20' }),
      caixa({ id: 'b', os: '2', registradoEm: '2026-10-21' }),
      caixa({ id: 'c', os: '3', registradoEm: '2026-10-10T10:00:00.000Z' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.dias, l.texto])).toEqual([['3', 17, 'parada há 17 dias'], ['1', 7, 'parada há 7 dias']]);
  });

  it('só caixa com falta aberta que não saiu', () => {
    const lista = caixasParadas([
      caixa({ id: 'a', os: '1', registradoEm: '2026-10-01', itens: [item({ resta: 0 }), item({ id: 'i2', resta: null, falta: null })] }),
      caixa({ id: 'b', os: '2', registradoEm: '2026-10-01', saiu: true, saiuComFalta: true }),
      caixa({ id: 'c', os: '3', registradoEm: '2026-10-01', itens: [item({ resta: 0 }), item({ id: 'i2', resta: 4 }), item({ id: 'i3', resta: 2 })] }),
      caixa({ id: 'd', os: '4', registradoEm: '' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.itensAbertos, l.itens])).toEqual([['3', 2, '2 itens em aberto']]);
  });

  it('mostra o tipo da caixa e desempata pela OS e pelo tipo', () => {
    const lista = caixasParadas([
      caixa({ id: 'a', os: '90002', tipo: 'COSTURA', registradoEm: '2026-10-01' }),
      caixa({ id: 'b', os: '90001', tipo: 'COSTURA', registradoEm: '2026-10-01' }),
      caixa({ id: 'c', os: '90001', tipo: 'ACABAMENTO', registradoEm: '2026-10-01' })
    ], HOJE);
    expect(lista.map((l) => [l.os, l.tipo, l.itens])).toEqual([
      ['90001', 'Acabamento', '1 item em aberto'], ['90001', 'Costura', '1 item em aberto'], ['90002', 'Costura', '1 item em aberto']
    ]);
  });
});

describe('oficinas com mais atraso', () => {
  it('soma os dias de atraso só das vencidas e ordena pela soma', () => {
    const lista = oficinasComAtraso([
      prod({ os: '1', oficinaId: 'A', oficina: 'OFICINA A', dataCombinada: '2026-10-26' }),
      prod({ os: '2', oficinaId: 'A', oficina: 'OFICINA A', dataCombinada: '2026-10-24' }),
      prod({ os: '3', oficinaId: 'A', oficina: 'OFICINA A', dataCombinada: '2026-10-27' }),
      prod({ os: '4', oficinaId: 'B', oficina: 'OFICINA B', dataCombinada: '2026-10-17' })
    ], HOJE);
    expect(lista.map((l) => [l.oficinaId, l.os, l.dias, l.texto])).toEqual([
      ['B', 1, 10, '1 OS atrasada · 10 dias somados'], ['A', 2, 4, '2 OS atrasadas · 4 dias somados']
    ]);
  });

  it('deixa ALOCAR, OS sem oficina e previstas de fora', () => {
    const lista = oficinasComAtraso([
      prod({ os: '1', oficinaId: '', oficina: 'ALOCAR', dataCombinada: '2026-10-01' }),
      prod({ os: '2', oficinaId: 'X', oficina: 'Alocar', dataCombinada: '2026-10-01' }),
      prod({ os: '3', oficinaId: '', oficina: '', dataCombinada: '2026-10-01' }),
      prod({ os: '4', oficinaId: 'A', oficina: 'OFICINA A', dataCombinada: '2026-10-01', prevista: true }),
      prod({ os: '5', oficinaId: 'B', oficina: 'OFICINA B', dataCombinada: '2026-10-26' })
    ], HOJE);
    expect(lista.map((l) => [l.oficinaId, l.texto])).toEqual([['B', '1 OS atrasada · 1 dia somado']]);
  });

  it('fica no top 5 e desempata pelo número de OS e pelo nome', () => {
    const lista = oficinasComAtraso([
      ...['F', 'E', 'D', 'C'].map((o, i) => prod({ os: `1${i}`, oficinaId: o, oficina: `OFICINA ${o}`, dataCombinada: '2026-10-25' })),
      prod({ os: '20', oficinaId: 'B', oficina: 'OFICINA B', dataCombinada: '2026-10-26' }),
      prod({ os: '21', oficinaId: 'B', oficina: 'OFICINA B', dataCombinada: '2026-10-26' }),
      prod({ os: '30', oficinaId: 'A', oficina: 'OFICINA A', dataCombinada: '2026-10-26' })
    ], HOJE);
    expect(lista.map((l) => l.oficinaId)).toEqual(['B', 'C', 'D', 'E', 'F']);
  });
});

describe('cobrança sem resposta', () => {
  it('última mensagem enviada há mais de 24 h entra; 24 h exatas fica fora', () => {
    const lista = cobrancasSemResposta([
      prod({ os: '1', mensagens: [msg({ quando: '2026-10-26T15:00:00.000Z' })] }),
      prod({ os: '2', mensagens: [msg({ quando: '2026-10-26T14:59:00.000Z' })] })
    ], AGORA);
    expect(lista.map((l) => [l.os, l.texto])).toEqual([['2', 'sem resposta há 24 horas']]);
  });

  it('mostra dias a partir de 48 h e põe quem espera há mais tempo primeiro', () => {
    const lista = cobrancasSemResposta([
      prod({ os: '1', mensagens: [msg({ quando: '2026-10-25T10:00:00.000Z' })] }),
      prod({ os: '2', mensagens: [msg({ quando: '2026-10-22T15:00:00.000Z' })] }),
      prod({ os: '3', mensagens: [msg({ quando: '2026-10-26T01:00:00.000Z' })] })
    ], AGORA);
    expect(lista.map((l) => [l.os, l.texto])).toEqual([
      ['2', 'sem resposta há 5 dias'], ['1', 'sem resposta há 2 dias'], ['3', 'sem resposta há 38 horas']
    ]);
  });

  it('resposta depois da cobrança, envio pendente ou com erro ficam fora', () => {
    const lista = cobrancasSemResposta([
      prod({ os: '1', mensagens: [msg({ id: 'b', direcao: 'RECEBIDA', statusEnvio: '', quando: '2026-10-25T13:00:00.000Z' }), msg({ id: 'a' })] }),
      prod({ os: '2', mensagens: [msg({ statusEnvio: 'PENDENTE' })] }),
      prod({ os: '3', mensagens: [msg({ statusEnvio: 'ERRO' })] }),
      prod({ os: '4', mensagens: [] })
    ], AGORA);
    expect(lista).toEqual([]);
  });

  it('cobrança depois da resposta entra, em qualquer ordem da lista', () => {
    const lista = cobrancasSemResposta([
      prod({ os: '1', mensagens: [msg({ id: 'a', quando: '2026-10-25T12:00:00.000Z' }), msg({ id: 'b', direcao: 'RECEBIDA', statusEnvio: '', quando: '2026-10-24T12:00:00.000Z' })] })
    ], AGORA);
    expect(lista.map((l) => [l.os, l.peca, l.oficina])).toEqual([['1', 'CAMISA TESTE', 'OFICINA MODELO']]);
  });

  it('pergunta do associador não é cobrança; previstas ficam fora', () => {
    const lista = cobrancasSemResposta([
      prod({ os: '1', mensagens: [msg({ pergunta: true })] }),
      prod({ os: '2', prevista: true, mensagens: [msg()] })
    ], AGORA);
    expect(lista).toEqual([]);
  });

  it('desempata pela OS', () => {
    const lista = cobrancasSemResposta([prod({ os: '90009', mensagens: [msg()] }), prod({ os: '90003', mensagens: [msg()] })], AGORA);
    expect(lista.map((l) => l.os)).toEqual(['90003', '90009']);
  });
});

describe('insights do dia e resumo', () => {
  it('junta os quatro cartões a partir do board, usando o dia local', () => {
    const board = {
      geradoEm: '', avisos: [], usuarios: [],
      caixas: [caixa({ registradoEm: '2026-10-01' })],
      producao: [prod({ os: '90002', dataCombinada: '2026-10-25', mensagens: [msg()] })]
    };
    const ins = insightsDoDia(board, new Date(2026, 9, 27, 9, 0));
    expect([ins.prazos.length, ins.caixas.length, ins.oficinas.length, ins.cobrancas.length]).toEqual([1, 1, 1, 1]);
    expect(resumoInsights(ins)).toBe('1 prazo estourando · 1 caixa parada · 1 oficina com atraso · 1 cobrança sem resposta');
  });

  it('resumo só com o que tem itens, no plural, e frase de nada pendente', () => {
    const vazio = { prazos: [], caixas: [], oficinas: [], cobrancas: [] };
    expect(resumoInsights(vazio)).toBe('Nada pedindo atenção hoje.');
    const ins = insightsDoDia({ geradoEm: '', avisos: [], usuarios: [], caixas: [
      caixa({ id: 'a', registradoEm: '2026-10-01' }), caixa({ id: 'b', registradoEm: '2026-10-01' })
    ] }, new Date(2026, 9, 27, 9, 0));
    expect(resumoInsights(ins)).toBe('2 caixas paradas');
  });
});

describe('faixa aberta ou recolhida', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('começa recolhida e lembra a escolha', () => {
    expect(lerInsightsAbertos()).toBe(false);
    salvarInsightsAbertos(true);
    expect(lerInsightsAbertos()).toBe(true);
    salvarInsightsAbertos(false);
    expect(lerInsightsAbertos()).toBe(false);
  });

  it('sem acesso ao armazenamento fica recolhida e não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerInsightsAbertos()).toBe(false);
    expect(() => salvarInsightsAbertos(true)).not.toThrow();
  });
});
