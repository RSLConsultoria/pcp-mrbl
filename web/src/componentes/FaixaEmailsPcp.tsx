import { useState } from 'react';
import type { Board, EmailPcp } from '../api/tipos';
import { dataHora } from '../regras/datas';
import { emailsPendentes, resumoFaixaEmails, textoSugestaoEmail } from '../regras/emailsPcp';

// F5c · faixa azul abaixo dos Insights, só quando há sugestões pendentes dos e-mails do PCP.
// O clique abre a lista; cada item abre a caixa da sugestão (ou a Visão da peça sem caixa).
export function FaixaEmailsPcp({ board, onAbrir }: { board: Board; onAbrir: (e: EmailPcp) => void }) {
  const [aberta, setAberta] = useState(false);
  const pendentes = emailsPendentes(board);
  if (!pendentes.length) return null;
  return (
    <section className={`emails-faixa ${aberta ? 'emails-faixa--aberta' : ''}`} aria-label="Sugestões dos e-mails do PCP">
      <button type="button" className="emails-faixa__alternar" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
        <span className="emails-faixa__ponto" aria-hidden="true" />
        <span className="emails-faixa__resumo">{resumoFaixaEmails(pendentes.length)}</span>
        <span className="emails-faixa__acao" aria-hidden="true">{aberta ? 'Recolher' : 'Ver'}</span>
      </button>
      {aberta && <ul className="emails-faixa__lista">{pendentes.map((e) => (
        <li key={e.id}>
          <button type="button" className="emails-faixa__item" onClick={() => onAbrir(e)}>
            <strong>OS {e.os}</strong>
            <span>{textoSugestaoEmail(e, board)}</span>
            <small>{[e.de, dataHora(e.quando)].filter(Boolean).join(' · ')}</small>
          </button>
        </li>
      ))}</ul>}
    </section>
  );
}
