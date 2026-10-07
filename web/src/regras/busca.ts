import type { Caixa } from '../api/tipos';

export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function caixaAtendeBusca(c: Caixa, q: string): boolean {
  const termo = normalizar(q);
  if (!termo) return true;
  const campos = [c.os, c.referencia, c.peca, c.cliente, c.responsavel, ...c.itens.flatMap((i) => [i.nome, i.cor])];
  return campos.some((x) => normalizar(x).includes(termo));
}
