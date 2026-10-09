import { useCallback, useMemo, useState } from 'react';
import type { Board, Caixa } from '../api/tipos';
import { ColunaQuadro } from '../componentes/ColunaQuadro';
import { CardSaida } from '../componentes/saidas/CardSaida';
import { PainelSaida } from '../componentes/saidas/PainelSaida';
import { caixaAtendeBusca } from '../regras/busca';
import { caixaEditavelNoApp } from '../regras/edicao';
import { chaveDaSaida, colunasSaida, saidasNaTela } from '../regras/saidas';

interface Props {
  board: Board;
  q: string;
  hoje: Date;
  onSelecionarParaPedido: (c: Caixa) => void;
}

// Caixas que saíram do almoxarifado com falta, pelas etapas dos pedidos (as mesmas de
// Solicitações de faltas). Cada caixa se divide por etapa: uma parte por coluna onde tem item.
export function Saidas({ board, q, hoje, onSelecionarParaPedido }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const fechar = useCallback(() => setSelId(null), []);
  const etapas = board.etapasPedido ?? [];
  // O dia (e não o instante) entra na chave: hoje muda a cada render do App.
  const dia = hoje.toDateString();
  const todas = useMemo(() => saidasNaTela(board, new Date(dia)), [board, dia]);
  const visiveis = useMemo(() => todas.filter((x) => caixaAtendeBusca(x.caixa, q)), [todas, q]);
  const colunas = useMemo(() => colunasSaida(etapas, todas.some((x) => x.parte.coluna === 'sem_pedido')), [etapas, todas]);
  const final = colunas.filter((c) => c.id !== 'sem_pedido').at(-1)?.id;
  const sel = visiveis.find((x) => chaveDaSaida(x) === selId) ?? null;
  return (
    <div className="quadro">
      <div className="quadro__rolagem">
        <div className="quadro__trilho">
          {colunas.map((col) => {
            const cs = visiveis.filter((x) => x.parte.coluna === col.id);
            return (
              <ColunaQuadro key={col.id} nome={col.nome} cor={col.cor} qtd={cs.length}
                vazio={q ? 'Nenhuma caixa desta etapa atende à busca.' : col.vazio}>
                {cs.map((x) => {
                  const chave = chaveDaSaida(x);
                  return (
                    <CardSaida key={chave} caixa={x.caixa} parte={x.parte} final={col.id === final} hoje={hoje}
                      selecionada={chave === selId} onAbrir={() => setSelId(chave === selId ? null : chave)} />
                  );
                })}
              </ColunaQuadro>
            );
          })}
        </div>
      </div>
      {sel && (
        <PainelSaida key={chaveDaSaida(sel)} caixa={sel.caixa} parte={sel.parte} etapas={etapas} hoje={hoje}
          editavel={caixaEditavelNoApp(board, sel.caixa)} onSelecionarParaPedido={onSelecionarParaPedido} onFechar={fechar} />
      )}
    </div>
  );
}
