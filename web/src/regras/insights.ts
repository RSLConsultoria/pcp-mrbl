import type { Board, Caixa, Producao } from '../api/tipos';
import { diaIso } from './datas';
import { statusProducao } from './producao';

// Insights do dia (F5b): o que pede atenção hoje, calculado no site a partir do board.
// Dia como 'aaaa-mm-dd' (o mesmo "hoje" das telas); a cobrança usa o instante (24 h).

export const DIAS_PRAZO_ESTOURANDO = 3;
export const DIAS_CAIXA_PARADA = 7;
export const HORAS_SEM_RESPOSTA = 24;
export const TOP_OFICINAS = 5;

export interface LinhaPrazo { dealId: string; os: string; peca: string; oficina: string; dias: number; texto: string }
export interface LinhaCaixaParada { id: string; os: string; tipo: string; dias: number; itensAbertos: number; texto: string; itens: string }
export interface LinhaOficina { oficinaId: string; oficina: string; os: number; dias: number; texto: string }
export interface LinhaCobranca { dealId: string; os: string; peca: string; oficina: string; horas: number; texto: string }
export interface InsightsDoDia { prazos: LinhaPrazo[]; caixas: LinhaCaixaParada[]; oficinas: LinhaOficina[]; cobrancas: LinhaCobranca[] }

const msDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const diasAte = (de: string, ate: string) => Math.round((msDia(ate) - msDia(de)) / 86_400_000);
const porOs = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const nDias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const ehAlocar = (p: Pick<Producao, 'oficinaId' | 'oficina'>) => !p.oficinaId || p.oficina.trim().toUpperCase() === 'ALOCAR';
const naCostura = (lista: Producao[] | undefined) => (lista ?? []).filter((p) => !p.prevista);

function textoPrazo(dias: number): string {
  if (dias < 0) return `venceu há ${nDias(-dias)}`;
  if (dias === 0) return 'vence hoje';
  return `vence em ${nDias(dias)}`;
}

// 1. OS na Costura com o prazo vigente (combinada; senão lead time) vencido ou em até 3 dias.
export function prazosEstourando(producao: Producao[] | undefined, hoje: string): LinhaPrazo[] {
  return naCostura(producao)
    .map((p) => ({ p, dias: statusProducao(p, hoje).dias }))
    .filter((x): x is { p: Producao; dias: number } => x.dias !== null && x.dias <= DIAS_PRAZO_ESTOURANDO)
    .sort((a, b) => a.dias - b.dias || porOs(a.p.os, b.p.os))
    .map(({ p, dias }) => ({ dealId: p.dealId, os: p.os, peca: p.peca || p.referencia, oficina: p.oficina, dias, texto: textoPrazo(dias) }));
}

export function rotuloTipoCaixa(tipo: string): string {
  const t = tipo.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Caixa';
}

// 2. Caixa com falta aberta (algum item com resta > 0), que não saiu, registrada há 7 dias ou mais.
export function caixasParadas(caixas: Caixa[], hoje: string): LinhaCaixaParada[] {
  return caixas
    .filter((c) => !c.saiu && /^\d{4}-\d{2}-\d{2}/.test(c.registradoEm))
    .map((c) => ({ c, dias: diasAte(c.registradoEm.slice(0, 10), hoje), abertos: c.itens.filter((i) => (i.resta ?? 0) > 0).length }))
    .filter((x) => x.abertos > 0 && x.dias >= DIAS_CAIXA_PARADA)
    .map(({ c, dias, abertos }) => ({
      id: c.id, os: c.os, tipo: rotuloTipoCaixa(c.tipo), dias, itensAbertos: abertos,
      texto: `parada há ${nDias(dias)}`, itens: `${abertos} ${abertos === 1 ? 'item' : 'itens'} em aberto`
    }))
    .sort((a, b) => b.dias - a.dias || porOs(a.os, b.os) || a.tipo.localeCompare(b.tipo, 'pt-BR'));
}

// 3. Soma dos dias de atraso (só prazos vencidos) por oficina; ALOCAR e OS sem oficina ficam de fora. Top 5.
export function oficinasComAtraso(producao: Producao[] | undefined, hoje: string): LinhaOficina[] {
  const mapa = new Map<string, { oficina: string; os: number; dias: number }>();
  for (const p of naCostura(producao)) {
    if (ehAlocar(p)) continue;
    const { dias } = statusProducao(p, hoje);
    if (dias === null || dias >= 0) continue;
    const atual = mapa.get(p.oficinaId) ?? { oficina: p.oficina, os: 0, dias: 0 };
    mapa.set(p.oficinaId, { ...atual, os: atual.os + 1, dias: atual.dias - dias });
  }
  return [...mapa.entries()]
    .map(([oficinaId, v]) => ({
      oficinaId, ...v,
      texto: `${v.os} ${v.os === 1 ? 'OS atrasada' : 'OS atrasadas'} · ${v.dias} ${v.dias === 1 ? 'dia somado' : 'dias somados'}`
    }))
    .sort((a, b) => b.dias - a.dias || b.os - a.os || a.oficina.localeCompare(b.oficina, 'pt-BR'))
    .slice(0, TOP_OFICINAS);
}

// 4. A última mensagem da conversa é uma cobrança/confirmação enviada (ENVIADA, status ENVIADA)
// há mais de 24 h. A pergunta do associador ("Essa mensagem é sobre ...?") não é cobrança.
export function cobrancasSemResposta(producao: Producao[] | undefined, agora: Date): LinhaCobranca[] {
  const linhas: (LinhaCobranca & { ms: number })[] = [];
  for (const p of naCostura(producao)) {
    const ultima = [...p.mensagens].sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))[0];
    if (!ultima || ultima.direcao !== 'ENVIADA' || ultima.statusEnvio !== 'ENVIADA' || ultima.pergunta) continue;
    const ms = agora.getTime() - Date.parse(ultima.quando);
    if (!(ms > HORAS_SEM_RESPOSTA * 3_600_000)) continue;
    const horas = Math.floor(ms / 3_600_000);
    const quanto = horas < 48 ? `${horas} horas` : nDias(Math.floor(horas / 24));
    linhas.push({ dealId: p.dealId, os: p.os, peca: p.peca || p.referencia, oficina: p.oficina, horas, ms, texto: `sem resposta há ${quanto}` });
  }
  return linhas.sort((a, b) => b.ms - a.ms || porOs(a.os, b.os)).map(({ ms: _ms, ...l }) => l);
}

export function insightsDoDia(board: Pick<Board, 'caixas' | 'producao'>, agora: Date): InsightsDoDia {
  const hoje = diaIso(agora);
  return {
    prazos: prazosEstourando(board.producao, hoje),
    caixas: caixasParadas(board.caixas, hoje),
    oficinas: oficinasComAtraso(board.producao, hoje),
    cobrancas: cobrancasSemResposta(board.producao, agora)
  };
}

// Linha da faixa recolhida: só o que tem itens.
export function resumoInsights(ins: InsightsDoDia): string {
  const partes: string[] = [];
  const parte = (n: number, um: string, varios: string) => { if (n) partes.push(`${n} ${n === 1 ? um : varios}`); };
  parte(ins.prazos.length, 'prazo estourando', 'prazos estourando');
  parte(ins.caixas.length, 'caixa parada', 'caixas paradas');
  parte(ins.oficinas.length, 'oficina com atraso', 'oficinas com atraso');
  parte(ins.cobrancas.length, 'cobrança sem resposta', 'cobranças sem resposta');
  return partes.join(' · ') || 'Nada pedindo atenção hoje.';
}

// Aberta ou recolhida, lembrada no navegador. localStorage pode lançar exceção (aba privada,
// bloqueio de dados do site): aí vale o padrão (recolhida) e nada é lembrado.
const CHAVE_ABERTOS = 'pcp-mrbl.insights.abertos';

export function lerInsightsAbertos(): boolean {
  try { return localStorage.getItem(CHAVE_ABERTOS) === 'SIM'; } catch { return false; }
}

export function salvarInsightsAbertos(v: boolean): void {
  try { localStorage.setItem(CHAVE_ABERTOS, v ? 'SIM' : 'NAO'); } catch { /* fica só nesta aba */ }
}
