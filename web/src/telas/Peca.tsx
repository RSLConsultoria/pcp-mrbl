import type { Board } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';

export interface PropsPeca { board: Board; token: string; hoje: Date; executar: Executar; aoExpirar: () => void }

export function Peca(_props: PropsPeca) {
  return <div className="peca"><p className="peca__vazio">Visão da peça</p></div>;
}
