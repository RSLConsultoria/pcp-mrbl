import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, buscarBoard } from '../api/client';
import type { Board } from '../api/tipos';
import { criarSequencia } from './sequencia';

const INTERVALO_MS = 60_000;

// marcoAtual: marco da fila de ações quando a leitura começa (hooks/filaAcoes.ts). Vai junto
// com o board para a tela saber quais ações confirmadas ele já traz.
export function useBoard(token: string, aoExpirar: () => void, marcoAtual: () => number = () => 0) {
  const [lido, setLido] = useState<{ board: Board | null; marco: number }>({ board: null, marco: 0 });
  const [erroDesde, setErroDesde] = useState<Date | null>(null);
  const [carregando, setCarregando] = useState(true);
  const aoExpirarRef = useRef(aoExpirar);
  aoExpirarRef.current = aoExpirar;

  const marcoRef = useRef(marcoAtual);
  marcoRef.current = marcoAtual;
  const geracaoRef = useRef(0);
  const [sequencia] = useState(criarSequencia);

  const recarregar = useCallback(async () => {
    const minha = geracaoRef.current;
    const maisRecente = sequencia.nova();
    // Vale só a resposta da recarga mais nova, e só enquanto o token é o mesmo.
    const vale = () => minha === geracaoRef.current && maisRecente();
    const marco = marcoRef.current();
    try {
      const b = await buscarBoard(token);
      if (!vale()) return;
      setLido({ board: b, marco });
      setErroDesde(null);
    } catch (e) {
      if (!vale()) return;
      if (e instanceof ApiError && e.status === 401) {
        aoExpirarRef.current();
        return;
      }
      setErroDesde((d) => d ?? new Date());
    } finally {
      if (vale()) setCarregando(false);
    }
  }, [token, sequencia]);

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

  return { board: lido.board, marco: lido.marco, erroDesde, carregando, recarregar };
}
