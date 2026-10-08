// Guias que funcionam. O hash da URL guarda a guia para o recarregar voltar nela.
export type Tela = 'ploomes' | 'saidas' | 'pedidos';

const HASH: Record<Tela, string> = { ploomes: '', saidas: '#saidas', pedidos: '#pedidos' };

export function telaDoHash(hash: string): Tela {
  const h = (hash ?? '').toLowerCase();
  if (h === HASH.saidas) return 'saidas';
  if (h === HASH.pedidos) return 'pedidos';
  return 'ploomes';
}

export function hashDaTela(t: Tela): string {
  return HASH[t];
}

export const BUSCA_DA_TELA: Record<Tela, string> = {
  ploomes: 'Buscar OS, peça, cliente ou material',
  saidas: 'Buscar OS, peça, cliente ou material',
  pedidos: 'Buscar item, OS, fornecedor ou pedido'
};
