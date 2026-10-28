import type { CSSProperties } from 'react';
import type { Caixa } from '../../api/tipos';
import { formatarQtd } from '../../regras/quantidade';
import { diasDesdeSaida, parteEntregue, rotuloDaSaida, seloSaidaVermelho, situacaoDoItemNaParte, textoSaiu, type ParteSaida } from '../../regras/saidas';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

const ITENS_NO_CARD = 3;
const CLASSE_SITUACAO = { pedido: 'card__pedido', sem_pedido: 'card__pedido card__pedido--sem', resolvido: 'card__pedido card__pedido--ok' } as const;

interface Props {
  caixa: Caixa;
  parte: ParteSaida;
  final: boolean; // a parte está na etapa final (o destino confirmou)
  hoje: Date;
  selecionada: boolean;
  onAbrir: () => void;
}

// Card de uma parte da caixa: só os itens daquela etapa, com a quantidade e os pedidos.
export function CardSaida({ caixa, parte, final, hoje, selecionada, onAbrir }: Props) {
  const visiveis = parte.itens.slice(0, ITENS_NO_CARD);
  const ocultos = parte.itens.length - visiveis.length;
  const atrasada = !final && seloSaidaVermelho(diasDesdeSaida(caixa, hoje));
  const rotulo = rotuloDaSaida({ caixa, parte });
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${rotulo}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      style={{ '--cor-tipo': corDoTipo(caixa.tipo) } as CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <span className="card__os">{rotulo}</span>
      <div className="card__peca">{caixa.peca}</div>
      <div className="card__meta">{[caixa.cliente, nomeDoTipo(caixa.tipo)].filter(Boolean).join(' · ')}</div>
      <div className="card__selos">
        <span className={atrasada ? 'selo-dias selo-dias--atrasado' : 'selo-dias'}>{textoSaiu(caixa, hoje)}</span>
      </div>
      <ul className="card__itens">
        {visiveis.map((x) => {
          const situacao = situacaoDoItemNaParte(x);
          return (
            <li key={x.item.id} className="card__item card__item--duplo">
              <span className="card__item-linha">
                <span className="card__item-nome">{x.item.nome}{x.item.cor && <span className="card__item-cor"> {x.item.cor}</span>}</span>
                {!(situacao.tipo === 'resolvido' && x.qtd === null) &&
                  <span className="card__item-qtd">{formatarQtd(x.qtd, x.item.un, parte.coluna === 'sem_pedido' ? x.item.restaG : null)}</span>}
              </span>
              <span className={CLASSE_SITUACAO[situacao.tipo]}>{situacao.texto}</span>
            </li>
          );
        })}
        {ocultos > 0 && <li className="card__mais">+ {ocultos} {ocultos > 1 ? 'itens' : 'item'}</li>}
      </ul>
      {final && parteEntregue(parte) && <div className="card__rodape"><span className="card__estado card__estado--ok">material entregue no destino</span></div>}
    </div>
  );
}
