import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError, perguntarAssistente } from '../api/client';
import type { Board, MensagemAssistente } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { cancelarCartao, conversar, EXEMPLOS_ASSISTENTE, executarFerramenta, osConhecidas, partesComOs, type CartaoCobranca as Cartao } from '../regras/assistente';
import { diaIso } from '../regras/datas';
import { hashDaPeca, type Tela } from '../regras/telas';
import { CartaoCobranca } from './CartaoCobranca';
import { Icone } from './Icone';

const ERRO_PADRAO = 'Não consegui responder agora. Tente de novo.';

type NovoItem = { tipo: 'usuario' | 'assistente' | 'erro'; texto: string } | { tipo: 'cobranca'; cartao: Cartao };
type Item = NovoItem & { id: number };

interface Props {
  board: Board;
  token: string;
  aberto: boolean;
  executar: Executar;
  aoExpirar: () => void;
  onFechar: () => void;
  onAbrirTela: (tela: Tela, os: string) => void;
  onLinkOs: () => void; // celular: o painel cobre a tela; sai da frente ao seguir um link
}

function TextoComOs({ texto, conhecidas, onLinkOs }: { texto: string; conhecidas: Set<string>; onLinkOs: () => void }) {
  return <>{partesComOs(texto, conhecidas).map((p, i) => ('os' in p
    ? <a key={i} href={hashDaPeca(p.os)} onClick={onLinkOs}>{p.os}</a>
    : <span key={i}>{p.texto}</span>))}</>;
}

// Painel do Assistente (F5d): chat que consulta o board já carregado, abre telas e prepara
// cobranças. A conversa fica só na memória (o painel continua montado quando fechado e
// some ao recarregar ou sair). Nada é enviado sem o "Confirmar e enviar" do cartão.
export function Assistente({ board, token, aberto, executar, aoExpirar, onFechar, onAbrirTela, onLinkOs }: Props) {
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [rascunho, setRascunho] = useState('');
  const [pensando, setPensando] = useState(false);
  const atual = useRef({ board, mensagens });
  atual.current = { board, mensagens };
  const seq = useRef(0);
  const ocupado = useRef(false); // trava síncrona: duplo clique não abre duas conversas
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const conhecidas = osConhecidas(board);

  // Rola só quando entra item novo (editar ou marcar uma linha do cartão não pula para o fim).
  useEffect(() => { fim.current?.scrollIntoView?.({ block: 'end' }); }, [itens.length, pensando]);
  useEffect(() => { if (aberto) campo.current?.focus(); }, [aberto]);

  const novoItem = (i: NovoItem) => {
    const id = ++seq.current;
    setItens((lista) => [...lista, { ...i, id }]);
  };

  const perguntar = async (texto: string) => {
    const t = texto.trim();
    if (!t || ocupado.current) return;
    ocupado.current = true;
    const historico: MensagemAssistente[] = [...atual.current.mensagens, { papel: 'usuario', texto: t }];
    setMensagens(historico);
    novoItem({ tipo: 'usuario', texto: t });
    setRascunho('');
    setPensando(true);
    const agora = new Date();
    const hoje = diaIso(agora);
    // O cartão só aparece se a pergunta terminar: com erro no meio, nada fica confirmável.
    const cartoes: Cartao[] = [];
    try {
      const r = await conversar(historico, (m) => perguntarAssistente(token, hoje, m), (chamada) => {
        const ex = executarFerramenta(atual.current.board, chamada, hoje, agora, `cartao-${++seq.current}`);
        if (ex.efeito?.tipo === 'abrir') onAbrirTela(ex.efeito.tela, ex.efeito.os);
        if (ex.efeito?.tipo === 'cobranca') cartoes.push(ex.efeito.cartao);
        return ex.resultado;
      });
      setMensagens([...historico, ...r.novas]);
      if (cartoes.length) {
        // Um cartão aberto por vez: os anteriores ainda abertos viram só leitura (sem cobrança em dobro).
        setItens((lista) => lista.map((i) => (i.tipo === 'cobranca' && i.cartao.estado === 'aberto' ? { ...i, cartao: cancelarCartao(i.cartao) } : i)));
        for (const c of cartoes) novoItem({ tipo: 'cobranca', cartao: c });
      }
      novoItem({ tipo: 'assistente', texto: r.texto });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return aoExpirar();
      // A pergunta fica na conversa; o que veio no meio é descartado.
      novoItem({ tipo: 'erro', texto: e instanceof ApiError && e.status === 429 ? e.message : ERRO_PADRAO });
    } finally {
      ocupado.current = false;
      setPensando(false);
    }
  };

  const aoEnviar = (e: FormEvent) => { e.preventDefault(); void perguntar(rascunho); };
  const aoTecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void perguntar(rascunho);
    }
  };
  const mudarCartao = (id: number, c: Cartao) => setItens((lista) => lista.map((i) => (i.id === id && i.tipo === 'cobranca' ? { ...i, cartao: c } : i)));

  return (
    <aside id="assistente" className="assistente" aria-label="Assistente" hidden={!aberto}>
      <header className="assistente__cabecalho">
        <span className="assistente__titulo"><Icone nome="ai" tamanho={18} /><h2>Assistente</h2></span>
        <button type="button" className="assistente__fechar" aria-label="Fechar assistente" onClick={onFechar}>×</button>
      </header>
      <div className="assistente__conversa" role="log" aria-live="polite" aria-label="Conversa com o assistente">
        <div className="assistente__msg assistente__msg--assistente">
          Pergunte sobre OS, faltas, pedidos e prazos. Também abro telas e preparo cobranças para as oficinas: nada é enviado sem a sua confirmação.
        </div>
        <div className="assistente__exemplos">
          {EXEMPLOS_ASSISTENTE.map((x) => <button key={x} type="button" disabled={pensando} onClick={() => void perguntar(x)}>{x}</button>)}
        </div>
        {itens.map((i) => i.tipo === 'cobranca'
          ? <CartaoCobranca key={i.id} cartao={i.cartao} board={board} executar={executar} onMudar={(c) => mudarCartao(i.id, c)} onLinkOs={onLinkOs} />
          : <div key={i.id} className={`assistente__msg assistente__msg--${i.tipo}`} role={i.tipo === 'erro' ? 'alert' : undefined}>
            {i.tipo === 'assistente' ? <TextoComOs texto={i.texto} conhecidas={conhecidas} onLinkOs={onLinkOs} /> : i.texto}
          </div>)}
        {pensando && <p className="assistente__pensando">pensando…</p>}
        <div ref={fim} />
      </div>
      <form className="assistente__entrada" onSubmit={aoEnviar}>
        <textarea ref={campo} rows={2} maxLength={2000} value={rascunho} placeholder="Pergunte ao assistente"
          aria-label="Pergunta ao assistente" onChange={(e) => setRascunho(e.target.value)} onKeyDown={aoTecla} />
        <button type="submit" className="botao botao--signal" disabled={pensando || !rascunho.trim()}>Enviar</button>
      </form>
    </aside>
  );
}
