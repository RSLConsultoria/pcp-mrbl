import type { Board, Caixa, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3 } from './acoes';
import { itemAberto, itensAbertos } from './colunas';
import { ddmm, diasEntre, textoDias } from './datas';
import { pedidosDoItem, podeEntrarEmPedido, rotuloDoPedido } from './pedidos';

// Saídas com falta: "Sem pedido" (só quando há caixa nela) e as etapas do quadro de
// Solicitações de faltas, na ordem dele. A caixa se divide sozinha por etapa: uma parte por
// coluna onde ela tem item, cada parte só com os itens daquela etapa. A coluna de uma etapa
// tem o id `etapa:<id da etapa>`.
export type ColunaSaidaId = 'sem_pedido' | `etapa:${string}`;

export interface ColunaSaida { id: ColunaSaidaId; nome: string; cor: string; vazio: string }

// Item numa parte: os pedidos dele naquela coluna e a quantidade (a soma nesses pedidos; em
// Sem pedido, o que resta; item fechado sem pedido, o que foi baixado).
export interface ItemDaParte { item: Item; pedidoIds: string[]; qtd: number | null }

export interface ParteSaida { coluna: ColunaSaidaId; indice: number; total: number; itens: ItemDaParte[] }

export interface SaidaNaTela { caixa: Caixa; parte: ParteSaida }

const DIAS_CONCLUIDO_VISIVEL = 30;
export const DIAS_SELO_VERMELHO = 7;

export const idColunaEtapa = (etapaId: string): ColunaSaidaId => `etapa:${etapaId}`;

const SEM_PEDIDO: ColunaSaida = { id: 'sem_pedido', nome: 'Sem pedido', cor: 'var(--erro-text)', vazio: 'Toda falta já tem pedido.' };

function ordenadas(etapas: EtapaPedido[]): EtapaPedido[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

// Colunas na ordem da tela. A penúltima (a da baixa) em navy e a última (concluído) em verde.
export function colunasSaida(etapas: EtapaPedido[], comSemPedido: boolean): ColunaSaida[] {
  const o = ordenadas(etapas);
  const doQuadro = o.map((e, i): ColunaSaida => {
    const final = i === o.length - 1;
    return {
      id: idColunaEtapa(e.id), nome: e.nome,
      cor: final ? 'var(--success)' : i === o.length - 2 ? 'var(--navy)' : 'var(--falta)',
      vazio: final ? 'Caixas concluídas ficam aqui por 30 dias.' : 'Nenhuma caixa com pedido nesta etapa.'
    };
  });
  return [...(comSemPedido ? [SEM_PEDIDO] : []), ...doQuadro];
}

export function nomeColunaSaida(id: ColunaSaidaId, etapas: EtapaPedido[]): string {
  if (id === 'sem_pedido') return SEM_PEDIDO.nome;
  return etapas.find((e) => idColunaEtapa(e.id) === id)?.nome ?? 'Outra etapa';
}

// Coluna de um pedido: concluído na etapa final; com a baixa, na da baixa; senão a etapa dele
// (etapa que saiu do quadro conta como a primeira). null sem etapas.
export function colunaDoPedido(p: Pick<Pedido, 'etapa' | 'finalizado' | 'baixadoEm'>, etapas: EtapaPedido[]): ColunaSaidaId | null {
  const o = ordenadas(etapas);
  if (o.length === 0) return null;
  if (p.finalizado) return idColunaEtapa(o[o.length - 1].id);
  if (p.baixadoEm && o.length >= 2) return idColunaEtapa(o[o.length - 2].id);
  return idColunaEtapa((o.find((e) => e.id === p.etapa) ?? o[0]).id);
}

// Partes da caixa, na ordem das colunas. Um item entra em cada coluna onde tem pedido (original
// e partes, com a quantidade daquele pedido); aberto sem pedido aberto vai para Sem pedido (com
// o que resta); fechado sem pedido vai para a etapa final.
export function partesDaSaida(c: Caixa, pedidos: Pedido[], etapas: EtapaPedido[]): ParteSaida[] {
  const o = ordenadas(etapas);
  const ordem: ColunaSaidaId[] = ['sem_pedido', ...o.map((e) => idColunaEtapa(e.id))];
  const porColuna = new Map<ColunaSaidaId, ItemDaParte[]>();
  const adicionar = (col: ColunaSaidaId, x: ItemDaParte) => porColuna.set(col, [...(porColuna.get(col) ?? []), x]);
  for (const i of c.itens) {
    const linhas = pedidos.flatMap((p) => p.itens.filter((x) => x.itemId === i.id && x.dealId === c.dealId).map((x) => ({ p, qtd: x.qtd ?? 0 })));
    const cols = new Map<ColunaSaidaId, ItemDaParte>();
    for (const { p, qtd } of linhas) {
      const col = colunaDoPedido(p, etapas);
      if (!col) continue;
      const g = cols.get(col) ?? { item: i, pedidoIds: [], qtd: 0 };
      if (!g.pedidoIds.includes(p.id)) g.pedidoIds.push(p.id);
      g.qtd = arredondar3((g.qtd ?? 0) + qtd);
      cols.set(col, g);
    }
    // pedido aberto que o board ainda não trouxe: conta como a primeira etapa
    const vistos = new Set(linhas.map((x) => x.p.id));
    const soltos = pedidosDoItem(i).filter((id) => !vistos.has(id));
    if (soltos.length > 0 && o.length > 0) {
      const col = idColunaEtapa(o[0].id);
      const g = cols.get(col) ?? { item: i, pedidoIds: [], qtd: null };
      g.pedidoIds.push(...soltos);
      cols.set(col, g);
    }
    for (const [col, g] of cols) adicionar(col, g);
    if (itemAberto(i) && pedidosDoItem(i).length === 0) adicionar('sem_pedido', { item: i, pedidoIds: [], qtd: i.resta });
    else if (!itemAberto(i) && cols.size === 0 && o.length > 0) adicionar(idColunaEtapa(o[o.length - 1].id), { item: i, pedidoIds: [], qtd: i.baixada });
  }
  const presentes = ordem.filter((k) => porColuna.has(k));
  return presentes.map((coluna, k) => ({ coluna, indice: k + 1, total: presentes.length, itens: porColuna.get(coluna)! }));
}

// "material entregue no destino": só a parte com pedido (concluído, na etapa final). Item
// fechado sem pedido também cai na etapa final, mas nada foi entregue por pedido.
export function parteEntregue(parte: Pick<ParteSaida, 'itens'>): boolean {
  return parte.itens.some((x) => x.pedidoIds.length > 0);
}

// Caixa que aparece em Saídas: saiu com falta, ou saiu e ganhou demanda pós-saída.
export function saiuComFalta(c: Caixa): boolean {
  return c.saiu && (c.saiuComFalta || c.itens.some((i) => i.posSaida));
}

// A data mais recente entre a saída, o último histórico, a última baixa e a conclusão dos
// pedidos da parte.
function ultimaAtividade(c: Caixa, parte: ParteSaida, pedidos: Pedido[]): string {
  let u = c.saiuEm;
  for (const h of c.historico) if (h.quando > u) u = h.quando;
  for (const x of parte.itens) {
    if (x.item.resolvidoEm > u) u = x.item.resolvidoEm;
    for (const id of x.pedidoIds) {
      const em = pedidos.find((p) => p.id === id)?.concluidoEm ?? '';
      if (em > u) u = em;
    }
  }
  return u;
}

// Partes das caixas que saíram com falta. A parte na etapa final some 30 dias depois da última
// atividade; as que ficam são renumeradas ("1 de 2").
export function saidasNaTela(board: Board, hoje: Date): SaidaNaTela[] {
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  const o = ordenadas(etapas);
  const final = o.length > 0 ? idColunaEtapa(o[o.length - 1].id) : null;
  const out: SaidaNaTela[] = [];
  for (const c of board.caixas) {
    if (!saiuComFalta(c)) continue;
    const visiveis = partesDaSaida(c, pedidos, etapas).filter((p) => {
      if (p.coluna !== final) return true;
      const d = diasEntre(ultimaAtividade(c, p, pedidos), hoje);
      return d === null || d <= DIAS_CONCLUIDO_VISIVEL;
    });
    visiveis.forEach((parte, k) => out.push({ caixa: c, parte: { ...parte, indice: k + 1, total: visiveis.length } }));
  }
  return out;
}

export const chaveDaSaida = (x: SaidaNaTela): string => `${x.caixa.id}|${x.parte.coluna}`;

// "90004 · 1 de 2" quando a caixa está em mais de uma coluna; senão só a OS.
export const rotuloDaSaida = (x: SaidaNaTela): string =>
  x.parte.total > 1 ? `${x.caixa.os} · ${x.parte.indice} de ${x.parte.total}` : x.caixa.os;

export function textoPedidosDaParte(x: Pick<ItemDaParte, 'pedidoIds'>): string {
  return x.pedidoIds.length > 0 ? x.pedidoIds.map(rotuloDoPedido).join(', ') : 'sem pedido';
}

export function diasDesdeSaida(c: Pick<Caixa, 'saiuEm'>, hoje: Date): number | null {
  return diasEntre(c.saiuEm, hoje);
}

export function seloSaidaVermelho(dias: number | null): boolean {
  return dias !== null && dias >= DIAS_SELO_VERMELHO;
}

// "PED-0044 · Solicitado" quando o item está num pedido aberto; senão "sem pedido". Com
// o pedido dividido, um por parte. Pedido em etapa que não existe mais: "Outra etapa".
export function textoPedidoDoItem(i: Pick<Item, 'pedidoId'> & { pedidoIds?: string[] }, pedidos: Pedido[], etapas: EtapaPedido[]): string {
  const ids = pedidosDoItem(i);
  if (ids.length === 0) return 'sem pedido';
  return ids.map((id) => {
    const p = pedidos.find((x) => x.id === id);
    const etapa = p && etapas.find((e) => e.id === p.etapa)?.nome;
    return `${rotuloDoPedido(id)} · ${etapa ?? 'Outra etapa'}`;
  }).join(', ');
}

// "saiu 18/09 · há 19 dias".
export function textoSaiu(c: Pick<Caixa, 'saiuEm'>, hoje: Date): string {
  if (!c.saiuEm) return 'saiu';
  return `saiu ${ddmm(c.saiuEm)} · ${textoDias(diasDesdeSaida(c, hoje))}`;
}

// Itens da caixa que podem entrar num pedido novo: abertos, editáveis e sem pedido.
export function itensParaPedido(c: Caixa): Item[] {
  return itensAbertos(c).filter(podeEntrarEmPedido);
}
