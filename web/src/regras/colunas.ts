import type { Caixa, Item } from '../api/tipos';
import { diasEntre } from './datas';

export type ColunaId = 'falta_pedido' | 'completa_pedido' | 'falta_corte' | 'completa_corte' | 'saiu_com' | 'saiu_sem';

export const COLUNAS: { id: ColunaId; nome: string; cor: string; vazio: string }[] = [
  { id: 'falta_pedido', nome: 'Itens faltando · Pedido', cor: '#D9731F', vazio: 'Nenhuma caixa com falta no ciclo Pedido.' },
  { id: 'completa_pedido', nome: 'Caixa completa · Pedido', cor: '#3FB68B', vazio: 'As caixas vêm para cá sozinhas quando a falta zera.' },
  { id: 'falta_corte', nome: 'Itens faltando · Corte', cor: '#D9731F', vazio: 'Nenhuma caixa com falta no ciclo Corte.' },
  { id: 'completa_corte', nome: 'Caixa completa · Corte', cor: '#3FB68B', vazio: 'As caixas vêm para cá sozinhas quando a falta zera.' },
  { id: 'saiu_com', nome: 'Saiu com faltas', cor: '#8B1D1D', vazio: 'Nenhuma caixa saiu com item em aberto.' },
  { id: 'saiu_sem', nome: 'Saiu sem faltas', cor: '#8A8676', vazio: 'Caixas que saíram completas ficam aqui por 30 dias.' }
];

const DIAS_SAIU_SEM_VISIVEL = 30;

export function itemAberto(i: Item): boolean {
  return (i.status === 'ABERTO' || i.status === 'PARCIAL') && (i.falta === null || i.falta > 0);
}

export function itensAbertos(c: Caixa): Item[] {
  return c.itens.filter(itemAberto);
}

export function colunaDaCaixa(c: Caixa): ColunaId {
  const aberto = c.itens.some(itemAberto);
  if (c.saiu) return aberto ? 'saiu_com' : 'saiu_sem';
  const ciclo = c.ciclo === 'CORTE' ? 'corte' : 'pedido';
  return aberto ? `falta_${ciclo}` : `completa_${ciclo}`;
}

export function visivelNoQuadro(c: Caixa, hoje: Date): boolean {
  if (colunaDaCaixa(c) !== 'saiu_sem') return true;
  const d = diasEntre(c.saiuEm, hoje);
  return d === null || d <= DIAS_SAIU_SEM_VISIVEL;
}
