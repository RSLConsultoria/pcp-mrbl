import type { Item } from '../api/tipos';

export function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Linha e fio chegam em cones com o peso em gramas ao lado (faltaG).
export function formatarQtd(qtd: number | null, un: string, g: number | null): string {
  if (qtd === null) return '—';
  const base = un ? `${formatarNumero(qtd)} ${un}` : formatarNumero(qtd);
  return g !== null && g > 0 ? `${base} · ${formatarNumero(g)} g` : base;
}

export function contaDoItem(i: Item): string {
  const partes: string[] = [];
  if (i.necessaria !== null) partes.push(`necessário ${formatarNumero(i.necessaria)}`);
  if (i.separada !== null) partes.push(`separado ${formatarNumero(i.separada)}`);
  partes.push(`falta ${formatarQtd(i.falta, i.un, i.faltaG)}`);
  return partes.join(' · ');
}
