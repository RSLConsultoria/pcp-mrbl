import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { enviarAcao } from '../api/client';
import type { Acao, Board, RespostaAcao } from '../api/tipos';
import type { Avisar } from '../componentes/Aviso';
import { desfechoDoErro } from '../regras/acoes';
import { diaIso } from '../regras/datas';
import { aplicarPendentes, pendentesVivos } from '../regras/otimista';
import { useAvisoAoSair } from './avisoAoSair';
import type { Fila } from './filaAcoes';

// Põe a ação na fila e devolve na hora: o board da tela já mostra o efeito dela. A promessa
// resolve quando o servidor responde (true = gravou; false = recusou e a tela voltou atrás).
// Formulários não esperam por ela: fecham logo e deixam a próxima ação livre.
export type Executar = (acao: Acao, mensagemSucesso: string | ((r: RespostaAcao) => string)) => Promise<boolean>;

interface Opcoes {
  fila: Fila;
  token: string;
  board: Board | null; // o do servidor
  marco: number; // marco da fila quando esse board foi pedido
  recarregar: () => Promise<void>;
  aoExpirar: () => void;
  avisar: Avisar;
}

// Liga a fila de ações à tela. A fila envia uma por vez, em segundo plano (a versão de cada
// ação depende da anterior), e o board só é relido uma vez, quando ela esvazia. Enquanto isso
// a tela mostra o board do servidor com as ações pendentes por cima; a recarga do minuto
// não apaga o que ainda não chegou ao servidor. Recusa: a ação sai da tela e o aviso de erro
// aparece; conflito (409) relê o board; sessão expirada sai do app.
export function useAcao({ fila, token, board, marco, recarregar, aoExpirar, avisar }: Opcoes) {
  const atual = useRef({ token, recarregar, aoExpirar, avisar });
  atual.current = { token, recarregar, aoExpirar, avisar };

  useState(() => fila.configurar({
    enviar: (acao) => enviarAcao(atual.current.token, acao),
    aoFalhar: (e) => {
      const d = desfechoDoErro(e);
      if (d.tipo === 'expirou') {
        atual.current.aoExpirar();
        return 'parar';
      }
      atual.current.avisar(d.texto, 'erro');
      if (d.tipo === 'conflito') void atual.current.recarregar();
      return 'seguir';
    },
    aoEsvaziar: () => void atual.current.recarregar()
  }));

  const pendentes = useSyncExternalStore(fila.assinar, fila.pendentes);

  // Board novo: as confirmadas que ele já traz saem da fila.
  useEffect(() => {
    if (board) fila.podar(board, marco);
  }, [fila, board, marco]);

  const hoje = diaIso(new Date());
  const tela = useMemo(
    () => (board ? aplicarPendentes(board, pendentesVivos(pendentes, board, marco), hoje) : null),
    [board, pendentes, marco, hoje]
  );

  const executar = useCallback<Executar>(async (acao, mensagemSucesso) => {
    const r = await fila.adicionar(acao);
    if (!r) return false;
    atual.current.avisar(typeof mensagemSucesso === 'function' ? mensagemSucesso(r) : mensagemSucesso);
    return true;
  }, [fila]);

  const salvando = pendentes.some((p) => p.estado !== 'confirmada');
  useAvisoAoSair(salvando); // recarregar ou fechar a aba com gravação na fila pede confirmação
  return { board: tela, executar, salvando };
}
