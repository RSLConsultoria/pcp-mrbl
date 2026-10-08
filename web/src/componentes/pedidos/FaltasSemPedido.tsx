import type { FaltaSemPedido } from '../../regras/pedidos';
import { chaveItem } from '../../regras/pedidosQuadro';
import { formatarQtd } from '../../regras/quantidade';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

interface Props {
  grupos: FaltaSemPedido[];
  selecao: Set<string>;
  temBusca: boolean;
  onMarcar: (chaves: string[], marcar: boolean) => void;
}

// Coluna da esquerda: itens abertos sem pedido, por caixa, para montar um pedido.
export function FaltasSemPedido({ grupos, selecao, temBusca, onMarcar }: Props) {
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);
  const marcados = grupos.reduce((n, g) => n + g.itens.filter((i) => selecao.has(chaveItem(g.caixa.dealId, i.id))).length, 0);
  return (
    <aside className="reserva" aria-label="Faltas sem pedido">
      <div className="reserva__topo">
        <div className="reserva__linha">
          <h2 className="reserva__titulo">Faltas sem pedido</h2>
          <span className={marcados ? 'reserva__contagem reserva__contagem--ativa' : 'reserva__contagem'} aria-live="polite">
            {marcados ? `${marcados} ${marcados > 1 ? 'selecionados' : 'selecionado'}` : `${total} ${total === 1 ? 'item' : 'itens'}`}
          </span>
        </div>
        <p className="reserva__ajuda">Itens em aberto que ainda não estão em nenhum pedido. Marque itens de uma ou várias OS e clique em Gerar pedido.</p>
      </div>
      <div className="reserva__lista">
        {grupos.map((g) => {
          const chaves = g.itens.map((i) => chaveItem(g.caixa.dealId, i.id));
          const n = chaves.filter((k) => selecao.has(k)).length;
          return (
            <section key={g.caixa.id} className="grupo">
              <label className="grupo__cabeca">
                <input type="checkbox" checked={n === chaves.length} aria-label={`Todos os itens da OS ${g.caixa.os}`}
                  ref={(el) => { if (el) el.indeterminate = n > 0 && n < chaves.length; }}
                  onChange={(e) => onMarcar(chaves, e.target.checked)} />
                <span className="grupo__os">{g.caixa.os}</span>
                <span className="grupo__peca">{g.caixa.peca}</span>
                <span className="grupo__tipo" title={nomeDoTipo(g.caixa.tipo)}>
                  <i style={{ background: corDoTipo(g.caixa.tipo) }} />
                </span>
              </label>
              <ul className="grupo__itens">
                {g.itens.map((i) => {
                  const k = chaveItem(g.caixa.dealId, i.id);
                  return (
                    <li key={i.id}>
                      <label className="grupo__item">
                        <input type="checkbox" checked={selecao.has(k)} onChange={(e) => onMarcar([k], e.target.checked)} />
                        <span className="grupo__nome">{i.nome}{i.cor && <span className="card__item-cor"> {i.cor}</span>}</span>
                        <span className="grupo__qtd">{formatarQtd(i.resta, i.un, i.restaG)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {grupos.length === 0 && (
          <div className="coluna__vazio">
            {temBusca ? 'Nenhuma falta sem pedido atende à busca.' : 'Toda falta em aberto já está em algum pedido. Novas faltas registradas no almoxarifado aparecem aqui.'}
          </div>
        )}
      </div>
    </aside>
  );
}
