import type { OficinaProducao, Producao } from '../api/tipos';
import { prazoProducao } from './producao';

// Visão Carga (19/10): quantas peças cada oficina tem por semana, somando o que já
// costura (real) com o que vem aí (OS previstas), contra a capacidade dela. Só mostra;
// quem decide a alocação é o PCP. Datas 'aaaa-mm-dd' sem fuso (meio-dia UTC).

export type CorCarga = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'SEM_CAPACIDADE';
export interface SemanaCarga { inicio: string; fim: string; rotulo: string }
export interface OsNaCelula { dealId: string; os: string; peca: string; pecas: number; prevista: boolean }
export interface CelulaCarga { semana: string; pecas: number; capacidade: number | null; cor: CorCarga; os: OsNaCelula[] }
export interface LinhaCarga { oficinaId: string; oficina: string; capacidade: number | null; celulas: CelulaCarga[] }
export interface CelulaAlocar { semana: string; quantidadeOs: number; pecas: number; os: OsNaCelula[] }
export interface Carga { semanas: SemanaCarga[]; linhas: LinhaCarga[]; alocar: CelulaAlocar[]; semDatas: number }

export const SEMANAS_CARGA = 9; // a atual e mais 8 à frente

const DIA_MS = 86_400_000;
const ms = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const somarDiasIso = (d: string, n: number): string => iso(ms(d) + n * DIA_MS);

// Segunda-feira da semana (segunda a domingo) de uma data.
export function segundaDaSemana(d: string): string {
  const dia = new Date(ms(d)).getUTCDay(); // 0 = domingo
  return somarDiasIso(d, dia === 0 ? -6 : 1 - dia);
}

export function semanasCarga(hoje: string, quantidade: number = SEMANAS_CARGA): SemanaCarga[] {
  const primeira = segundaDaSemana(hoje);
  return Array.from({ length: quantidade }, (_, k) => {
    const inicio = somarDiasIso(primeira, 7 * k);
    const fim = somarDiasIso(inicio, 6);
    return { inicio, fim, rotulo: `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}` };
  });
}

// Dias úteis (segunda a sexta) de inicio a fim, inclusive.
export function diasUteis(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let t = ms(inicio); t <= ms(fim); t += DIA_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) dias.push(iso(t));
  }
  return dias;
}

// Quando a OS ocupa a oficina. Prevista: da chegada prevista ao fim previsto. Real: do
// início da costura (ou hoje, sem início) até o prazo vigente; prazo vencido conta até
// hoje, porque a oficina continua com as peças. Sem datas: null (fica fora da carga).
export function intervaloCostura(p: Producao, hoje: string): { inicio: string; fim: string } | null {
  if (p.prevista) {
    if (!p.inicioCosturaPrevisto || !p.fimCosturaPrevisto) return null;
    return { inicio: p.inicioCosturaPrevisto, fim: p.fimCosturaPrevisto < p.inicioCosturaPrevisto ? p.inicioCosturaPrevisto : p.fimCosturaPrevisto };
  }
  const prazo = prazoProducao(p).data;
  if (!prazo) return null;
  const fim = prazo < hoje ? hoje : prazo;
  const inicio = p.inicioCostura || hoje;
  return { inicio: inicio > fim ? fim : inicio, fim };
}

// Até 80% verde, até 100% amarelo, acima vermelho. Sem capacidade: sem cor de alerta.
export function corCarga(pecas: number, capacidade: number | null | undefined): CorCarga {
  if (capacidade === null || capacidade === undefined) return 'SEM_CAPACIDADE';
  // Capacidade 0: só alerta quando a carga aparece na célula (o texto arredonda as peças).
  if (capacidade <= 0) return Math.round(pecas) > 0 ? 'VERMELHO' : 'VERDE';
  const r = pecas / capacidade;
  // Tolerância: somas fracionadas não podem passar do limite por erro de ponto flutuante.
  return r <= 0.8 + 1e-9 ? 'VERDE' : r <= 1 + 1e-9 ? 'AMARELO' : 'VERMELHO';
}

export const semOficina = (p: Pick<Producao, 'oficinaId' | 'oficina'>): boolean =>
  !p.oficinaId || p.oficina.trim().toUpperCase() === 'ALOCAR';

const pecasDe = (p: Producao): number => (typeof p.pecas === 'number' && Number.isFinite(p.pecas) ? p.pecas : 0);

// Peças da OS em cada semana: espalhadas igualmente pelos dias úteis do intervalo. Sem dia
// útil (intervalo só no fim de semana), tudo cai na semana do fim.
function pecasPorSemana(p: Producao, intervalo: { inicio: string; fim: string }): Map<string, number> {
  const total = pecasDe(p);
  const porSemana = new Map<string, number>();
  const uteis = diasUteis(intervalo.inicio, intervalo.fim);
  if (!uteis.length) return porSemana.set(segundaDaSemana(intervalo.fim), total);
  for (const d of uteis) {
    const s = segundaDaSemana(d);
    porSemana.set(s, (porSemana.get(s) ?? 0) + total / uteis.length);
  }
  return porSemana;
}

// lista: OS já filtradas (os filtros gerais valem aqui), reais e previstas.
// oficinas: board.oficinas; toda oficina ativa vira linha, mesmo sem OS.
export function montarCarga(lista: Producao[], oficinas: OficinaProducao[], hoje: string, quantidade: number = SEMANAS_CARGA): Carga {
  const semanas = semanasCarga(hoje, quantidade);
  const indice = new Map(semanas.map((s, k) => [s.inicio, k]));
  const linhas = new Map<string, LinhaCarga>();
  const novaLinha = (oficinaId: string, oficina: string, capacidade: number | null): LinhaCarga => ({
    oficinaId, oficina, capacidade,
    celulas: semanas.map((s) => ({ semana: s.inicio, pecas: 0, capacidade, cor: corCarga(0, capacidade), os: [] }))
  });
  for (const o of oficinas) {
    if (o.nome.trim().toUpperCase() === 'ALOCAR') continue;
    linhas.set(o.ploomesId, novaLinha(o.ploomesId, o.nome, o.capacidadeSemana ?? null));
  }
  const alocar: CelulaAlocar[] = semanas.map((s) => ({ semana: s.inicio, quantidadeOs: 0, pecas: 0, os: [] }));
  let semDatas = 0;
  const atual = semanas[0].inicio;

  for (const p of lista) {
    const intervalo = intervaloCostura(p, hoje);
    if (!intervalo) { semDatas++; continue; }
    if (semOficina(p)) {
      // A alocar: a OS inteira na semana em que chega (a que já chegou conta na atual).
      const chegada = segundaDaSemana(intervalo.inicio);
      const k = indice.get(chegada < atual ? atual : chegada);
      if (k === undefined) continue;
      alocar[k].quantidadeOs++;
      alocar[k].pecas += pecasDe(p);
      alocar[k].os.push({ dealId: p.dealId, os: p.os, peca: p.peca, pecas: pecasDe(p), prevista: !!p.prevista });
      continue;
    }
    const linha = linhas.get(p.oficinaId) ?? novaLinha(p.oficinaId, p.oficina, null);
    linhas.set(p.oficinaId, linha);
    for (const [semana, pecas] of pecasPorSemana(p, intervalo)) {
      const k = indice.get(semana);
      if (k === undefined) continue;
      const c = linha.celulas[k];
      c.pecas += pecas;
      c.os.push({ dealId: p.dealId, os: p.os, peca: p.peca, pecas, prevista: !!p.prevista });
    }
  }
  for (const l of linhas.values()) for (const c of l.celulas) c.cor = corCarga(c.pecas, c.capacidade);
  return {
    semanas,
    linhas: [...linhas.values()].sort((a, b) => a.oficina.localeCompare(b.oficina, 'pt-BR')),
    alocar,
    semDatas
  };
}

// Texto da célula: "420 / 600" (sem capacidade, só as peças).
export function textoCelula(c: Pick<CelulaCarga, 'pecas' | 'capacidade'>): string {
  const pecas = Math.round(c.pecas).toLocaleString('pt-BR');
  return c.capacidade === null ? pecas : `${pecas} / ${c.capacidade.toLocaleString('pt-BR')}`;
}

// Capacidade digitada pelo ADM: vazio = sem capacidade; senão inteiro >= 0.
export function lerCapacidade(texto: string): { ok: true; valor: number | null } | { ok: false; erro: string } {
  const t = texto.trim();
  if (!t) return { ok: true, valor: null };
  if (!/^\d+$/.test(t) || Number(t) > 1_000_000) return { ok: false, erro: 'Informe a capacidade em peças por semana: número inteiro, 0 ou mais.' };
  return { ok: true, valor: Number(t) };
}
