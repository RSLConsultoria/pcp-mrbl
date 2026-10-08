import type { CSSProperties, DragEvent } from 'react';
import type { Pedido } from '../../api/tipos';
import { ddmm } from '../../regras/datas';
import { nomeLocal, nomeOrigem, quemDoPedido } from '../../regras/pedidos';
import { qtdOsDoPedido, textoFamilia } from '../../regras/pedidosQuadro';
import { qtdComUn } from '../../regras/quantidade';
import { ConfirmarBaixa } from './ConfirmarBaixa';

const ITENS_NO_CARD = 3;

interface Props {
  pedido: Pedido;
  partes: number; // quantas partes saíram deste pedido (dividir pedido)
  selecionado: boolean;
  arrastavel: boolean;
  podeBaixar: boolean;
  baixando: boolean;
  onAbrir: () => void;
  onArrastar: (id: string | null) => void;
  onBaixar: () => Promise<void>;
}

// Card do pedido: o botão do título abre o painel (e cobre o card todo); a baixa fica no
// rodapé, fora desse botão.
export function CardPedido({ pedido: p, partes, selecionado, arrastavel, podeBaixar, baixando, onAbrir, onArrastar, onBaixar }: Props) {
  const visiveis = p.itens.slice(0, ITENS_NO_CARD);
  const ocultos = p.itens.length - visiveis.length;
  const quem = quemDoPedido(p);
  const cliente = p.origem === 'CLIENTE';
  const familia = textoFamilia(p, partes);
  return (
    <article aria-label={`Pedido ${p.id}`}
      className={selecionado ? 'card card--pedido card--selecionado' : 'card card--pedido'} draggable={arrastavel}
      style={{ '--cor-tipo': cliente ? 'var(--signal)' : 'var(--navy)' } as CSSProperties}
      onDragStart={(e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastar(p.id);
      }}
      onDragEnd={() => onArrastar(null)}>
      <div className="card__cabeca">
        <button type="button" className="card__abrir card__os" aria-pressed={selecionado} aria-label={`Pedido ${p.id}`} onClick={onAbrir}>
          {p.id}
        </button>
        <span className={cliente ? 'selo-origem selo-origem--cliente' : 'selo-origem'}>{nomeOrigem(p.origem)}</span>
      </div>
      {quem && <div className="card__peca">{quem}</div>}
      {familia && <div className="card__familia">{familia}</div>}
      <ul className="card__itens">
        {visiveis.map((i) => (
          <li key={i.itemId} className="card__item">
            <span className="card__item-nome">{i.nome}</span>
            <span className="card__item-meta">{i.qtd !== null ? qtdComUn(i.qtd, i.un) : '—'} · OS {i.os}</span>
          </li>
        ))}
        {ocultos > 0 && <li className="card__mais">+ {ocultos} {ocultos > 1 ? 'itens' : 'item'}</li>}
      </ul>
      <div className="card__rodape">
        <span className={p.previsao ? 'card__prev' : undefined}>{p.previsao ? `previsão ${ddmm(p.previsao)}` : 'sem previsão'}</span>
        <span>{nomeLocal(p.local)}</span>
        <span title="Registro de interação gravado em cada OS do pedido">Ploomes · {qtdOsDoPedido(p)} OS</span>
      </div>
      {(podeBaixar || p.baixadoEm) && (
        <footer className="card__acoes">
          {podeBaixar && <ConfirmarBaixa pedido={p} baixando={baixando} onBaixar={onBaixar} />}
          {p.baixadoEm && <span className="card__estado card__estado--ok">Baixa registrada nas caixas em {ddmm(p.baixadoEm)}</span>}
        </footer>
      )}
    </article>
  );
}
