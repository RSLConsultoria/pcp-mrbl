import { Icone } from './Icone';

export function Subnav({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  return (
    <div className="barra">
      <label className="busca">
        <Icone nome="search" tamanho={16} />
        <input type="search" aria-label="Buscar" placeholder="Buscar OS, peça, cliente ou material"
          value={q} onChange={(e) => onQ(e.target.value)} />
      </label>
      <div className="legenda" aria-hidden="true">
        <span><i style={{ background: 'var(--tipo-costura)' }} />Costura</span>
        <span><i style={{ background: 'var(--tipo-acabamento)' }} />Acabamento</span>
      </div>
    </div>
  );
}
