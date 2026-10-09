import { useState, type DragEvent } from 'react';
import type { Acao, Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { PREFIXO_NOVO, etapaDaBaixa, type FiltroPedidos } from '../../regras/pedidos';
import {
  entraNaEtapaDaBaixa, etapaNoQuadro, motivoMoverPedido, partesDoPedido, pedidoArrastavel, pedidosForaDasEtapas, textoConfirmarBaixa, vazioDaEtapa
} from '../../regras/pedidosQuadro';
import { useAviso } from '../Aviso';
import { ColunaQuadro } from '../ColunaQuadro';
import { CardPedido } from './CardPedido';
import { ConfirmarResolvido } from './ConfirmarResolvido';

interface Props {
  board: Board;
  etapas: EtapaPedido[]; // já ordenadas
  pedidos: Pedido[]; // já filtrados
  filtro: FiltroPedidos;
  temBusca: boolean;
  selId: string | null;
  executar: Executar;
  onAbrir: (id: string | null) => void;
}

// Quadro de pedidos por etapa, com arrastar e soltar entre as colunas. A penúltima etapa
// (Enviado ao destino final) dá a baixa nas caixas: soltar um card nela pede confirmação. Com a
// baixa, o pedido só vai para a última (Concluído: o destino confirmou), que finaliza. O card muda
// de coluna na hora (board otimista); a gravação segue na fila, sem travar o próximo arraste.
export function QuadroPedidos({ board, etapas, pedidos, filtro, temBusca, selId, executar, onAbrir }: Props) {
  const avisar = useAviso();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [pendente, setPendente] = useState<string | null>(null); // pedido aguardando a confirmação da baixa
  const baixa = etapaDaBaixa(etapas);
  const etapaDe = (p: Pedido) => etapaNoQuadro(p, etapas);
  const origem = arrastando ? pedidos.find((p) => p.id === arrastando) : undefined;
  const etapaDeOrigem = origem ? etapaDe(origem) : null;
  const pedPendente = pendente ? pedidos.find((p) => p.id === pendente) : undefined;

  function mover(id: string, etapaId: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p || etapaDe(p) === etapaId || !pedidoArrastavel(board, p)) return;
    const acao: Acao = { tipo: 'mover_pedido', pedidoId: p.id, versao: p.versao, etapa: etapaId };
    void executar(acao, mensagemSucesso(acao, undefined, { etapa: etapas.find((e) => e.id === etapaId)?.nome, baixa: etapaId === baixa?.id }));
  }

  function soltar(id: string, etapaId: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p || etapaDe(p) === etapaId || !pedidoArrastavel(board, p)) return;
    if (etapaId.startsWith(PREFIXO_NOVO)) return; // etapa nova ainda gravando: o servidor não a conhece
    const motivo = motivoMoverPedido(p, etapaId, etapas);
    if (motivo) { avisar(motivo, 'erro'); return; }
    if (entraNaEtapaDaBaixa(etapaDe(p), etapaId, etapas)) { setPendente(id); return; }
    mover(id, etapaId);
  }

  function confirmar() {
    if (!pedPendente || !baixa) return;
    mover(pedPendente.id, baixa.id);
    setPendente(null);
  }

  const soltarEm = (etapaId: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!arrastando || etapaDeOrigem === etapaId) return; // a coluna de onde o card saiu não é destino
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (sobre !== etapaId) setSobre(etapaId);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre((s) => (s === etapaId ? null : s));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || arrastando;
      setSobre(null);
      setArrastando(null);
      if (id) soltar(id, etapaId);
    }
  });

  const card = (p: Pedido) => (
    <CardPedido key={p.id} pedido={p} partes={partesDoPedido(board.pedidos ?? [], p.id).length} selecionado={p.id === selId}
      arrastavel={pedidoArrastavel(board, p)} onAbrir={() => onAbrir(p.id === selId ? null : p.id)} onArrastar={setArrastando} />
  );
  // Pedido cuja etapa saiu do quadro continua à vista, numa coluna no fim.
  const fora = pedidosForaDasEtapas(pedidos, etapas, etapaDe);

  return (
    <div className="quadro__rolagem">
      <div className="quadro__trilho">
        {etapas.map((et, idx) => {
          const ps = pedidos.filter((p) => etapaDe(p) === et.id);
          const ehUltima = idx === etapas.length - 1;
          return (
            <ColunaQuadro key={et.id} nome={et.nome} cor={ehUltima ? 'var(--success)' : 'var(--navy)'} qtd={ps.length}
              vazio={vazioDaEtapa(filtro, idx, etapas.length, temBusca)}
              alvo={sobre === et.id && arrastando !== null && etapaDeOrigem !== et.id}
              soltar={soltarEm(et.id)}>
              {et.id === baixa?.id && pedPendente && (
                <ConfirmarResolvido rotulo={`Confirmar ${et.nome} do ${pedPendente.id}`}
                  texto={textoConfirmarBaixa(pedPendente.itens, et.nome)} ocupado={false}
                  onConfirmar={confirmar} onCancelar={() => setPendente(null)} />
              )}
              {ps.map(card)}
            </ColunaQuadro>
          );
        })}
        {fora.length > 0 && (
          <ColunaQuadro nome="Outra etapa" cor="var(--leve)" qtd={fora.length} vazio="">
            {fora.map(card)}
          </ColunaQuadro>
        )}
        {etapas.length === 0 && <div className="coluna__vazio quadro__sem-etapas">Nenhuma etapa configurada. Use Etapas do quadro para criar as etapas.</div>}
      </div>
    </div>
  );
}
