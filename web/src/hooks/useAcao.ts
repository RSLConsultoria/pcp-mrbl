import { useCallback, useRef } from 'react';
import { enviarAcao } from '../api/client';
import type { Acao, RespostaAcao } from '../api/tipos';
import type { Avisar } from '../componentes/Aviso';
import { chaveDaAcao, desfechoDoErro, gravarRecente, versaoAtual } from '../regras/acoes';

export type Executar = (acao: Acao, mensagemSucesso: string | ((r: RespostaAcao) => string)) => Promise<boolean>;

interface Opcoes {
  token: string;
  recarregar: () => Promise<void>;
  aoExpirar: () => void;
  avisar: Avisar;
}

// Envia as ações em fila, uma por vez, e espera o board recarregar entre elas.
// Assim, salvar uma observação ao sair do campo e clicar num botão logo em seguida
// não perde o clique nem gera conflito com a nossa própria gravação.
// Devolve false quando não salvou, para o campo voltar ao valor anterior.
// O clique duplo em botões é barrado em cada formulário (estado "enviando" local).
export function useAcao({ token, recarregar, aoExpirar, avisar }: Opcoes) {
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const trocas = useRef(new Map<string, Map<string, string>>());
  const aoExpirarRef = useRef(aoExpirar);
  aoExpirarRef.current = aoExpirar;

  const enviar = useCallback(async (acao: Acao, mensagemSucesso: string | ((r: RespostaAcao) => string)): Promise<boolean> => {
    const chave = chaveDaAcao(acao);
    const versao = 'versao' in acao ? versaoAtual(acao.versao, trocas.current.get(chave)) : '';
    try {
      const r = await enviarAcao(token, 'versao' in acao ? { ...acao, versao } : acao);
      if (r.versao !== versao) {
        // Só as ~50 trocas mais recentes importam: as antigas já chegaram pela recarga.
        const t = trocas.current.get(chave) ?? new Map<string, string>();
        gravarRecente(t, versao, r.versao);
        gravarRecente(trocas.current, chave, t);
      }
      avisar(typeof mensagemSucesso === 'function' ? mensagemSucesso(r) : mensagemSucesso);
      await recarregar();
      return true;
    } catch (e) {
      const d = desfechoDoErro(e);
      if (d.tipo === 'expirou') {
        aoExpirarRef.current();
      } else if (d.tipo === 'conflito') {
        avisar(d.texto, 'erro');
        await recarregar();
      } else {
        avisar(d.texto, 'erro');
      }
      return false;
    }
  }, [token, recarregar, avisar]);

  return useCallback<Executar>((acao, mensagemSucesso) => {
    const vez = fila.current.then(() => enviar(acao, mensagemSucesso));
    fila.current = vez;
    return vez;
  }, [enviar]);
}
