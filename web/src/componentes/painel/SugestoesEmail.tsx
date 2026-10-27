import type { EmailPcp } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { dataHora } from '../../regras/datas';

// F5c · bloco azul "Sugestão do e-mail do PCP" no painel da caixa (No Ploomes). Aceitar grava
// (previsão ou anotação no histórico, que vai ao registro do Ploomes); Ignorar só marca.
export function SugestoesEmail({ sugestoes, executar }: {
  sugestoes: { email: EmailPcp; entendeu: string; decidivel: boolean }[];
  executar: Executar;
}) {
  if (!sugestoes.length) return null;
  const decidir = (e: EmailPcp, decisao: 'ACEITAR' | 'IGNORAR') => {
    void executar({ tipo: 'decidir_email_pcp', id: e.id, decisao }, decisao === 'ACEITAR' ? 'Sugestão do e-mail aceita' : 'Sugestão do e-mail ignorada');
  };
  return (
    <>{sugestoes.map(({ email: e, entendeu, decidivel }) => (
      <section key={e.id} className="sugestao-email" aria-label={`Sugestão do e-mail do PCP de ${e.de || 'remetente sem nome'}`}>
        <h3 className="sugestao-email__titulo">Sugestão do e-mail do PCP</h3>
        <p className="sugestao-email__meta">{[e.de, dataHora(e.quando)].filter(Boolean).join(' · ')}</p>
        <p className="sugestao-email__assunto">{e.assunto}</p>
        <blockquote className="sugestao-email__trecho">“{e.evidencia || e.texto}”</blockquote>
        <p className="sugestao-email__entendeu"><span>A IA entendeu:</span> {entendeu}</p>
        <div className="sugestao-email__botoes">
          <button type="button" className="botao botao--navy" disabled={!decidivel} onClick={() => decidir(e, 'ACEITAR')}>Aceitar</button>
          <button type="button" className="botao botao--contorno" disabled={!decidivel} onClick={() => decidir(e, 'IGNORAR')}>Ignorar</button>
        </div>
        {!decidivel && <p className="sugestao-email__nota">Edição liberada em breve para esta caixa.</p>}
      </section>
    ))}</>
  );
}
