import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type TipoAviso = 'ok' | 'erro';
export type Avisar = (texto: string, tipo?: TipoAviso) => void;

const DURACAO_MS = 3400;

const AvisoContexto = createContext<Avisar>(() => {});

export function useAviso(): Avisar {
  return useContext(AvisoContexto);
}

// Aviso de uma linha no rodapé. O mais novo substitui o anterior.
export function AvisoProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ texto: string; tipo: TipoAviso; n: number } | null>(null);

  const avisar = useCallback<Avisar>((texto, tipo = 'ok') => {
    setAviso((a) => ({ texto, tipo, n: (a?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(null), DURACAO_MS);
    return () => window.clearTimeout(id);
  }, [aviso]);

  return (
    <AvisoContexto.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {aviso && <div key={aviso.n} className={`aviso aviso--${aviso.tipo}`}>{aviso.texto}</div>}
      </div>
    </AvisoContexto.Provider>
  );
}
