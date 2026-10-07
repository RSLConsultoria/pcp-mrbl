export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

const TIPOS: Record<string, { nome: string; cor: string }> = {
  ACABAMENTO: { nome: 'Acabamento', cor: 'var(--tipo-acabamento)' },
  COSTURA: { nome: 'Costura', cor: 'var(--tipo-costura)' },
  PREPARACAO: { nome: 'Preparação', cor: 'var(--fog)' }
};

export function nomeDoTipo(tipo: string): string {
  if (!tipo) return 'Caixa';
  return TIPOS[tipo]?.nome ?? tipo.charAt(0) + tipo.slice(1).toLowerCase();
}

export function corDoTipo(tipo: string): string {
  return TIPOS[tipo]?.cor ?? 'var(--fog)';
}
