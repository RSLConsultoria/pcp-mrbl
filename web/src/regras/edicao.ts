import type { Board, Caixa } from '../api/tipos';

export const MSG_SOMENTE_LEITURA = 'Edição liberada em breve para esta caixa.';

// Até o go-live o servidor libera só algumas caixas; lista ausente ou vazia = todas.
export function caixaEditavelNoApp(board: Pick<Board, 'dealsEditaveis'>, caixa: Pick<Caixa, 'dealId'>): boolean {
  const lista = board.dealsEditaveis;
  return !lista || lista.length === 0 || lista.includes(caixa.dealId);
}
