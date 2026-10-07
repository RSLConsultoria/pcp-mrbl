import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, buscarBoard } from '../api/client';
import type { Board } from '../api/tipos';

const INTERVALO_MS = 60_000;

export function useBoard(token: string, aoExpirar: () => void) {
  const [board, setBoard] = useState<Board | null>(null);
  const [erroDesde, setErroDesde] = useState<Date | null>(null);
  const [carregando, setCarregando] = useState(true);
  const aoExpirarRef = useRef(aoExpirar);
  aoExpirarRef.current = aoExpirar;

  const geracaoRef = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = geracaoRef.current;
    try {
      const b = await buscarBoard(token);
      if (minha !== geracaoRef.current) return;
      setBoard(b);
      setErroDesde(null);
    } catch (e) {
      if (minha !== geracaoRef.current) return;
      if (e instanceof ApiError && e.status === 401) {
        aoExpirarRef.current();
        return;
      }
      setErroDesde((d) => d ?? new Date());
    } finally {
      if (minha === geracaoRef.current) setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    geracaoRef.current += 1;
    void recarregar();
    const id = window.setInterval(() => void recarregar(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      geracaoRef.current += 1;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [recarregar]);

  return { board, erroDesde, carregando, recarregar };
}
