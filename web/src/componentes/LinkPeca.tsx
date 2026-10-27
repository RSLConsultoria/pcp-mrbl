import { hashDaPeca } from '../regras/telas';

// Leva à Visão da peça (#peca/<OS>), na mesma aba: o hash troca a guia.
export function LinkPeca({ os, className = 'painel__link', rotulo }: { os: string; className?: string; rotulo?: string }) {
  if (!os.trim()) return null;
  return <a className={className} href={hashDaPeca(os)}>{rotulo ?? 'Ver visão da peça'}</a>;
}
