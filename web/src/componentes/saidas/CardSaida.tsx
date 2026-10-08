import type { CSSProperties } from 'react';
import type { Caixa, EtapaPedido, Pedido } from '../../api/tipos';
import { itensAbertos } from '../../regras/colunas';
import { pedidosDoItem } from '../../regras/pedidos';
import { formatarQtd } from '../../regras/quantidade';
import { diasDesdeSaida, seloSaidaVermelho, TEXTO_ETAPAS_DIFERENTES, textoParcial, textoPedidoDoItem, textoSaiu, type ColunaDaSaida } from '../../regras/saidas';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

const ITENS_NO_CARD = 3;

interface Props {
  caixa: Caixa;
  coluna: ColunaDaSaida;
  pedidos: Pedido[];
  etapas: EtapaPedido[];
  hoje: Date;
  selecionada: boolean;
  onAbrir: () => void;
}

export function CardSaida({ caixa, coluna, pedidos, etapas, hoje, selecionada, onAbrir }: Props) {
  const abertos = itensAbertos(caixa);
  const visiveis = abertos.slice(0, ITENS_NO_CARD);
  const ocultos = abertos.length - visiveis.length;
  const resolvida = coluna.coluna === 'resolvido';
  const atrasada = !resolvida && seloSaidaVermelho(diasDesdeSaida(caixa, hoje));
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${caixa.os}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      style={{ '--cor-tipo': corDoTipo(caixa.tipo) } as CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <span className="card__os">{caixa.os}</span>
      <div className="card__peca">{caixa.peca}</div>
      <div className="card__meta">{[caixa.cliente, nomeDoTipo(caixa.tipo)].filter(Boolean).join(' · ')}</div>
      <div className="card__selos">
        <span className={atrasada ? 'selo-dias selo-dias--atrasado' : 'selo-dias'}>{textoSaiu(caixa, hoje)}</span>
        {coluna.parcial && (
          <span className="selo-dias" title="Parte dos itens já tem pedido">{textoParcial(coluna.parcial)}</span>
        )}
        {coluna.etapasDiferentes && (
          <span className="selo-dias" title="A caixa fica na etapa do pedido mais atrasado">{TEXTO_ETAPAS_DIFERENTES}</span>
        )}
      </div>

      {visiveis.length > 0 && (
        <ul className="card__itens">
          {visiveis.map((i) => (
            <li key={i.id} className="card__item card__item--duplo">
              <span className="card__item-linha">
                <span className="card__item-nome">{i.nome}{i.cor && <span className="card__item-cor"> {i.cor}</span>}</span>
                <span className="card__item-qtd">{formatarQtd(i.resta, i.un, i.restaG)}</span>
              </span>
              <span className={pedidosDoItem(i).length > 0 ? 'card__pedido' : 'card__pedido card__pedido--sem'}>
                {textoPedidoDoItem(i, pedidos, etapas)}
              </span>
            </li>
          ))}
          {ocultos > 0 && <li className="card__mais">+ {ocultos} {ocultos > 1 ? 'itens' : 'item'}</li>}
        </ul>
      )}
      {resolvida && <div className="card__rodape"><span className="card__estado card__estado--ok">falta resolvida</span></div>}
    </div>
  );
}
