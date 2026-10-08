import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Board } from '../api/tipos';
import { FaltasSemPedido } from '../componentes/pedidos/FaltasSemPedido';
import { JanelaEtapas } from '../componentes/pedidos/JanelaEtapas';
import { JanelaGerarPedido } from '../componentes/pedidos/JanelaGerarPedido';
import { PainelPedido } from '../componentes/pedidos/PainelPedido';
import { QuadroPedidos } from '../componentes/pedidos/QuadroPedidos';
import type { Executar } from '../hooks/useAcao';
import { caixaAtendeBusca } from '../regras/busca';
import { faltasSemPedido, filtrarPedidos, type FiltroPedidos } from '../regras/pedidos';
import { etapasOrdenadas, itensSelecionados, pedidoAtendeBusca } from '../regras/pedidosQuadro';

export type JanelaPedidos = 'gerar' | 'etapas' | null;

interface Props {
  board: Board;
  q: string;
  filtro: FiltroPedidos;
  janela: JanelaPedidos;
  selecao: Set<string>;
  executar: Executar;
  onJanela: (j: JanelaPedidos) => void;
  onSelecao: Dispatch<SetStateAction<Set<string>>>;
}

export function Pedidos({ board, q, filtro, janela, selecao, executar, onJanela, onSelecao }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const [faltasExpandidas, setFaltasExpandidas] = useState(false);
  const fechar = useCallback(() => setSelId(null), []);
  const fecharJanela = useCallback(() => onJanela(null), [onJanela]);
  const etapas = useMemo(() => etapasOrdenadas(board.etapasPedido ?? []), [board.etapasPedido]);
  const todos = useMemo(() => board.pedidos ?? [], [board.pedidos]);
  const pedidos = useMemo(() => filtrarPedidos(todos, filtro).filter((p) => pedidoAtendeBusca(p, q)), [todos, filtro, q]);
  const faltas = useMemo(() => faltasSemPedido(board), [board]);
  const grupos = useMemo(() => faltas.filter((g) => caixaAtendeBusca(g.caixa, q)), [faltas, q]);
  const selecionados = useMemo(() => itensSelecionados(board, selecao), [board, selecao]);
  const sel = todos.find((p) => p.id === selId) ?? null;

  const marcar = (chaves: string[], sim: boolean) => {
    const s = new Set(selecao);
    for (const k of chaves) if (sim) s.add(k); else s.delete(k);
    onSelecao(s);
  };

  return (
    <div className="pedidos">
      <FaltasSemPedido grupos={grupos} selecao={selecao} marcados={selecionados.length} temBusca={q.trim() !== ''}
        recolhivel={sel !== null} expandida={faltasExpandidas} onExpandir={setFaltasExpandidas} onMarcar={marcar} />
      <div className="quadro">
        <QuadroPedidos board={board} etapas={etapas} pedidos={pedidos} filtro={filtro} temBusca={q.trim() !== ''}
          selId={selId} executar={executar} onAbrir={setSelId} />
        {sel && (
          <PainelPedido key={`${sel.id}:${sel.versao}`} pedido={sel} board={board} etapas={etapas}
            executar={executar} onFechar={fechar} />
        )}
      </div>
      {janela === 'gerar' && (
        <JanelaGerarPedido itens={selecionados} usuarios={board.usuarios ?? []} executar={executar}
          onRemover={(k) => marcar([k], false)} onGerado={(chaves) => onSelecao((s) => {
            const resto = new Set(s);
            for (const k of chaves) resto.delete(k);
            return resto;
          })} onFechar={fecharJanela} />
      )}
      {janela === 'etapas' && <JanelaEtapas etapas={etapas} pedidos={todos} executar={executar} onFechar={fecharJanela} />}
    </div>
  );
}
