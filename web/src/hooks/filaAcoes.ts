import type { Acao, Board, RespostaAcao } from '../api/tipos';
import { chaveDaAcao, gravarRecente, versaoAtual } from '../regras/acoes';
import { pendentesVivos, type Pendente } from '../regras/otimista';

// O que fazer depois de uma recusa: seguir com a fila ou parar (sessão expirada: o resto
// da fila é descartado).
export type DepoisDoErro = 'seguir' | 'parar';

export interface GanchosFila {
  enviar: (acao: Acao) => Promise<RespostaAcao>;
  aoFalhar: (e: unknown, acao: Acao) => DepoisDoErro;
  aoEsvaziar: () => void; // a fila terminou: hora de reler o board uma vez
}

export interface Fila {
  configurar(g: GanchosFila): void;
  // Entra no fim da fila; resolve com a resposta do servidor, ou null se não gravou.
  adicionar(acao: Acao): Promise<RespostaAcao | null>;
  pendentes(): readonly Pendente[];
  assinar(ouvinte: () => void): () => void;
  // Número que sobe a cada confirmação: o board pedido depois dele já traz a ação.
  marco(): number;
  // Tira as confirmadas que o board já mostra.
  podar(board: Board, marco: number): void;
}

// Fila de ações, uma por vez e na ordem: a versão de cada uma depende da anterior.
// A tela não espera a fila: cada ação já aparece no board (regras/otimista.ts) e fica
// pendente até o servidor confirmar e a recarga trazer o board com ela.
export function criarFila(): Fila {
  let ganchos: GanchosFila | null = null;
  let lista: readonly Pendente[] = [];
  let proximo = 1;
  let relogio = 0;
  let rodando = false;
  const ouvintes = new Set<() => void>();
  const finais = new Map<number, (r: RespostaAcao | null) => void>();
  // Versões trocadas por ações nossas (antiga → nova), por alvo: as ações enfileiradas
  // levam a versão que a tela viu e seguem a troca até a mais recente.
  const trocas = new Map<string, Map<string, string>>();

  function publicar(nova: readonly Pendente[]) {
    lista = nova;
    for (const o of ouvintes) o();
  }
  const mudar = (id: number, m: Partial<Pendente>) => publicar(lista.map((p) => (p.id === id ? { ...p, ...m } : p)));
  function concluir(id: number, r: RespostaAcao | null) {
    finais.get(id)?.(r);
    finais.delete(id);
  }

  async function rodar() {
    if (rodando || !ganchos) return;
    rodando = true;
    let parou = false;
    for (let p = lista.find((x) => x.estado === 'fila'); p && ganchos; p = lista.find((x) => x.estado === 'fila')) {
      const chave = chaveDaAcao(p.acao);
      const acao: Acao = 'versao' in p.acao ? { ...p.acao, versao: versaoAtual(p.acao.versao, trocas.get(chave)) } : p.acao;
      mudar(p.id, { estado: 'enviando' });
      try {
        const r = await ganchos.enviar(acao);
        if ('versao' in acao && r.versao !== acao.versao) {
          // Só as ~50 trocas mais recentes importam: as antigas já chegaram pela recarga.
          const t = trocas.get(chave) ?? new Map<string, string>();
          gravarRecente(t, acao.versao, r.versao);
          gravarRecente(trocas, chave, t);
        }
        relogio += 1;
        mudar(p.id, { estado: 'confirmada', confirmadaEm: relogio, versaoNova: r.versao });
        concluir(p.id, r);
      } catch (e) {
        const id = p.id;
        publicar(lista.filter((x) => x.id !== id)); // desfaz a mudança na tela
        const depois = ganchos.aoFalhar(e, p.acao);
        concluir(id, null);
        if (depois === 'parar') {
          const resto = lista.filter((x) => x.estado === 'fila');
          publicar(lista.filter((x) => x.estado !== 'fila'));
          for (const x of resto) concluir(x.id, null);
          parou = true;
          break;
        }
      }
    }
    rodando = false;
    if (!parou) ganchos?.aoEsvaziar();
  }

  return {
    configurar(g) {
      ganchos = g;
      if (lista.some((x) => x.estado === 'fila')) void rodar();
    },
    adicionar(acao) {
      const id = proximo++;
      const pronto = new Promise<RespostaAcao | null>((ok) => finais.set(id, ok));
      publicar([...lista, { id, acao, estado: 'fila', confirmadaEm: 0 }]);
      void rodar();
      return pronto;
    },
    pendentes: () => lista,
    assinar(o) {
      ouvintes.add(o);
      return () => { ouvintes.delete(o); };
    },
    marco: () => relogio,
    podar(board, marco) {
      const vivos = pendentesVivos(lista, board, marco);
      if (vivos.length !== lista.length) publicar(vivos);
    }
  };
}
