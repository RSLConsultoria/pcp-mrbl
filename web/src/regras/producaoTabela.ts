import type { Producao } from '../api/tipos';
import { chaveBusca, prazoProducao, reais, situacaoPrazo } from './producao';

// Visão em tabela do Controle de produção (16/10): mesmas OS do Gantt, com
// ordenação, filtro por coluna e escolha de colunas. Situação e prazo vêm das
// regras do Gantt (producao.ts), para as duas visões nunca divergirem.

export type ColunaProducao =
  | 'os' | 'peca' | 'referencia' | 'cliente' | 'oficina' | 'pecas' | 'valorCorte' | 'inicio' | 'combinada'
  | 'leadTime' | 'prazo' | 'situacao' | 'faltasCostura' | 'faltasAcabamento' | 'sugestao' | 'etapa' | 'chegada';

// soPrevistas: coluna que só aparece com "Incluir previstas" ligado (19/10).
export interface DefinicaoColuna { id: ColunaProducao; titulo: string; filtro: 'texto' | 'select'; numerica?: boolean; soPrevistas?: boolean }

export const COLUNAS_PRODUCAO: DefinicaoColuna[] = [
  { id: 'os', titulo: 'OS', filtro: 'texto' },
  { id: 'peca', titulo: 'Peça', filtro: 'texto' },
  { id: 'referencia', titulo: 'Referência', filtro: 'texto' },
  { id: 'cliente', titulo: 'Cliente', filtro: 'texto' },
  { id: 'oficina', titulo: 'Oficina', filtro: 'select' },
  { id: 'pecas', titulo: 'Peças', filtro: 'texto', numerica: true },
  { id: 'valorCorte', titulo: 'Valor do corte', filtro: 'texto', numerica: true },
  { id: 'inicio', titulo: 'Início da costura', filtro: 'texto' },
  { id: 'combinada', titulo: 'Data combinada', filtro: 'texto' },
  { id: 'leadTime', titulo: 'Lead time', filtro: 'texto' },
  { id: 'prazo', titulo: 'Prazo vigente', filtro: 'texto' },
  { id: 'situacao', titulo: 'Situação', filtro: 'select' },
  { id: 'faltasCostura', titulo: 'Faltas costura', filtro: 'texto', numerica: true },
  { id: 'faltasAcabamento', titulo: 'Faltas acabamento', filtro: 'texto', numerica: true },
  { id: 'sugestao', titulo: 'Sugestão pendente', filtro: 'texto' },
  { id: 'etapa', titulo: 'Etapa atual', filtro: 'select', soPrevistas: true },
  { id: 'chegada', titulo: 'Chegada prevista', filtro: 'texto', soPrevistas: true }
];
const IDS = new Set<string>(COLUNAS_PRODUCAO.map((c) => c.id));

// ordem null = valor vazio: fica no fim em qualquer direção.
// filtro: chave da seleção exata (Oficina e Situação).
export interface ValorCelula { exibir: string; ordem: string | number | null; filtro?: string }
export interface LinhaProducao { item: Producao; valores: Record<ColunaProducao, ValorCelula> }
export interface OrdemTabela { coluna: ColunaProducao; direcao: 'asc' | 'desc' }
export type FiltrosColuna = Partial<Record<ColunaProducao, string>>;
export type VisaoProducao = 'GANTT' | 'TABELA' | 'CARGA';
export type AgrupamentoGantt = 'OFICINA' | 'ENTREGA';

export function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const ETAPA_COSTURA = '17. Costura';
const texto = (v: string): ValorCelula => ({ exibir: v, ordem: v.trim() ? v : null });
const data = (iso: string): ValorCelula => ({ exibir: dataBr(iso), ordem: dataBr(iso) ? iso.slice(0, 10) : null });
const contagem = (n: number, sinal: string): ValorCelula => ({ exibir: n ? `${sinal} ${n}` : '—', ordem: n });

export function linhasTabela(lista: Producao[], hoje: string): LinhaProducao[] {
  return lista.map((p) => {
    const situacao = situacaoPrazo(p, hoje);
    const pendente = p.sugestoes.some((s) => s.status === 'PENDENTE');
    return {
      item: p,
      valores: {
        os: texto(p.os),
        peca: texto(p.peca),
        referencia: texto(p.referencia),
        cliente: texto(p.cliente),
        oficina: { ...texto(p.oficina), filtro: p.oficina },
        pecas: { exibir: p.pecas === null ? '' : p.pecas.toLocaleString('pt-BR', { maximumFractionDigits: 3 }), ordem: p.pecas },
        valorCorte: typeof p.valorCorte === 'number' && Number.isFinite(p.valorCorte) ? { exibir: reais(p.valorCorte), ordem: p.valorCorte } : { exibir: '', ordem: null },
        inicio: data(p.inicioCostura),
        combinada: data(p.dataCombinada),
        leadTime: data(p.leadTime),
        prazo: data(prazoProducao(p).data),
        situacao: { exibir: situacao.texto, ordem: situacao.dias, filtro: situacao.situacao },
        faltasCostura: contagem(p.faltasCostura.length, '🚫'),
        faltasAcabamento: contagem(p.faltasAcabamento.length, '⚠️'),
        sugestao: { exibir: pendente ? 'Sim' : '—', ordem: pendente ? 1 : 0 },
        etapa: p.prevista
          ? { exibir: p.etapaNome ?? '', ordem: p.etapaOrdem ?? null, filtro: p.etapaNome ?? '' }
          : { exibir: ETAPA_COSTURA, ordem: 17, filtro: ETAPA_COSTURA },
        chegada: data(p.prevista ? p.inicioCosturaPrevisto ?? '' : '')
      }
    };
  });
}

function comparar(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base', numeric: true });
}

// Sem ordem escolhida, a tabela segue a ordem recebida (a mesma do Gantt).
export function ordenarLinhas(linhas: LinhaProducao[], ordem: OrdemTabela | null): LinhaProducao[] {
  if (!ordem) return linhas;
  const sinal = ordem.direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((x, y) => {
    const a = x.valores[ordem.coluna].ordem;
    const b = y.valores[ordem.coluna].ordem;
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return sinal * comparar(a, b);
  });
}

export function proximaOrdem(atual: OrdemTabela | null, coluna: ColunaProducao): OrdemTabela {
  return atual?.coluna === coluna && atual.direcao === 'asc' ? { coluna, direcao: 'desc' } : { coluna, direcao: 'asc' };
}

export function temFiltroColuna(filtros: FiltrosColuna): boolean {
  return Object.values(filtros).some((v) => !!v?.trim());
}

export function filtrarLinhas(linhas: LinhaProducao[], filtros: FiltrosColuna): LinhaProducao[] {
  const ativos = COLUNAS_PRODUCAO
    .map((c) => ({ c, valor: filtros[c.id]?.trim() ?? '' }))
    .filter((f) => f.valor);
  if (!ativos.length) return linhas;
  return linhas.filter((l) => ativos.every(({ c, valor }) => {
    const celula = l.valores[c.id];
    if (c.filtro === 'select') return celula.filtro === valor;
    return chaveBusca(celula.exibir).includes(chaveBusca(valor));
  }));
}

export function colunasVisiveis(ocultas: string[], incluirPrevistas = false): DefinicaoColuna[] {
  return COLUNAS_PRODUCAO.filter((c) => c.id === 'os' || (!ocultas.includes(c.id) && (incluirPrevistas || !c.soPrevistas)));
}

// Preferências do navegador. localStorage pode lançar exceção (aba privada,
// bloqueio de dados do site): aí vale o padrão e nada é lembrado.
const CHAVE_VISAO = 'pcp-mrbl.producao.visao';
const CHAVE_OCULTAS = 'pcp-mrbl.producao.colunasOcultas';
const CHAVE_AGRUPAMENTO = 'pcp-mrbl.producao.agrupamento';

const CHAVE_PREVISTAS = 'pcp-mrbl.producao.incluirPrevistas';

export function lerVisao(): VisaoProducao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    return v === 'TABELA' || v === 'CARGA' ? v : 'GANTT';
  } catch { return 'GANTT'; }
}

// "Incluir previstas" (Gantt e Tabela): desligado por padrão.
export function lerIncluirPrevistas(): boolean {
  try { return localStorage.getItem(CHAVE_PREVISTAS) === 'SIM'; } catch { return false; }
}

export function salvarIncluirPrevistas(v: boolean): void {
  try { localStorage.setItem(CHAVE_PREVISTAS, v ? 'SIM' : 'NAO'); } catch { /* fica só nesta aba */ }
}

export function salvarVisao(v: VisaoProducao): void {
  try { localStorage.setItem(CHAVE_VISAO, v); } catch { /* fica só nesta aba */ }
}

export function lerAgrupamento(): AgrupamentoGantt {
  try { return localStorage.getItem(CHAVE_AGRUPAMENTO) === 'ENTREGA' ? 'ENTREGA' : 'OFICINA'; } catch { return 'OFICINA'; }
}

export function salvarAgrupamento(a: AgrupamentoGantt): void {
  try { localStorage.setItem(CHAVE_AGRUPAMENTO, a); } catch { /* fica só nesta aba */ }
}

export function lerColunasOcultas(): ColunaProducao[] {
  try {
    const lista: unknown = JSON.parse(localStorage.getItem(CHAVE_OCULTAS) || '[]');
    if (!Array.isArray(lista)) return [];
    return lista.filter((id): id is ColunaProducao => typeof id === 'string' && id !== 'os' && IDS.has(id));
  } catch { return []; }
}

export function salvarColunasOcultas(ocultas: ColunaProducao[]): void {
  try { localStorage.setItem(CHAVE_OCULTAS, JSON.stringify(ocultas)); } catch { /* fica só nesta aba */ }
}
