import { describe, expect, it } from 'vitest';
import type { Producao } from '../api/tipos';
import { agruparPorOficina, ordenarPorEntrega, chaveEnvioWhatsapp, filtrarProducoes, indicadoresProducao, opcoesAssociacaoMensagem, janelaGantt, intervaloBarraProducao, modeloMensagemProducao, prazoProducao, reais, resumoFaltasAviamentos, situacaoPrazo, statusProducao, textoBarraProducao, tituloBarraPrevista, tituloBarraProducao, totaisProducao, validarMudancaProducao } from './producao';

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
    .toBe('Olá. A entrega de *PECA TESTE B*, 160 peças, está prevista para 20/10. Segue dentro do prazo?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', p, '2026-10-21'))
    .toBe('Olá. A entrega de *PECA TESTE B*, 160 peças, estava prevista para 20/10. Qual a nova data de entrega?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: 160, dataCombinada: '', leadTime: '' }), '2026-10-13'))
    .toBe('Olá. Qual a previsão de entrega de *PECA TESTE B*, 160 peças?');
  expect(modeloMensagemProducao('CONFIRMAR_DATA', p, '2026-10-13'))
    .toBe('Olá. Confirmando a entrega de *PECA TESTE B*, 160 peças, para 20/10. Segue combinado?');
  expect(modeloMensagemProducao('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: null, dataCombinada: '2026-10-20' }), '2026-10-13'))
    .toBe('Olá. A entrega de *PECA TESTE B* está prevista para 20/10. Segue dentro do prazo?');
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

describe('situação do prazo (filtro geral do Gantt e da tabela)', () => {
  it('agrupa o status do Gantt em quatro situações com texto e dias', () => {
    expect(situacaoPrazo(prod({ dataCombinada: '2026-10-10' }), '2026-10-13')).toEqual({ situacao: 'ATRASADA', dias: -3, texto: 'Atrasada · 3 dias' });
    expect(situacaoPrazo(prod({ dataCombinada: '2026-10-12' }), '2026-10-13').texto).toBe('Atrasada · 1 dia');
    expect(situacaoPrazo(prod({ dataCombinada: '2026-10-13' }), '2026-10-13')).toEqual({ situacao: 'EM_BREVE', dias: 0, texto: 'Vence em breve · hoje' });
    expect(situacaoPrazo(prod({ dataCombinada: '2026-10-15' }), '2026-10-13').texto).toBe('Vence em breve · 2 dias');
    expect(situacaoPrazo(prod({ dataCombinada: '2026-10-20' }), '2026-10-13')).toEqual({ situacao: 'NO_PRAZO', dias: 7, texto: 'No prazo · 7 dias' });
    expect(situacaoPrazo(prod({ dataCombinada: '', leadTime: '' }), '2026-10-13')).toEqual({ situacao: 'SEM_PRAZO', dias: null, texto: 'Sem prazo' });
  });

  it('filtra pela situação quando informada com o dia de hoje', () => {
    const lista = [
      prod({ dealId: 'a', dataCombinada: '2026-10-10' }),
      prod({ dealId: 'b', dataCombinada: '2026-10-14' }),
      prod({ dealId: 'c', dataCombinada: '2026-10-30' }),
      prod({ dealId: 'd', dataCombinada: '', leadTime: '' })
    ];
    const base = { busca: '', oficinaId: '', soComFalta: false, hoje: '2026-10-13' };
    expect(filtrarProducoes(lista, { ...base, situacao: 'ATRASADA' }).map((p) => p.dealId)).toEqual(['a']);
    expect(filtrarProducoes(lista, { ...base, situacao: 'EM_BREVE' }).map((p) => p.dealId)).toEqual(['b']);
    expect(filtrarProducoes(lista, { ...base, situacao: 'NO_PRAZO' }).map((p) => p.dealId)).toEqual(['c']);
    expect(filtrarProducoes(lista, { ...base, situacao: 'SEM_PRAZO' }).map((p) => p.dealId)).toEqual(['d']);
    expect(filtrarProducoes(lista, { ...base, situacao: '' })).toHaveLength(4);
  });
});

it('agrupa por oficina na ordem em que chegam, como o Gantt mostra', () => {
  const lista = [
    prod({ dealId: '1', oficina: 'ALOCAR' }), prod({ dealId: '2', oficina: 'BETA' }),
    prod({ dealId: '3', oficina: 'ALFA' }), prod({ dealId: '4', oficina: 'BETA' })
  ];
  expect(agruparPorOficina(lista).map(([o, itens]) => [o, itens.map((p) => p.dealId)]))
    .toEqual([['ALOCAR', ['1']], ['BETA', ['2', '4']], ['ALFA', ['3']]]);
});

describe('texto da barra do Gantt: peças e valor do corte', () => {
  it('mostra peças e valor sem centavos, ou só o que houver', () => {
    expect(textoBarraProducao(prod({ pecas: 160, valorCorte: 12345.4 }))).toBe('160 pç · R$ 12.345');
    expect(textoBarraProducao(prod({ pecas: 1600, valorCorte: null }))).toBe('1.600 pç');
    expect(textoBarraProducao(prod({ pecas: null, valorCorte: 999.6 }))).toBe('R$ 1.000');
    expect(textoBarraProducao(prod({ pecas: null, valorCorte: undefined }))).toBe('');
  });

  it('o título da barra traz OS, prazo, peças e valor', () => {
    expect(tituloBarraProducao(prod({ os: '90001', dataCombinada: '2026-10-05', pecas: 80, valorCorte: 4500 }))).toBe('OS 90001 · 05/10 · 80 pç · R$ 4.500');
    expect(tituloBarraProducao(prod({ os: '90001', dataCombinada: '2026-10-05', pecas: null, valorCorte: null }))).toBe('OS 90001 · 05/10');
  });

  it('formata reais sem centavos e soma peças e valor das OS', () => {
    expect(reais(1234567.89)).toBe('R$ 1.234.568');
    expect(totaisProducao([prod({ pecas: 100, valorCorte: 1000 }), prod({ pecas: null, valorCorte: 500.5 }), prod({ pecas: 20, valorCorte: null })]))
      .toEqual({ os: 3, pecas: 120, valor: 1500.5, previstas: 0, pecasPrevistas: 0 });
  });

  it('totais ficam só com a Costura; as previstas aparecem à parte', () => {
    expect(totaisProducao([prod({ pecas: 100, valorCorte: 1000 }), prod({ prevista: true, pecas: 50, valorCorte: 700 }), prod({ prevista: true, pecas: null })]))
      .toEqual({ os: 1, pecas: 100, valor: 1000, previstas: 2, pecasPrevistas: 50 });
  });
});

it('ordem de entrega: prazo vigente mais cedo primeiro, empate por OS e sem prazo no fim', () => {
  const lista = [
    prod({ dealId: 'a', os: '90010', dataCombinada: '', leadTime: '' }),
    prod({ dealId: 'b', os: '90005', dataCombinada: '2026-10-15' }),
    prod({ dealId: 'c', os: '90003', dataCombinada: '', leadTime: '2026-10-12' }),
    prod({ dealId: 'd', os: '90004', dataCombinada: '2026-10-15' }),
    prod({ dealId: 'e', os: '90001', dataCombinada: '', leadTime: '' }),
    prod({ dealId: 'f', os: '900100', dataCombinada: '2026-10-15' })
  ];
  expect(ordenarPorEntrega(lista).map((p) => p.dealId)).toEqual(['c', 'd', 'b', 'f', 'e', 'a']);
  // Não altera a lista recebida.
  expect(lista[0].dealId).toBe('a');
});

it('ordem de entrega: a OS prevista entra pelo fim previsto da Costura', () => {
  const lista = [
    prod({ dealId: 'a', os: '90010', dataCombinada: '2026-10-30' }),
    prod({ dealId: 'p1', os: '90020', prevista: true, dataCombinada: '', leadTime: '', fimCosturaPrevisto: '2026-10-20' }),
    prod({ dealId: 'p2', os: '90021', prevista: true, dataCombinada: '', leadTime: '', fimCosturaPrevisto: '' }),
    prod({ dealId: 'b', os: '90005', dataCombinada: '2026-10-25' })
  ];
  expect(ordenarPorEntrega(lista).map((p) => p.dealId)).toEqual(['p1', 'b', 'a', 'p2']);
});

describe('OS previstas (19/10)', () => {
  const prevista = prod({
    dealId: '710015', os: '10015', prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1',
    inicioCostura: '', dataCombinada: '', leadTime: '', inicioCosturaPrevisto: '2026-10-21', fimCosturaPrevisto: '2026-12-20', pecas: 80, valorCorte: null
  });
  it('ficam fora sem "Incluir previstas" e entram com ele', () => {
    const base = { busca: '', oficinaId: '', soComFalta: false };
    expect(filtrarProducoes([prod(), prevista], base).map((p) => p.dealId)).toEqual(['700001']);
    expect(filtrarProducoes([prod(), prevista], { ...base, incluirPrevistas: true }).map((p) => p.dealId)).toEqual(['700001', '710015']);
  });
  it('não entram nos indicadores da Costura', () => {
    expect(indicadoresProducao([prod(), prevista], '2026-10-13')).toMatchObject({ os: 1, pecas: 120 });
    expect(indicadoresProducao([prod(), prevista], '2026-10-13').semCombinada).toBe(0);
  });
  it('a janela do Gantt vai até o fim previsto', () => {
    expect(janelaGantt([prod({ inicioCostura: '2026-10-01', dataCombinada: '2026-10-20' }), prevista], '2026-10-13').fim).toBe('2026-12-20');
  });
  it('título da barra tracejada', () => {
    expect(tituloBarraPrevista(prevista)).toBe('OS 10015 · prevista · 15. Preparação 1 · 21/10 a 20/12 · 80 pç');
    expect(tituloBarraPrevista({ ...prevista, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' })).toBe('OS 10015 · prevista · 15. Preparação 1 · sem previsão · 80 pç');
  });
  it('a associação manual de mensagem não oferece OS previstas', () => {
    const real = prod({ dealId: '700002' });
    const prevDaOficina = { ...prevista, oficinaId: 'of-1' };
    expect(opcoesAssociacaoMensagem([real, prevDaOficina], 'of-1', undefined).map((p) => p.dealId)).toEqual(['700002']);
    expect(opcoesAssociacaoMensagem([real, prevDaOficina], 'of-1', ['700002']).map((p) => p.dealId)).toEqual(['700002']);
    expect(opcoesAssociacaoMensagem([real, prod({ dealId: '700003', oficinaId: 'of-2' })], 'of-1', ['999']).map((p) => p.dealId)).toEqual([]);
  });
});

describe('intervalo da barra no Gantt', () => {
  const hoje = '2026-10-22';
  it('no prazo: do início da costura até o prazo', () => {
    expect(intervaloBarraProducao(prod({ inicioCostura: '2026-10-10', dataCombinada: '2026-10-30' }), hoje)).toEqual({ inicio: '2026-10-10', fim: '2026-10-30' });
  });
  it('atrasada: a barra vai até hoje, para o atraso aparecer', () => {
    expect(intervaloBarraProducao(prod({ inicioCostura: '2026-10-01', dataCombinada: '2026-10-15' }), hoje)).toEqual({ inicio: '2026-10-01', fim: hoje });
  });
  it('entrou na costura com o prazo já vencido: do início até hoje, não um pontinho', () => {
    expect(intervaloBarraProducao(prod({ inicioCostura: '2026-10-21', dataCombinada: '', leadTime: '2026-10-16' }), hoje)).toEqual({ inicio: '2026-10-21', fim: hoje });
  });
  it('sem início: marco no prazo; sem prazo: sem barra', () => {
    expect(intervaloBarraProducao(prod({ inicioCostura: '', dataCombinada: '2026-10-15' }), hoje)).toEqual({ inicio: '2026-10-15', fim: '2026-10-15' });
    expect(intervaloBarraProducao(prod({ dataCombinada: '', leadTime: '' }), hoje)).toBeNull();
  });
});
