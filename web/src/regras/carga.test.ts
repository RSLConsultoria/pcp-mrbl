import { describe, expect, it } from 'vitest';
import type { OficinaProducao, Producao } from '../api/tipos';
import { corCarga, diasUteis, intervaloCostura, lerCapacidade, montarCarga, segundaDaSemana, semanasCarga, textoCelula } from './carga';

// Quarta-feira, 21/10/2026: a semana atual começa na segunda 19/10.
const HOJE = '2026-10-21';
const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A',
  inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 100, cliente: 'CLIENTE FICTICIO',
  peca: 'PECA TESTE', referencia: 'REF', versao: 'v1', faltasCostura: [], faltasAcabamento: [],
  mensagens: [], sugestoes: [], historico: [], ...extra
});
const oficina = (ploomesId: string, nome: string, capacidadeSemana: number | null): OficinaProducao =>
  ({ ploomesId, nome, grupoConfigurado: false, grupoNome: '', capacidadeSemana });

describe('semanas e dias úteis', () => {
  it('semana de segunda a domingo, da atual até 8 à frente', () => {
    expect(segundaDaSemana('2026-10-21')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19');
    const s = semanasCarga(HOJE);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ inicio: '2026-10-19', fim: '2026-10-25', rotulo: '19/10' });
    expect(s[8].inicio).toBe('2026-12-14');
  });
  it('dias úteis de segunda a sexta, inclusive', () => {
    expect(diasUteis('2026-10-23', '2026-10-26')).toEqual(['2026-10-23', '2026-10-26']);
    expect(diasUteis('2026-10-24', '2026-10-25')).toEqual([]);
  });
});

describe('intervalo da costura', () => {
  it('prevista: da chegada prevista ao fim previsto; sem datas fica fora', () => {
    expect(intervaloCostura(prod({ prevista: true, inicioCosturaPrevisto: '2026-10-28', fimCosturaPrevisto: '2026-11-03' }), HOJE))
      .toEqual({ inicio: '2026-10-28', fim: '2026-11-03' });
    expect(intervaloCostura(prod({ prevista: true, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' }), HOJE)).toBeNull();
  });
  it('real: início (ou hoje) até o prazo vigente; vencido conta até hoje; sem prazo fica fora', () => {
    expect(intervaloCostura(prod({ inicioCostura: '2026-10-19', dataCombinada: '2026-10-30' }), HOJE)).toEqual({ inicio: '2026-10-19', fim: '2026-10-30' });
    expect(intervaloCostura(prod({ dataCombinada: '', leadTime: '2026-10-30' }), HOJE)).toEqual({ inicio: HOJE, fim: '2026-10-30' });
    expect(intervaloCostura(prod({ inicioCostura: '2026-10-01', leadTime: '2026-10-15' }), HOJE)).toEqual({ inicio: '2026-10-01', fim: HOJE });
    expect(intervaloCostura(prod({ inicioCostura: '2026-11-10', dataCombinada: '2026-11-05' }), HOJE)).toEqual({ inicio: '2026-11-05', fim: '2026-11-05' });
    expect(intervaloCostura(prod(), HOJE)).toBeNull();
  });
});

describe('cor e texto da célula', () => {
  it('até 80% verde, até 100% amarelo, acima vermelho; sem capacidade sem alerta', () => {
    expect(corCarga(80, 100)).toBe('VERDE');
    expect(corCarga(81, 100)).toBe('AMARELO');
    expect(corCarga(100, 100)).toBe('AMARELO');
    expect(corCarga(101, 100)).toBe('VERMELHO');
    expect(corCarga(500, null)).toBe('SEM_CAPACIDADE');
    expect(corCarga(0, 0)).toBe('VERDE');
    expect(corCarga(1, 0)).toBe('VERMELHO');
  });
  it('"peças / capacidade", ou só as peças', () => {
    expect(textoCelula({ pecas: 1235.6, capacidade: 1500 })).toBe('1.236 / 1.500');
    expect(textoCelula({ pecas: 12, capacidade: null })).toBe('12');
  });
  it('capacidade digitada: vazio limpa, inteiro >= 0 vale, o resto recusa', () => {
    expect(lerCapacidade(' ')).toEqual({ ok: true, valor: null });
    expect(lerCapacidade('600')).toEqual({ ok: true, valor: 600 });
    expect(lerCapacidade('0')).toEqual({ ok: true, valor: 0 });
    expect(lerCapacidade('-1').ok).toBe(false);
    expect(lerCapacidade('1,5').ok).toBe(false);
  });
});

describe('montarCarga', () => {
  const lista: Producao[] = [
    // 100 peças em 10 dias úteis (19 a 30/10): 50 + 50.
    prod({ dealId: 'A', os: '1', inicioCostura: '2026-10-19', dataCombinada: '2026-10-30' }),
    // prevista: 60 peças em 5 dias úteis (28, 29, 30/10, 02 e 03/11): 36 + 24.
    prod({ dealId: 'B', os: '2', pecas: 60, prevista: true, inicioCosturaPrevisto: '2026-10-28', fimCosturaPrevisto: '2026-11-03' }),
    // 200 peças de 02 a 06/11: estoura a capacidade dessa semana.
    prod({ dealId: 'D', os: '4', pecas: 200, inicioCostura: '2026-11-02', dataCombinada: '2026-11-06' }),
    // vencida na OFICINA B (sem capacidade): 30 peças em 15 dias úteis (01 a 21/10) = 2 por dia; 3 dias nesta semana.
    prod({ dealId: 'C', os: '3', oficinaId: 'of-2', oficina: 'OFICINA B', pecas: 30, inicioCostura: '2026-10-01', leadTime: '2026-10-15' }),
    // só no fim de semana: tudo na semana do fim.
    prod({ dealId: 'W', os: '9', oficinaId: 'of-3', oficina: 'OFICINA C', pecas: 10, prevista: true, inicioCosturaPrevisto: '2026-10-24', fimCosturaPrevisto: '2026-10-25' }),
    // A alocar: prevista pela semana de chegada; real que já chegou conta na semana atual.
    prod({ dealId: 'E', os: '5', oficinaId: '', oficina: 'ALOCAR', pecas: 40, prevista: true, inicioCosturaPrevisto: '2026-10-27', fimCosturaPrevisto: '2026-10-29' }),
    prod({ dealId: 'F', os: '6', oficinaId: 'u-alocar', oficina: 'ALOCAR', pecas: 20, inicioCostura: '2026-10-10', dataCombinada: '2026-10-25' }),
    // sem datas: fora da carga, só contadas.
    prod({ dealId: 'G', os: '7', prevista: true, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' }),
    prod({ dealId: 'H', os: '8' })
  ];
  const oficinas = [oficina('of-2', 'OFICINA B', null), oficina('of-1', 'OFICINA A', 100), oficina('of-3', 'OFICINA C', 50), oficina('u-alocar', 'ALOCAR', null)];
  const carga = montarCarga(lista, oficinas, HOJE);

  it('uma linha por oficina, em ordem alfabética, sem o usuário ALOCAR', () => {
    expect(carga.linhas.map((l) => l.oficina)).toEqual(['OFICINA A', 'OFICINA B', 'OFICINA C']);
    expect(carga.semanas).toHaveLength(9);
  });
  it('espalha as peças pelos dias úteis e soma por semana, com a cor da capacidade', () => {
    const a = carga.linhas[0].celulas;
    expect(a.slice(0, 3).map((c) => Math.round(c.pecas * 1000) / 1000)).toEqual([50, 86, 224]);
    expect(a.slice(0, 3).map((c) => c.cor)).toEqual(['VERDE', 'AMARELO', 'VERMELHO']);
    expect(a[1].os).toEqual([
      { dealId: 'A', os: '1', peca: 'PECA TESTE', pecas: 50, prevista: false },
      { dealId: 'B', os: '2', peca: 'PECA TESTE', pecas: 36, prevista: true }
    ]);
    expect(a[3]).toMatchObject({ pecas: 0, cor: 'VERDE', os: [] });
  });
  it('vencida conta até hoje; sem capacidade fica sem cor de alerta', () => {
    const b = carga.linhas[1].celulas;
    expect(b[0]).toMatchObject({ pecas: 6, capacidade: null, cor: 'SEM_CAPACIDADE' });
    expect(b[1].pecas).toBe(0);
  });
  it('intervalo só no fim de semana cai inteiro na semana do fim', () => {
    expect(carga.linhas[2].celulas[0]).toMatchObject({ pecas: 10, cor: 'VERDE' });
  });
  it('A alocar: quantidade de OS e peças pela semana de chegada', () => {
    expect(carga.alocar.slice(0, 2).map((c) => [c.quantidadeOs, c.pecas])).toEqual([[1, 20], [1, 40]]);
    expect(carga.alocar[1].os[0]).toEqual({ dealId: 'E', os: '5', peca: 'PECA TESTE', pecas: 40, prevista: true });
  });
  it('OS sem datas ficam fora e são contadas', () => {
    expect(carga.semDatas).toBe(2);
  });
  it('oficina da OS que não está na lista ganha linha sem capacidade', () => {
    const c = montarCarga([prod({ oficinaId: 'of-9', oficina: 'OFICINA NOVA', inicioCostura: '2026-10-19', dataCombinada: '2026-10-23' })], [], HOJE);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]).toMatchObject({ oficina: 'OFICINA NOVA', capacidade: null });
    expect(c.linhas[0].celulas[0]).toMatchObject({ pecas: 100, cor: 'SEM_CAPACIDADE' });
  });
});
