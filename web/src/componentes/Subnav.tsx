import type { ReactNode } from 'react';
import { Icone } from './Icone';

interface Props { q: string; onQ: (v: string) => void; placeholder: string; children?: ReactNode }

// Barra clara: busca à esquerda e as ações da tela à direita.
export function Subnav({ q, onQ, placeholder, children }: Props) {
  return (
    <div className="barra">
      <label className="busca">
        <Icone nome="search" tamanho={16} />
        <input type="search" aria-label="Buscar" placeholder={placeholder}
          value={q} onChange={(e) => onQ(e.target.value)} />
      </label>
      {children && <div className="barra__direita">{children}</div>}
    </div>
  );
}
