import { useCallback, useRef, useState } from 'react';

// Valor de um campo editável: mostra o valor novo na hora (otimista), volta ao valor do
// board quando o servidor recusa e acompanha o board quando ele muda (recarga ou outra pessoa).
export function useValorDoBoard<T>(doBoard: T) {
  const [valor, setValor] = useState(doBoard);
  const [base, setBase] = useState(doBoard);
  if (!Object.is(base, doBoard)) {
    setBase(doBoard);
    setValor(doBoard);
  }
  const ref = useRef(doBoard);
  ref.current = doBoard;
  const reverter = useCallback(() => setValor(ref.current), []);
  return [valor, setValor, reverter] as const;
}
