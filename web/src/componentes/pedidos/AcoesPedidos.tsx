import type { FiltroPedidos } from '../../regras/pedidos';
import { Icone } from '../Icone';

const FILTROS: { id: FiltroPedidos; nome: string }[] = [
  { id: 'aberto', nome: 'Em aberto' },
  { id: 'finalizado', nome: 'Finalizados' },
  { id: 'todos', nome: 'Todos' }
];

interface Props {
  filtro: FiltroPedidos;
  onFiltro: (f: FiltroPedidos) => void;
  selecionados: number;
  onEtapas: () => void;
  onGerar: () => void;
}

// Lado direito da barra em Solicitações de faltas.
export function AcoesPedidos({ filtro, onFiltro, selecionados, onEtapas, onGerar }: Props) {
  return (
    <>
      <div className="segmentado" role="group" aria-label="Mostrar pedidos">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => onFiltro(f.id)}>{f.nome}</button>
        ))}
      </div>
      <button type="button" className="botao botao--contorno botao--icone" onClick={onEtapas}>
        <Icone nome="config" tamanho={15} />Etapas do quadro
      </button>
      <button type="button" className="botao botao--signal" disabled={selecionados === 0} onClick={onGerar}
        title={selecionados === 0 ? 'Marque itens em Faltas sem pedido' : undefined}>
        Gerar pedido
      </button>
    </>
  );
}
