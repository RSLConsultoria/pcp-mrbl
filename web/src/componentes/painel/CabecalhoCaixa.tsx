import type { Caixa } from '../../api/tipos';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

const URL_PLOOMES = 'https://app10.ploomes.com/deal/';

// Topo do painel de uma caixa: tipo, OS, peça, cliente e o link do card no Ploomes.
export function CabecalhoCaixa({ caixa, onFechar }: { caixa: Caixa; onFechar: () => void }) {
  return (
    <div className="painel__cabecalho">
      <div className="painel__linha">
        <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)}</span>
        <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
      </div>
      <div className="painel__os">{caixa.os}</div>
      <div className="painel__peca">{caixa.peca}</div>
      <div className="painel__meta">{[caixa.cliente, caixa.referencia].filter(Boolean).join(' · ')}</div>
      <a className="painel__link" href={URL_PLOOMES + caixa.dealId} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
    </div>
  );
}
