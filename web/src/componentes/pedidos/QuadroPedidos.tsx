import { useState, type DragEvent } from 'react';
import type { Acao, Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import type { FiltroPedidos } from '../../regras/pedidos';
import { pedidoEditavel, pedidosForaDasEtapas, podeDarBaixa, vazioDaEtapa } from '../../regras/pedidosQuadro';
import { ColunaQuadro } from '../ColunaQuadro';
import { CardPedido } from './CardPedido';

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

// Quadro de pedidos por etapa, com arrastar e soltar entre as colunas.
export function QuadroPedidos({ board, etapas, pedidos, filtro, temBusca, selId, executar, onAbrir }: Props) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [movidos, setMovidos] = useState<Record<string, string>>({}); // etapa mostrada enquanto o servidor grava
  const [baixando, setBaixando] = useState<string | null>(null);
  const etapaDe = (p: Pedido) => movidos[p.id] ?? p.etapa;
  const origem = arrastando ? pedidos.find((p) => p.id === arrastando) : undefined;
  const etapaDeOrigem = origem ? etapaDe(origem) : null;

  async function mover(id: string, etapaId: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p || etapaDe(p) === etapaId || !pedidoEditavel(board, p)) return;
    const acao: Acao = { tipo: 'mover_pedido', pedidoId: p.id, versao: p.versao, etapa: etapaId };
    setMovidos((m) => ({ ...m, [id]: etapaId }));
    await executar(acao, mensagemSucesso(acao, undefined, { etapa: etapas.find((e) => e.id === etapaId)?.nome }));
    setMovidos((m) => {
      const resto = { ...m };
      delete resto[id];
      return resto;
    });
  }

  async function baixar(p: Pedido) {
    const acao: Acao = { tipo: 'baixar_pedido', pedidoId: p.id, versao: p.versao };
    setBaixando(p.id);
    await executar(acao, mensagemSucesso(acao));
    setBaixando(null);
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
      if (id) void mover(id, etapaId);
    }
  });

  const card = (p: Pedido) => {
    const editavel = pedidoEditavel(board, p);
    return (
      <CardPedido key={p.id} pedido={p} selecionado={p.id === selId} arrastavel={editavel}
        podeBaixar={editavel && etapaDe(p) === p.etapa && podeDarBaixa(p, etapas)} baixando={baixando === p.id}
        onAbrir={() => onAbrir(p.id === selId ? null : p.id)} onArrastar={setArrastando} onBaixar={() => baixar(p)} />
    );
  };
  // Pedido cuja etapa saiu do quadro continua à vista, numa coluna no fim.
  const fora = pedidosForaDasEtapas(pedidos, etapas, etapaDe);

  return (
    <div className="quadro__rolagem">
      <div className="quadro__trilho">
        {etapas.map((et, idx) => {
          const ps = pedidos.filter((p) => etapaDe(p) === et.id);
          return (
            <ColunaQuadro key={et.id} nome={et.nome} cor={idx === etapas.length - 1 ? 'var(--success)' : 'var(--navy)'} qtd={ps.length}
              vazio={vazioDaEtapa(filtro, idx, etapas.length, temBusca)}
              alvo={sobre === et.id && arrastando !== null && etapaDeOrigem !== et.id}
              soltar={soltarEm(et.id)}>
              {ps.map(card)}
            </ColunaQuadro>
          );
        })}
        {fora.length > 0 && (
          <ColunaQuadro nome="Outra etapa" cor="var(--leve)" qtd={fora.length} vazio="">
            {fora.map(card)}
          </ColunaQuadro>
        )}
        {etapas.length === 0 &&<div className="coluna__vazio quadro__sem-etapas">Nenhuma etapa configurada. Use Etapas do quadro para criar as etapas.</div>}
      </div>
    </div>
  );
}
