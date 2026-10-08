import type { CSSProperties, DragEvent } from 'react';
import type { Pedido } from '../../api/tipos';
import { ddmm } from '../../regras/datas';
import { nomeLocal, nomeOrigem, quemDoPedido, rotuloDoPedido } from '../../regras/pedidos';
import { previsaoMaisProxima, previsoesDiferentes, qtdOsDoPedido, textoFamilia } from '../../regras/pedidosQuadro';
import { qtdComUn } from '../../regras/quantidade';

const ITENS_NO_CARD = 3;

interface Props {
  pedido: Pedido;
  partes: number; // quantas partes saíram deste pedido (dividir pedido)
  selecionado: boolean;
  arrastavel: boolean;
  onAbrir: () => void;
  onArrastar: (id: string | null) => void;
}

// Card do pedido: o botão do título abre o painel (e cobre o card todo). A previsão mostrada
// é a mais próxima dos itens; com datas diferentes, o selo "previsões diferentes". Pedido
// provisório (gerado ou dividido agora, ainda indo para o servidor) aparece "salvando…" e
// só abre depois que a recarga trouxer o pedido gravado.
export function CardPedido({ pedido: p, partes, selecionado, arrastavel, onAbrir, onArrastar }: Props) {
  const visiveis = p.itens.slice(0, ITENS_NO_CARD);
  const ocultos = p.itens.length - visiveis.length;
  const quem = quemDoPedido(p);
  const cliente = p.origem === 'CLIENTE';
  const familia = textoFamilia(p, partes);
  const previsao = previsaoMaisProxima(p);
  const diferentes = previsoesDiferentes(p);
  const rotulo = rotuloDoPedido(p.id);
  return (
    <article aria-label={`Pedido ${rotulo}`} aria-busy={p.provisorio ? true : undefined}
      className={['card card--pedido', selecionado && 'card--selecionado', p.provisorio && 'card--salvando'].filter(Boolean).join(' ')}
      draggable={arrastavel}
      style={{ '--cor-tipo': cliente ? 'var(--signal)' : 'var(--navy)' } as CSSProperties}
      onDragStart={(e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastar(p.id);
      }}
      onDragEnd={() => onArrastar(null)}>
      <div className="card__cabeca">
        <button type="button" className="card__abrir card__os" aria-pressed={selecionado} aria-label={`Pedido ${rotulo}`}
          disabled={p.provisorio} onClick={onAbrir}>
          {rotulo}
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
      {diferentes && (
        <div className="card__selos">
          <span className="selo-dias" title="Os itens deste pedido têm previsões de entrega diferentes">previsões diferentes</span>
        </div>
      )}
      <div className="card__rodape">
        <span className={previsao ? 'card__prev' : undefined}>{previsao ? `previsão ${ddmm(previsao)}` : 'sem previsão'}</span>
        <span>{nomeLocal(p.local)}</span>
        <span title="Registro de interação gravado em cada OS do pedido">Ploomes · {qtdOsDoPedido(p)} OS</span>
      </div>
      {p.provisorio && (
        <footer className="card__acoes">
          <span className="card__estado card__estado--salvando">salvando…</span>
        </footer>
      )}
      {p.baixadoEm && !p.provisorio && (
        <footer className="card__acoes">
          <span className="card__estado card__estado--ok">Baixa registrada nas caixas em {ddmm(p.baixadoEm)}</span>
        </footer>
      )}
    </article>
  );
}
