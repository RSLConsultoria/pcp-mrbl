import type { DragEvent, ReactNode } from 'react';

export interface Soltar {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

interface Props {
  nome: string;
  cor: string;
  qtd: number;
  vazio: string;
  alvo?: boolean; // coluna de destino de um arraste
  soltar?: Soltar;
  children: ReactNode;
}

// Coluna de quadro no padrão do No Ploomes: ponto, nome e contagem no topo.
export function ColunaQuadro({ nome, cor, qtd, vazio, alvo, soltar, children }: Props) {
  return (
    <section className={alvo ? 'coluna coluna--alvo' : 'coluna'} aria-label={nome} {...soltar}>
      <header className="coluna__cabecalho">
        <span className="coluna__ponto" style={{ background: cor }} />
        <span className="coluna__nome">{nome}</span>
        <span className="coluna__qtd">{qtd}</span>
      </header>
      <div className="coluna__cards">
        {children}
        {qtd === 0 && <div className="coluna__vazio">{vazio}</div>}
      </div>
    </section>
  );
}
