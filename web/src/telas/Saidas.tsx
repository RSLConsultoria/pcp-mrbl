import { useCallback, useMemo, useState } from 'react';
import type { Board, Caixa } from '../api/tipos';
import { ColunaQuadro } from '../componentes/ColunaQuadro';
import { CardSaida } from '../componentes/saidas/CardSaida';
import { PainelSaida } from '../componentes/saidas/PainelSaida';
import type { Executar } from '../hooks/useAcao';
import { caixaAtendeBusca } from '../regras/busca';
import { caixaEditavelNoApp } from '../regras/edicao';
import { COLUNAS_SAIDA, saidasComColuna } from '../regras/saidas';

interface Props {
  board: Board;
  q: string;
  hoje: Date;
  executar: Executar;
  onSelecionarParaPedido: (c: Caixa) => void;
}

// Caixas que saíram do almoxarifado com falta, pela etapa da tratativa.
export function Saidas({ board, q, hoje, executar, onSelecionarParaPedido }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const fechar = useCallback(() => setSelId(null), []);
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  // O dia (e não o instante) entra na chave: hoje muda a cada render do App.
  const dia = hoje.toDateString();
  const caixas = useMemo(
    () => saidasComColuna(board, new Date(dia)).filter((x) => caixaAtendeBusca(x.caixa, q)),
    [board, q, dia]
  );
  const sel = caixas.find((x) => x.caixa.id === selId) ?? null;
  return (
    <div className="quadro">
      <div className="quadro__rolagem">
        <div className="quadro__trilho">
          {COLUNAS_SAIDA.map((col) => {
            const cs = caixas.filter((x) => x.coluna.coluna === col.id);
            return (
              <ColunaQuadro key={col.id} nome={col.nome} cor={col.cor} qtd={cs.length}
                vazio={q ? 'Nenhuma caixa desta etapa atende à busca.' : col.vazio}>
                {cs.map(({ caixa, coluna }) => (
                  <CardSaida key={caixa.id} caixa={caixa} coluna={coluna} pedidos={pedidos} etapas={etapas} hoje={hoje}
                    selecionada={caixa.id === selId} onAbrir={() => setSelId(caixa.id === selId ? null : caixa.id)} />
                ))}
              </ColunaQuadro>
            );
          })}
        </div>
      </div>
      {sel && (
        <PainelSaida key={sel.caixa.id} caixa={sel.caixa} coluna={sel.coluna.coluna} pedidos={pedidos} etapas={etapas}
          hoje={hoje} editavel={caixaEditavelNoApp(board, sel.caixa)} executar={executar}
          onSelecionarParaPedido={onSelecionarParaPedido} onFechar={fechar} />
      )}
    </div>
  );
}
