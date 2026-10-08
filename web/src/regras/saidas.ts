import type { Board, Caixa, EtapaPedido, Item, Pedido } from '../api/tipos';
import { itensAbertos } from './colunas';
import { ddmm, diasEntre, textoDias } from './datas';
import { pedidosDoItem, podeEntrarEmPedido } from './pedidos';

// Colunas de Saídas: "Sem pedido" (só quando há caixa nela), as etapas do quadro de
// Solicitações de faltas menos a última (na ordem dele), "Resolvido" (a última etapa:
// material chegou, pronto para ir à oficina), "Enviado à oficina" e "Concluído" (a oficina
// recebeu). A coluna de uma etapa tem o id `etapa:<id da etapa>`.
export type ColunaSaidaId = 'sem_pedido' | 'resolvido' | 'enviado' | 'concluido' | `etapa:${string}`;

export interface ColunaSaida { id: ColunaSaidaId; nome: string; cor: string; vazio: string }

// Colunas fixas; as das etapas entram entre "Sem pedido" e "Resolvido".
export const COLUNAS_SAIDA: ColunaSaida[] = [
  { id: 'sem_pedido', nome: 'Sem pedido', cor: 'var(--erro-text)', vazio: 'Toda falta já tem pedido.' },
  { id: 'resolvido', nome: 'Resolvido', cor: 'var(--signal)', vazio: 'Com todo o material resolvido, a caixa pode ir à oficina.' },
  { id: 'enviado', nome: 'Enviado à oficina', cor: 'var(--navy)', vazio: 'Nenhuma caixa enviada à oficina.' },
  { id: 'concluido', nome: 'Concluído', cor: 'var(--success)', vazio: 'Caixas concluídas ficam aqui por 30 dias.' }
];

const DIAS_CONCLUIDO_VISIVEL = 30;
export const DIAS_SELO_VERMELHO = 7;

export const idColunaEtapa = (etapaId: string): ColunaSaidaId => `etapa:${etapaId}`;

export interface ColunaDaSaida {
  coluna: ColunaSaidaId;
  parcial?: { com: number; total: number };
  etapasDiferentes?: boolean; // pedidos dos itens abertos em etapas diferentes
}

function ordenadas(etapas: EtapaPedido[]): EtapaPedido[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

export function ultimaEtapaSaida(etapas: EtapaPedido[]): EtapaPedido | null {
  const o = ordenadas(etapas);
  return o.length ? o[o.length - 1] : null;
}

// Colunas na ordem da tela. "Sem pedido" só aparece quando alguma caixa está nela. A coluna
// "Resolvido" leva o nome da última etapa do quadro (o padrão é Resolvido).
export function colunasSaida(etapas: EtapaPedido[], comSemPedido: boolean): ColunaSaida[] {
  const [sem, resolvido, enviado, concluido] = COLUNAS_SAIDA;
  const o = ordenadas(etapas);
  const doQuadro = o.slice(0, -1).map((e): ColunaSaida => ({
    id: idColunaEtapa(e.id), nome: e.nome, cor: 'var(--falta)', vazio: 'Nenhuma caixa com pedido nesta etapa.'
  }));
  const ultima = o[o.length - 1];
  return [...(comSemPedido ? [sem] : []), ...doQuadro, { ...resolvido, nome: ultima?.nome ?? resolvido.nome }, enviado, concluido];
}

export function nomeColunaSaida(id: ColunaSaidaId, etapas: EtapaPedido[]): string {
  if (id.startsWith('etapa:')) return etapas.find((e) => idColunaEtapa(e.id) === id)?.nome ?? 'Outra etapa';
  if (id === 'resolvido') return ultimaEtapaSaida(etapas)?.nome ?? 'Resolvido';
  return COLUNAS_SAIDA.find((c) => c.id === id)?.nome ?? '';
}

// Ids dos pedidos abertos de todos os itens abertos da caixa (sem repetir).
function pedidosAbertosDaCaixa(c: Caixa): string[] {
  const ids: string[] = [];
  for (const i of itensAbertos(c)) for (const id of pedidosDoItem(i)) if (!ids.includes(id)) ids.push(id);
  return ids;
}

// Coluna da caixa: Concluído (oficina recebeu), Enviado à oficina, Resolvido (sem item
// aberto, ou todos os pedidos abertos na última etapa), Sem pedido ou a etapa do pedido mais
// atrasado. Pedido em etapa que não existe mais conta como a primeira etapa.
export function colunaSaida(c: Caixa, pedidos: Pedido[], etapas: EtapaPedido[]): ColunaDaSaida {
  if (c.tratativa === 'RECEBIDO') return { coluna: 'concluido' };
  if (c.tratativa === 'ENVIADO') return { coluna: 'enviado' };
  const abertos = itensAbertos(c);
  if (abertos.length === 0) return { coluna: 'resolvido' };
  const com = abertos.filter((i) => pedidosDoItem(i).length > 0).length;
  if (com < abertos.length) {
    return com > 0
      ? { coluna: 'sem_pedido', parcial: { com, total: abertos.length } }
      : { coluna: 'sem_pedido' };
  }
  const o = ordenadas(etapas);
  if (o.length === 0) return { coluna: 'sem_pedido' };
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  let atraso = o.length;
  const vistas = new Set<string>();
  for (const id of pedidosAbertosDaCaixa(c)) {
    const etapa = porId.get(id)?.etapa ?? '';
    const idx = o.findIndex((e) => e.id === etapa);
    vistas.add(idx < 0 ? '' : etapa);
    const ef = idx < 0 ? 0 : idx;
    if (ef < atraso) atraso = ef;
  }
  const idx = Math.min(atraso, o.length - 1);
  const r: ColunaDaSaida = { coluna: idx === o.length - 1 ? 'resolvido' : idColunaEtapa(o[idx].id) };
  if (vistas.size > 1) r.etapasDiferentes = true;
  return r;
}

// Enviar à oficina (a mesma regra do servidor): sem item aberto (tudo baixado), ou todo item
// aberto com pedido e todos os pedidos abertos deles na última etapa.
export function podeEnviarOficina(c: Caixa, pedidos: Pedido[], etapas: EtapaPedido[]): boolean {
  const abertos = itensAbertos(c);
  if (abertos.length === 0) return true;
  const ultima = ultimaEtapaSaida(etapas);
  if (!ultima) return false;
  if (abertos.some((i) => pedidosDoItem(i).length === 0)) return false;
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  return pedidosAbertosDaCaixa(c).every((id) => porId.get(id)?.etapa === ultima.id);
}

export function textoEnviarSoNaUltima(etapas: EtapaPedido[]): string {
  const u = ultimaEtapaSaida(etapas);
  return `Para enviar à oficina, todo o material precisa estar na última etapa${u ? ` (${u.nome})` : ''}.`;
}

export const TEXTO_ETAPAS_DIFERENTES = 'pedidos em etapas diferentes';

function ultimaAtividade(c: Caixa): string {
  let u = c.tratativaEm > c.saiuEm ? c.tratativaEm : c.saiuEm;
  for (const h of c.historico) if (h.quando > u) u = h.quando;
  return u;
}

export interface SaidaComColuna { caixa: Caixa; coluna: ColunaDaSaida }

// Caixas que saíram com falta, já com a coluna (calculada uma vez só); as concluídas
// somem 30 dias depois da última ação.
export function saidasComColuna(board: Board, hoje: Date): SaidaComColuna[] {
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  const out: SaidaComColuna[] = [];
  for (const c of board.caixas) {
    if (!c.saiu || !c.saiuComFalta) continue;
    const coluna = colunaSaida(c, pedidos, etapas);
    if (coluna.coluna === 'concluido') {
      const d = diasEntre(ultimaAtividade(c), hoje);
      if (d !== null && d > DIAS_CONCLUIDO_VISIVEL) continue;
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
// Pedido em etapa que não existe mais: "PED-0044 · Outra etapa".
export function textoPedidoDoItem(i: Pick<Item, 'pedidoId'> & { pedidoIds?: string[] }, pedidos: Pedido[], etapas: EtapaPedido[]): string {
  const ids = pedidosDoItem(i);
  if (ids.length === 0) return 'sem pedido';
  return ids.map((id) => {
    const p = pedidos.find((x) => x.id === id);
    const etapa = p && etapas.find((e) => e.id === p.etapa)?.nome;
    return `${id} · ${etapa ?? 'Outra etapa'}`;
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
