import type { EntradaHistorico } from '../../api/tipos';
import { ordenarHistorico, SELO_PLOOMES } from '../../regras/acoes';
import { dataHora } from '../../regras/datas';

export function Historico({ entradas }: { entradas: EntradaHistorico[] }) {
  const lista = ordenarHistorico(entradas);
  return (
    <section className="secao">
      <h3 className="secao__titulo">Histórico {lista.length > 0 && <span>{lista.length}</span>}</h3>
      {lista.length === 0 ? <p className="vazio">Nenhuma alteração registrada ainda.</p> : (
        <ol className="historico">
          {lista.map((h, i) => (
            <li key={`${h.quando}-${i}`} className="historico__item">
              <div className="historico__meta">
                <span>{[dataHora(h.quando), h.usuario].filter(Boolean).join(' · ')}</span>
                <span className={`selo selo--${String(h.ploomes).toLowerCase()}`}>{SELO_PLOOMES[h.ploomes] ?? h.ploomes}</span>
              </div>
              <p className="historico__texto">{h.texto}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
