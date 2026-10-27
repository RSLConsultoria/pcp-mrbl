import { hashDaPeca } from '../regras/telas';

// Leva à Visão da peça (#peca/<OS>), na mesma aba: o hash troca a guia.
export function LinkPeca({ os, className = 'painel__link', rotulo, onClick }: { os: string; className?: string; rotulo?: string; onClick?: () => void }) {
  if (!os.trim()) return null;
  return <a className={className} href={hashDaPeca(os)} onClick={onClick}>{rotulo ?? 'Ver visão da peça'}</a>;
}
