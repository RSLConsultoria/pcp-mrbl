// Guias que funcionam. O hash da URL guarda a guia para o recarregar voltar nela.
export type Tela = 'ploomes' | 'saidas' | 'pedidos' | 'producao';

const HASH: Record<Tela, string> = { ploomes: '', saidas: '#saidas', pedidos: '#pedidos', producao: '#producao' };

export function telaDoHash(hash: string): Tela {
  const h = (hash ?? '').toLowerCase();
  if (h === HASH.saidas) return 'saidas';
  if (h === HASH.pedidos) return 'pedidos';
  if (h === HASH.producao) return 'producao';
  return 'ploomes';
}

export function hashDaTela(t: Tela): string {
  return HASH[t];
}

export const BUSCA_DA_TELA: Record<Tela, string> = {
  ploomes: 'Buscar OS, peça, cliente ou material',
  saidas: 'Buscar OS, peça, cliente ou material',
  pedidos: 'Buscar item, OS, fornecedor ou pedido',
  producao: 'Buscar OS, peça, referência, cliente ou oficina'
};
