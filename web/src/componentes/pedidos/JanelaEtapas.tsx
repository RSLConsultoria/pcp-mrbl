import { useRef, useState } from 'react';
import type { Acao, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { validarEtapas } from '../../regras/pedidos';
import { motivoTravaEtapa } from '../../regras/pedidosQuadro';
import { Janela } from '../Janela';

interface Rascunho { chave: number; id?: string; nome: string }

interface Props {
  etapas: EtapaPedido[]; // já ordenadas
  pedidos: Pedido[];
  executar: Executar;
  onFechar: () => void;
}

// Renomear, adicionar e remover etapas do quadro de pedidos. A última etapa
// (Resolvido: mover um pedido para ela dá baixa) fica fixa no fim: pode ser
// renomeada, mas não removida, e as etapas novas entram antes dela.
export function JanelaEtapas({ etapas, pedidos, executar, onFechar }: Props) {
  const proxima = useRef(etapas.length);
  const lista = useRef<HTMLOListElement>(null);
  const [rascunho, setRascunho] = useState<Rascunho[]>(() => etapas.map((e, i) => ({ chave: i, id: e.id, nome: e.nome })));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const mudar = (chave: number, nome: string) => {
    setErro(null);
    setRascunho((r) => r.map((x) => (x.chave === chave ? { ...x, nome } : x)));
  };
  const adicionar = () => {
    setErro(null);
    const chave = proxima.current++;
    setRascunho((r) => [...r.slice(0, -1), { chave, nome: '' }, ...r.slice(-1)]);
    requestAnimationFrame(() => lista.current?.querySelector<HTMLInputElement>(`li[data-chave="${chave}"] input`)?.focus());
  };

  async function salvar() {
    const corpo = rascunho.map((x) => ({ ...(x.id ? { id: x.id } : {}), nome: x.nome.trim() }));
    const e = validarEtapas(corpo, pedidos, etapas);
    if (e) { setErro(e); return; }
    const acao: Acao = { tipo: 'salvar_etapas', etapas: corpo };
    setEnviando(true);
    const ok = await executar(acao, mensagemSucesso(acao));
    setEnviando(false);
    if (ok) onFechar();
  }

  return (
    <Janela titulo="Etapas do quadro" sobretitulo="Quadro de pedidos" onFechar={onFechar}
      rodape={<>
        <button type="button" className="botao botao--leve" onClick={onFechar}>Cancelar</button>
        <button type="button" className="botao botao--navy" disabled={enviando} onClick={salvar}>Salvar etapas</button>
      </>}>
      <p className="janela__ajuda">A primeira etapa recebe os pedidos gerados. A última fica sempre no fim: mover um pedido para ela dá baixa nas caixas. Etapa com pedido aberto não pode ser removida.</p>
      <ol ref={lista} className="etapas">
        {rascunho.map((x, i) => {
          const final = i === rascunho.length - 1;
          const trava = motivoTravaEtapa(x.id, rascunho.length, pedidos);
          return (
            <li key={x.chave} data-chave={x.chave} className="etapas__linha">
              <span className="etapas__n" aria-hidden="true">{i + 1}</span>
              <input type="text" maxLength={40} value={x.nome} aria-label={`Nome da etapa ${i + 1}`}
                onChange={(e) => mudar(x.chave, e.target.value)} />
              {!final && (
                <button type="button" className="botao botao--leve etapas__remover" disabled={trava !== null}
                  title={trava ?? 'Remover etapa'} aria-label={`Remover etapa ${x.nome.trim() || i + 1}`}
                  onClick={() => { setErro(null); setRascunho((r) => r.filter((y) => y.chave !== x.chave)); }}>
                  Remover
                </button>
              )}
              {final && <span className="etapas__final">Etapa final: mover um pedido para cá dá baixa nas caixas.</span>}
              {!final && trava && x.id && pedidos.some((p) => !p.finalizado && p.etapa === x.id) && <span className="etapas__trava">{trava}</span>}
            </li>
          );
        })}
      </ol>
      <button type="button" className="botao botao--contorno etapas__adicionar" onClick={adicionar}>+ Adicionar etapa</button>
      {erro && <p className="campo__erro" role="alert">{erro}</p>}
    </Janela>
  );
}
