import type { Board, Caixa, EtapaPedido, Pedido } from '../api/tipos';
import { itensAbertos } from './colunas';
import { diasEntre } from './datas';

export type ColunaSaidaId = 'sem_tratativa' | 'aguardando' | 'almoxarifado' | 'enviado' | 'resolvido';

export const COLUNAS_SAIDA: { id: ColunaSaidaId; nome: string; cor: string; vazio: string }[] = [
  { id: 'sem_tratativa', nome: 'Sem tratativa', cor: 'var(--erro-text)', vazio: 'Toda falta já tem pedido.' },
  { id: 'aguardando', nome: 'Aguardando material', cor: 'var(--falta)', vazio: 'Nenhuma caixa esperando material.' },
  { id: 'almoxarifado', nome: 'Material no almoxarifado', cor: 'var(--signal)', vazio: 'Quando o pedido chega, a caixa vem para cá.' },
  { id: 'enviado', nome: 'Enviado à oficina', cor: 'var(--navy)', vazio: 'Nenhuma caixa enviada à oficina.' },
  { id: 'resolvido', nome: 'Resolvido', cor: 'var(--ok)', vazio: 'Caixas resolvidas ficam aqui por 30 dias.' }
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
  const com = abertos.filter((i) => i.pedidoId !== '').length;
  if (com < abertos.length) {
    return com > 0
      ? { coluna: 'sem_tratativa', parcial: { com, total: abertos.length } }
      : { coluna: 'sem_tratativa' };
  }
  const ultima = idUltimaEtapa(etapas);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const tudoNaUltima = ultima !== '' && abertos.every((i) => porId.get(i.pedidoId)?.etapa === ultima);
  return { coluna: tudoNaUltima ? 'almoxarifado' : 'aguardando' };
}

function ultimaAtividade(c: Caixa): string {
  let u = c.saiuEm;
  for (const h of c.historico) if (h.quando > u) u = h.quando;
  return u;
}

// Caixas que saíram com falta; as resolvidas somem 30 dias depois da última ação.
export function caixasDeSaida(board: Board, hoje: Date): Caixa[] {
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  return board.caixas.filter((c) => {
    if (!c.saiu || !c.saiuComFalta) return false;
    if (colunaSaida(c, pedidos, etapas).coluna !== 'resolvido') return true;
    const d = diasEntre(ultimaAtividade(c), hoje);
    return d === null || d <= DIAS_RESOLVIDO_VISIVEL;
  });
}

export function diasDesdeSaida(c: Pick<Caixa, 'saiuEm'>, hoje: Date): number | null {
  return diasEntre(c.saiuEm, hoje);
}

export function seloSaidaVermelho(dias: number | null): boolean {
  return dias !== null && dias >= DIAS_SELO_VERMELHO;
}
