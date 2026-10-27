import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Board } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { CardCaixa } from '../componentes/CardCaixa';
import { caixaEditavelNoApp } from '../regras/edicao';
import { PainelCaixa } from '../componentes/PainelCaixa';
import { caixaAtendeBusca } from '../regras/busca';
import { colunaDaCaixa, COLUNAS, semPosSaida, visivelNoQuadro } from '../regras/colunas';
import { dealsAlvoEmailPcp, emailDecidivel, emailsPendentes, emailsPendentesDaCaixa, textoSugestaoEmail } from '../regras/emailsPcp';

// caixaPedida: a faixa dos e-mails do PCP pede para abrir esta caixa (id); a tela avisa quando abriu.
interface Props { board: Board; q: string; hoje: Date; executar: Executar; caixaPedida?: string | null; onCaixaPedidaAtendida?: () => void }

export function NoPloomes({ board, q, hoje, executar, caixaPedida, onCaixaPedidaAtendida }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => {
    if (!caixaPedida) return;
    setSelId(caixaPedida);
    onCaixaPedidaAtendida?.();
  }, [caixaPedida, onCaixaPedidaAtendida]);
  // Selo "e-mail do PCP": caixas com sugestão pendente.
  const comEmail = useMemo(() => new Set(emailsPendentes(board).flatMap((e) => dealsAlvoEmailPcp(e, board.caixas))), [board]);
  // A demanda pós-saída não entra no No Ploomes: a caixa fica como estava antes dela.
  const caixas = useMemo(() => board.caixas.map(semPosSaida), [board.caixas]);
  const visiveis = caixas.filter((c) => visivelNoQuadro(c, hoje) && caixaAtendeBusca(c, q));
  const sel = caixas.find((c) => c.id === selId) ?? null;
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
                    <CardCaixa key={c.id} caixa={c} hoje={hoje} selecionada={c.id === selId} emailPcp={comEmail.has(c.dealId)}
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
        <PainelCaixa key={sel.id} caixa={sel} hoje={hoje} usuarios={board.usuarios ?? []}
          editavel={caixaEditavelNoApp(board, sel)} executar={executar} onFechar={fechar}
          sugestoesEmail={emailsPendentesDaCaixa(board, sel.dealId).map((email) => ({ email, entendeu: textoSugestaoEmail(email, board), decidivel: emailDecidivel(board, email) }))} />
      )}
    </div>
  );
}
