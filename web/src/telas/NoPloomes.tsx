import { useCallback, useState } from 'react';
import type { Board } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { CardCaixa } from '../componentes/CardCaixa';
import { PainelCaixa } from '../componentes/PainelCaixa';
import { caixaAtendeBusca } from '../regras/busca';
import { colunaDaCaixa, COLUNAS, visivelNoQuadro } from '../regras/colunas';

interface Props { board: Board; q: string; hoje: Date; perfil: string; executar: Executar }

export function NoPloomes({ board, q, hoje, perfil, executar }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const visiveis = board.caixas.filter((c) => visivelNoQuadro(c, hoje) && caixaAtendeBusca(c, q));
  const sel = board.caixas.find((c) => c.id === selId) ?? null;
  const fechar = useCallback(() => setSelId(null), []);
  return (
    <div className="quadro">
      <div className="quadro__rolagem">
        <div className="quadro__trilho">
          {COLUNAS.map((col) => {
            const cs = visiveis.filter((c) => colunaDaCaixa(c) === col.id);
            return (
              <section key={col.id} className="coluna" aria-label={col.nome}>
                <header className="coluna__cabecalho">
                  <span className="coluna__ponto" style={{ background: col.cor }} />
                  <span className="coluna__nome">{col.nome}</span>
                  <span className="coluna__qtd">{cs.length}</span>
                </header>
                <div className="coluna__cards">
                  {cs.map((c) => (
                    <CardCaixa key={c.id} caixa={c} hoje={hoje} selecionada={c.id === selId}
                      onAbrir={() => setSelId(c.id === selId ? null : c.id)} />
                  ))}
                  {cs.length === 0 && <div className="coluna__vazio">{q ? 'Nenhuma caixa desta etapa atende à busca.' : col.vazio}</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {sel && (
        <PainelCaixa key={sel.id} caixa={sel} hoje={hoje} usuarios={board.usuarios ?? []} perfil={perfil}
          executar={executar} onFechar={fechar} />
      )}
    </div>
  );
}
