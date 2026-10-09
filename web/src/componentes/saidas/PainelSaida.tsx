import type { Caixa, EtapaPedido } from '../../api/tipos';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import { itensParaPedido, nomeColunaSaida, textoSaiu, type ParteSaida } from '../../regras/saidas';
import { CabecalhoCaixa } from '../painel/CabecalhoCaixa';
import { Historico } from '../painel/Historico';
import { ItemSaida } from './ItemSaida';

interface Props {
  caixa: Caixa;
  parte: ParteSaida;
  etapas: EtapaPedido[];
  hoje: Date;
  editavel: boolean;
  onSelecionarParaPedido: (c: Caixa) => void;
  onFechar: () => void;
}

// Painel de uma parte da caixa que saiu com falta: os itens daquela etapa (só leitura) e o
// histórico da caixa. Em "Sem pedido", o passo seguinte é selecionar os itens para um pedido.
export function PainelSaida({ caixa, parte, etapas, hoje, editavel, onSelecionarParaPedido, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const paraPedido = parte.coluna === 'sem_pedido' ? itensParaPedido(caixa).length : 0;
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <CabecalhoCaixa caixa={caixa} onFechar={onFechar} />
      <div className="painel__corpo">
        {!editavel && <p className="item__nota" role="note">{MSG_SOMENTE_LEITURA}</p>}
        <dl className="leitura">
          <div><dt>Etapa</dt><dd>{nomeColunaSaida(parte.coluna, etapas)}{parte.total > 1 && ` · parte ${parte.indice} de ${parte.total}`}</dd></div>
          <div><dt>Saída</dt><dd>{textoSaiu(caixa, hoje)}</dd></div>
          <div><dt>Responsável</dt><dd>{caixa.responsavel || '—'}</dd></div>
        </dl>
        {editavel && paraPedido > 0 && (
          <section className="secao">
            <h3 className="secao__titulo">O que fazer</h3>
            <div className="acoes">
              <button type="button" className="botao botao--navy" onClick={() => onSelecionarParaPedido(caixa)}>
                Selecionar para pedido
              </button>
            </div>
          </section>
        )}
        <section className="secao">
          <h3 className="secao__titulo">Itens desta etapa <span>{parte.itens.length}</span></h3>
          <ul className="itens">
            {parte.itens.map((x) => <ItemSaida key={x.item.id} x={x} />)}
          </ul>
        </section>
        <Historico entradas={caixa.historico ?? []} />
      </div>
    </aside>
  );
}
