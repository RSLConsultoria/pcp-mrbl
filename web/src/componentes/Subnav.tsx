import { Icone } from './Icone';

export function Subnav({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  return (
    <div className="soc-subnav subnav">
      <label className="busca">
        <Icone nome="search" tamanho={15} />
        <input type="search" aria-label="Buscar" placeholder="Buscar OS, peça, cliente, responsável ou material"
          value={q} onChange={(e) => onQ(e.target.value)} />
      </label>
      <div className="soc-subnav__spacer" />
    </div>
  );
}
