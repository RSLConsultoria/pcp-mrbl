import type { FaltaSemPedido } from '../../regras/pedidos';
import { chaveItem, textoContagemFaltas } from '../../regras/pedidosQuadro';
import { formatarQtd } from '../../regras/quantidade';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

const ID_TITULO = 'faltas-sem-pedido-titulo';
const ID_LISTA = 'faltas-sem-pedido-lista';

// Depois de gerar um pedido o botão Gerar pedido fica desabilitado: o foco vem para o
// título desta coluna (ou para o botão do trilho, quando ela está recolhida).
export function focoDepoisDeGerar(): HTMLElement | null {
  const titulo = document.getElementById(ID_TITULO);
  if (titulo && titulo.offsetParent !== null) return titulo;
  return document.querySelector<HTMLElement>('.reserva__trilho button');
}

interface Props {
  grupos: FaltaSemPedido[]; // já filtrados pela busca
  selecao: Set<string>;
  marcados: number; // todos os marcados, inclusive os que a busca esconde
  temBusca: boolean;
  recolhivel: boolean; // painel do pedido aberto: abaixo de 1366px a coluna vira um trilho
  expandida: boolean;
  onExpandir: (sim: boolean) => void;
  onMarcar: (chaves: string[], marcar: boolean) => void;
}

// Coluna da esquerda: itens abertos sem pedido, por caixa, para montar um pedido.
export function FaltasSemPedido({ grupos, selecao, marcados, temBusca, recolhivel, expandida, onExpandir, onMarcar }: Props) {
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);
  const visiveis = grupos.reduce((n, g) => n + g.itens.filter((i) => selecao.has(chaveItem(g.caixa.dealId, i.id))).length, 0);
  const contagem = textoContagemFaltas(total, marcados, visiveis);
  const classe = ['reserva', recolhivel && 'reserva--recolhivel', recolhivel && expandida && 'reserva--expandida'].filter(Boolean).join(' ');
  return (
    <aside className={classe} aria-label="Faltas sem pedido">
      {recolhivel && (
        <div className="reserva__trilho">
          <button type="button" className="reserva__alternar" aria-expanded={false} aria-controls={ID_LISTA}
            aria-label="Mostrar faltas sem pedido" title="Mostrar faltas sem pedido" onClick={() => onExpandir(true)}>
            <span className="reserva__seta" aria-hidden="true">›</span>
            <span className="reserva__vertical">Faltas sem pedido</span>
            {marcados > 0 && <span className="reserva__contagem reserva__contagem--ativa">{marcados}</span>}
          </button>
        </div>
      )}
      <div className="reserva__topo">
        <div className="reserva__linha">
          <h2 id={ID_TITULO} className="reserva__titulo" tabIndex={-1}>Faltas sem pedido</h2>
          <span className={marcados ? 'reserva__contagem reserva__contagem--ativa' : 'reserva__contagem'} aria-live="polite">
            {contagem}
          </span>
          {recolhivel && (
            <button type="button" className="botao botao--leve reserva__recolher" aria-expanded={true} aria-controls={ID_LISTA}
              onClick={() => onExpandir(false)}>
              Recolher
            </button>
          )}
        </div>
        <p className="reserva__ajuda">Itens em aberto que ainda não estão em nenhum pedido. Marque itens de uma ou várias OS e clique em Gerar pedido.</p>
      </div>
      <div id={ID_LISTA} className="reserva__lista">
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
