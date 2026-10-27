// Guias que funcionam. O hash da URL guarda a guia para o recarregar voltar nela.
// Visão da peça: #peca ou #peca/<OS ou referência>.
export type Tela = 'ploomes' | 'saidas' | 'pedidos' | 'producao' | 'peca';

const HASH: Record<Tela, string> = { ploomes: '', saidas: '#saidas', pedidos: '#pedidos', producao: '#producao', peca: '#peca' };

export function telaDoHash(hash: string): Tela {
  const h = (hash ?? '').toLowerCase();
  if (h === HASH.saidas) return 'saidas';
  if (h === HASH.pedidos) return 'pedidos';
  if (h === HASH.producao) return 'producao';
  if (h === HASH.peca || h.startsWith(`${HASH.peca}/`)) return 'peca';
  return 'ploomes';
}

export function hashDaTela(t: Tela): string {
  return HASH[t];
}

// O que vem depois de #peca/ (OS ou referência), decodificado.
export function buscaDaPeca(hash: string): string {
  const m = /^#peca\/(.+)$/i.exec(hash ?? '');
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return '';
  }
}

export function hashDaPeca(q: string): string {
  return `${HASH.peca}/${encodeURIComponent(q.trim())}`;
}

export const BUSCA_DA_TELA: Record<Tela, string> = {
  ploomes: 'Buscar OS, peça, cliente ou material',
  saidas: 'Buscar OS, peça, cliente ou material',
  pedidos: 'Buscar item, OS, fornecedor ou pedido',
  producao: 'Buscar OS, peça, referência, cliente ou oficina',
  peca: 'OS ou referência'
};
