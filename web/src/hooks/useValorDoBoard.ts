import { useCallback, useRef, useState } from 'react';

// Valor novo do board substitui o do campo, exceto enquanto a pessoa digita nele
// (campo com foco e valor já diferente do último que veio do board).
export function adotarDoBoard<T>(valor: T, base: T, focado: boolean): boolean {
  return !focado || Object.is(valor, base);
}

// Valor de um campo editável: mostra o valor novo na hora (otimista), volta ao valor do
// board quando o servidor recusa e acompanha o board quando ele muda (recarga ou outra pessoa).
// O quarto item marca o foco do campo, para a recarga não atropelar a digitação.
export function useValorDoBoard<T>(doBoard: T) {
  const [valor, setValor] = useState(doBoard);
  const [base, setBase] = useState(doBoard);
  const [focado, setFocado] = useState(false);
  if (!Object.is(base, doBoard)) {
    setBase(doBoard);
    if (adotarDoBoard(valor, base, focado)) setValor(doBoard);
  }
  const ref = useRef(doBoard);
  ref.current = doBoard;
  const reverter = useCallback(() => setValor(ref.current), []);
  return [valor, setValor, reverter, setFocado] as const;
}
