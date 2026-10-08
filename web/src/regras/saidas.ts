import type { Board, Caixa, EtapaPedido, Item, Pedido } from '../api/tipos';
import { itensAbertos } from './colunas';
import { ddmm, diasEntre, textoDias } from './datas';
import { pedidosDoItem, podeEntrarEmPedido } from './pedidos';

export type ColunaSaidaId = 'sem_tratativa' | 'aguardando' | 'almoxarifado' | 'enviado' | 'resolvido';

export const COLUNAS_SAIDA: { id: ColunaSaidaId; nome: string; cor: string; vazio: string }[] = [
  { id: 'sem_tratativa', nome: 'Sem tratativa', cor: 'var(--erro-text)', vazio: 'Toda falta já tem pedido.' },
  { id: 'aguardando', nome: 'Aguardando material', cor: 'var(--falta)', vazio: 'Nenhuma caixa esperando material.' },
  { id: 'almoxarifado', nome: 'Material no almoxarifado', cor: 'var(--signal)', vazio: 'Quando o pedido chega, a caixa vem para cá.' },
  { id: 'enviado', nome: 'Enviado à oficina', cor: 'var(--navy)', vazio: 'Nenhuma caixa enviada à oficina.' },
  { id: 'resolvido', nome: 'Resolvido', cor: 'var(--success)', vazio: 'Caixas resolvidas ficam aqui por 30 dias.' }
];

const DIAS_RESOLVIDO_VISIVEL = 30;
export const DIAS_SELO_VERMELHO = 7;

export interface ColunaDaSaida {
  coluna: ColunaSaidaId;
  parcial?: { com: number; total: number };
}

function idUltimaEtapa(etapas: EtapaPedido[]): string {
  let u: EtapaPedido | undefined;
  for (const e of etapas) if (!u || e.ordem > u.ordem) u = e;
  return u?.id ?? '';
}

export function colunaSaida(c: Caixa, pedidos: Pedido[], etapas: EtapaPedido[]): ColunaDaSaida {
  const abertos = itensAbertos(c);
  if (abertos.length === 0) return { coluna: 'resolvido' };
  if (c.tratativa === 'ENVIADO') return { coluna: 'enviado' };
  const com = abertos.filter((i) => pedidosDoItem(i).length > 0).length;
  if (com < abertos.length) {
    return com > 0
      ? { coluna: 'sem_tratativa', parcial: { com, total: abertos.length } }
      : { coluna: 'sem_tratativa' };
  }
  const ultima = idUltimaEtapa(etapas);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  // Todos os pedidos abertos (original e partes) de todos os itens abertos na última etapa.
  const tudoNaUltima = ultima !== '' && abertos.every((i) => pedidosDoItem(i).every((id) => porId.get(id)?.etapa === ultima));
  return { coluna: tudoNaUltima ? 'almoxarifado' : 'aguardando' };
}

function ultimaAtividade(c: Caixa): string {
  let u = c.saiuEm;
  for (const h of c.historico) if (h.quando > u) u = h.quando;
  return u;
}

export interface SaidaComColuna { caixa: Caixa; coluna: ColunaDaSaida }

// Caixas que saíram com falta, já com a coluna (calculada uma vez só); as resolvidas
// somem 30 dias depois da última ação.
export function saidasComColuna(board: Board, hoje: Date): SaidaComColuna[] {
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  const out: SaidaComColuna[] = [];
  for (const c of board.caixas) {
    if (!c.saiu || !c.saiuComFalta) continue;
    const coluna = colunaSaida(c, pedidos, etapas);
    if (coluna.coluna === 'resolvido') {
      const d = diasEntre(ultimaAtividade(c), hoje);
      if (d !== null && d > DIAS_RESOLVIDO_VISIVEL) continue;
    }
    out.push({ caixa: c, coluna });
  }
  return out;
}

export function caixasDeSaida(board: Board, hoje: Date): Caixa[] {
  return saidasComColuna(board, hoje).map((x) => x.caixa);
}

export function diasDesdeSaida(c: Pick<Caixa, 'saiuEm'>, hoje: Date): number | null {
  return diasEntre(c.saiuEm, hoje);
}

export function seloSaidaVermelho(dias: number | null): boolean {
  return dias !== null && dias >= DIAS_SELO_VERMELHO;
}

// "PED-0044 · Solicitado" quando o item está num pedido aberto; senão "sem pedido". Com
// o pedido dividido, um por parte: "PED-0044 · Solicitado, PED-0044.1 · Recebidos".
export function textoPedidoDoItem(i: Pick<Item, 'pedidoId'> & { pedidoIds?: string[] }, pedidos: Pedido[], etapas: EtapaPedido[]): string {
  const ids = pedidosDoItem(i);
  if (ids.length === 0) return 'sem pedido';
  return ids.map((id) => {
    const p = pedidos.find((x) => x.id === id);
    const etapa = p && etapas.find((e) => e.id === p.etapa)?.nome;
    return etapa ? `${id} · ${etapa}` : id;
  }).join(', ');
}

// "saiu 18/09 · há 19 dias".
export function textoSaiu(c: Pick<Caixa, 'saiuEm'>, hoje: Date): string {
  if (!c.saiuEm) return 'saiu';
  return `saiu ${ddmm(c.saiuEm)} · ${textoDias(diasDesdeSaida(c, hoje))}`;
}

export function textoParcial(p: { com: number; total: number }): string {
  return `parcial · ${p.com} de ${p.total} com pedido`;
}

export function textoTratativa(c: Pick<Caixa, 'tratativa' | 'tratativaEm'>): string {
  const em = c.tratativaEm ? ` em ${ddmm(c.tratativaEm)}` : '';
  if (c.tratativa === 'ENVIADO') return `Enviado à oficina${em}`;
  if (c.tratativa === 'RECEBIDO') return `Oficina recebeu${em}`;
  return 'Ainda não enviado à oficina';
}

// Itens da caixa que podem entrar num pedido novo: abertos, editáveis e sem pedido.
export function itensParaPedido(c: Caixa): Item[] {
  return itensAbertos(c).filter(podeEntrarEmPedido);
}
