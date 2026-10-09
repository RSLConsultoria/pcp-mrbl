import type { EntradaHistorico } from '../../api/tipos';
import { ordenarHistorico, SELO_PLOOMES } from '../../regras/acoes';
import { dataHora } from '../../regras/datas';

// os: no painel do pedido, as OS em que a ação foi registrada (uma entrada por ação).
export function Historico({ entradas }: { entradas: (EntradaHistorico & { os?: string[] })[] }) {
  const lista = ordenarHistorico(entradas);
  return (
    <section className="secao">
      <h3 className="secao__titulo">Histórico {lista.length > 0 && <span>{lista.length}</span>}</h3>
      {lista.length === 0 ? <p className="vazio">Nenhuma alteração registrada ainda.</p> : (
        <ol className="historico">
          {lista.map((h, i) => (
            <li key={`${h.quando}-${i}`} className="historico__item">
              <div className="historico__meta">
                <span>{[dataHora(h.quando), h.usuario, h.os?.length ? `OS ${h.os.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>
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
