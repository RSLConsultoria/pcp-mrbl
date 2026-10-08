import { useEffect } from 'react';

// Esc fecha o painel lateral. As janelas param o Esc antes de ele chegar aqui.
export function useTeclaEsc(aoEsc: () => void) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoEsc();
    };
    document.addEventListener('keydown', aoTecla);
    return () => document.removeEventListener('keydown', aoTecla);
  }, [aoEsc]);
}
