import type { Item } from '../api/tipos';
import { formatarNumero } from './quantidade';

// Aceita vírgula ou ponto como separador decimal.
function lerQuantidade(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validarBaixa(qtdTexto: string, item: Item): string | null {
  const qtd = lerQuantidade(qtdTexto);
  if (qtd === null || qtd <= 0) return 'Informe uma quantidade maior que zero';
  if (item.resta === null) return 'Item sem quantidade faltante registrada.';
  if (qtd > item.resta) return `Falta só ${formatarNumero(item.resta)} ${item.un}`.trimEnd();
  return null;
}
