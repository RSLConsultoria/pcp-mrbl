import type { Item } from '../api/tipos';

export function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// "<qtd> <un>": cones vai para o singular em 1 (1 cone, 2 cones, 1,5 cones); UN, MT, G ficam como estão.
export function qtdComUn(qtd: number, un: string): string {
  const num = formatarNumero(qtd);
  if (!un) return num;
  if (!/^cones?$/i.test(un)) return `${num} ${un}`;
  const singular = un.slice(0, 4);
  const plural = singular + (singular === singular.toUpperCase() ? 'S' : 's');
  return `${num} ${num === '1' ? singular : plural}`;
}

// Linha e fio chegam em cones com o peso em gramas ao lado (faltaG).
export function formatarQtd(qtd: number | null, un: string, g: number | null): string {
  if (qtd === null) return '—';
  const base = qtdComUn(qtd, un);
  return g !== null && g > 0 ? `${base} · ${formatarNumero(g)} g` : base;
}

export function contaDoItem(i: Item): string {
  if (i.falta === null) return 'falta não informada';
  return [
    `faltava ${formatarQtd(i.falta, i.un, i.faltaG)}`,
    `baixado ${formatarNumero(i.baixada)}`,
    `resta ${formatarQtd(i.resta, i.un, i.restaG)}`
  ].join(' · ');
}

// Número pronto para um campo de texto editável: vírgula decimal, sem separador de milhar.
export function quantidadeParaCampo(n: number | null): string {
  return n === null ? '' : String(n).replace('.', ',');
}
