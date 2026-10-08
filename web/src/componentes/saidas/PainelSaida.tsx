import type { Caixa, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { itemAberto } from '../../regras/colunas';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import { nomeColunaSaida, textoSaiu, textoTratativa, type ColunaDaSaida } from '../../regras/saidas';
import { CabecalhoCaixa } from '../painel/CabecalhoCaixa';
import { Historico } from '../painel/Historico';
import { AcoesSaida } from './AcoesSaida';
import { ItemSaida } from './ItemSaida';

interface Props {
  caixa: Caixa;
  coluna: ColunaDaSaida;
  pedidos: Pedido[];
  etapas: EtapaPedido[];
  hoje: Date;
  editavel: boolean;
  executar: Executar;
  onSelecionarParaPedido: (c: Caixa) => void;
  onFechar: () => void;
}

export function PainelSaida({ caixa, coluna, pedidos, etapas, hoje, editavel, executar, onSelecionarParaPedido, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const itens = [...caixa.itens].sort((a, b) => Number(itemAberto(b)) - Number(itemAberto(a)));
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <CabecalhoCaixa caixa={caixa} onFechar={onFechar} />
      <div className="painel__corpo">
        {!editavel && <p className="item__nota" role="note">{MSG_SOMENTE_LEITURA}</p>}
        <dl className="leitura">
          <div><dt>Etapa</dt><dd>{nomeColunaSaida(coluna.coluna, etapas)}{coluna.etapasDiferentes && ' · pedidos em etapas diferentes'}</dd></div>
          <div><dt>Saída</dt><dd>{textoSaiu(caixa, hoje)}</dd></div>
          <div><dt>Oficina</dt><dd>{textoTratativa(caixa)}</dd></div>
          <div><dt>Responsável</dt><dd>{caixa.responsavel || '—'}</dd></div>
        </dl>
        {editavel && (
          <AcoesSaida key={caixa.versao} caixa={caixa} coluna={coluna.coluna} pedidos={pedidos} etapas={etapas} executar={executar} onSelecionarParaPedido={onSelecionarParaPedido} />
        )}
        <section className="secao">
          <h3 className="secao__titulo">Itens <span>{itens.length}</span></h3>
          <ul className="itens">
            {itens.map((i) => <ItemSaida key={i.id} item={i} pedidos={pedidos} etapas={etapas} />)}
          </ul>
          {itens.length === 0 && <p className="vazio">Nenhum item registrado nesta caixa.</p>}
        </section>
        <Historico entradas={caixa.historico ?? []} />
      </div>
    </aside>
  );
}
