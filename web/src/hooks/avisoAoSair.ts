import { useEffect } from 'react';

type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

function aoSair(e: Event) {
  e.preventDefault();
  (e as BeforeUnloadEvent).returnValue = ''; // navegadores mais antigos só olham este campo
}

// Liga o aviso nativo do navegador ("Sair do site? As alterações podem não ser salvas") e
// devolve a função que o desliga.
export function ligarAvisoAoSair(alvo: Alvo): () => void {
  alvo.addEventListener('beforeunload', aoSair);
  return () => alvo.removeEventListener('beforeunload', aoSair);
}

// Enquanto houver gravação na fila, recarregar ou fechar a aba pede confirmação: a fila mora
// só na memória e o que não chegou ao servidor se perderia. A fila não é guardada para ser
// reenviada depois da recarga (risco de gravar duas vezes).
export function useAvisoAoSair(ativo: boolean) {
  useEffect(() => (ativo ? ligarAvisoAoSair(window) : undefined), [ativo]);
}
