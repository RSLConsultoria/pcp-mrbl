import { useMemo, useState } from 'react';
import type { OficinaProducao, Producao } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { lerCapacidade, montarCarga, textoCelula, type OsNaCelula } from '../regras/carga';

// Visão Carga do Controle de produção (19/10): oficinas x semanas, "peças / capacidade"
// com cor. Recebe a lista já filtrada (reais e previstas). Clique na célula lista as OS;
// clique na OS abre o painel. ADM edita a capacidade clicando no nome da oficina.
const TITULO_COR: Record<string, string> = { VERDE: 'Dentro da capacidade', AMARELO: 'Perto do limite', VERMELHO: 'Acima da capacidade', SEM_CAPACIDADE: 'Sem capacidade cadastrada' };
const pc = (n: number) => Math.round(n).toLocaleString('pt-BR');

export function CargaProducao({ lista, oficinas, hojeIso, oficinaId, ehAdm, executar, onAbrir }: {
  lista: Producao[];
  oficinas: OficinaProducao[];
  hojeIso: string;
  oficinaId: string; // filtro geral de oficina: só a linha dela
  ehAdm: boolean;
  executar: Executar;
  onAbrir: (dealId: string) => void;
}) {
  const carga = useMemo(() => montarCarga(lista, oficinas, hojeIso), [lista, oficinas, hojeIso]);
  const linhas = oficinaId ? carga.linhas.filter((l) => l.oficinaId === oficinaId) : carga.linhas;
  const [celula, setCelula] = useState<{ titulo: string; os: OsNaCelula[] } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');

  const editar = (id: string, capacidade: number | null) => {
    setEditando(id);
    setValor(capacidade === null ? '' : String(capacidade));
    setErro('');
  };
  const salvar = (id: string) => {
    const r = lerCapacidade(valor);
    if (!r.ok) return setErro(r.erro);
    setEditando(null);
    void executar({ tipo: 'alterar_capacidade_oficina', oficinaId: id, capacidade: r.valor },
      r.valor === null ? 'Capacidade da oficina removida' : 'Capacidade da oficina atualizada');
  };

  return <section className="carga" aria-label="Carga das oficinas">
    <div className="carga__rolagem">
      <table className="carga__tabela">
        <thead><tr>
          <th scope="col">Oficina</th>
          {carga.semanas.map((s) => <th key={s.inicio} scope="col">Semana {s.rotulo}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map((l) => <tr key={l.oficinaId}>
            <th scope="row">
              {editando === l.oficinaId ? <form className="carga__capacidade" onSubmit={(e) => { e.preventDefault(); salvar(l.oficinaId); }}>
                <label>Capacidade de {l.oficina} (peças por semana)
                  <input inputMode="numeric" value={valor} autoFocus onChange={(e) => setValor(e.target.value)} placeholder="Sem capacidade" />
                </label>
                {erro && <span className="campo__erro" role="alert">{erro}</span>}
                <div><button type="submit" className="botao botao--signal">Salvar</button>
                  <button type="button" className="botao botao--contorno" onClick={() => setEditando(null)}>Cancelar</button></div>
              </form> : <>
                {ehAdm ? <button type="button" className="carga__oficina" onClick={() => editar(l.oficinaId, l.capacidade)}
                  aria-label={`Editar capacidade de ${l.oficina}`}>{l.oficina}</button> : <strong>{l.oficina}</strong>}
                <small>{l.capacidade === null ? 'Sem capacidade' : `${pc(l.capacidade)} pç/semana`}</small>
              </>}
            </th>
            {l.celulas.map((c, k) => <td key={c.semana}>
              <button type="button" className={`carga__celula carga__celula--${c.cor.toLowerCase()}`}
                title={TITULO_COR[c.cor]}
                aria-label={`${l.oficina}, semana ${carga.semanas[k].rotulo}: ${textoCelula(c)} peças`}
                onClick={() => setCelula({ titulo: `${l.oficina} · semana ${carga.semanas[k].rotulo}`, os: c.os })}>{textoCelula(c)}</button>
            </td>)}
          </tr>)}
          <tr className="carga__alocar">
            <th scope="row"><strong>A alocar</strong><small>pela semana de chegada</small></th>
            {carga.alocar.map((c, k) => <td key={c.semana}>
              <button type="button" className="carga__celula carga__celula--alocar"
                aria-label={`A alocar, semana ${carga.semanas[k].rotulo}: ${c.quantidadeOs} OS, ${pc(c.pecas)} peças`}
                onClick={() => setCelula({ titulo: `A alocar · semana ${carga.semanas[k].rotulo}`, os: c.os })}>
                {c.quantidadeOs ? `${c.quantidadeOs} OS · ${pc(c.pecas)} pç` : '—'}</button>
            </td>)}
          </tr>
        </tbody>
      </table>
    </div>
    {carga.semDatas > 0 && <p className="producao-vazio">{carga.semDatas} {carga.semDatas === 1 ? 'OS sem datas fica' : 'OS sem datas ficam'} fora da carga.</p>}
    {celula && <section className="carga__detalhe" aria-label="OS da célula">
      <header><strong>{celula.titulo}</strong>
        <button type="button" className="producao-painel__fechar" aria-label="Fechar lista" onClick={() => setCelula(null)}>×</button></header>
      {celula.os.length === 0 ? <p className="producao-vazio">Nenhuma OS nesta semana.</p>
        : <ul>{celula.os.map((o) => <li key={o.dealId}>
          <button type="button" onClick={() => onAbrir(o.dealId)}>
            <strong>OS {o.os}</strong><span>{o.peca || 'Sem descrição'}</span><span>{pc(o.pecas)} pç no período</span>
            <em className={o.prevista ? 'etiqueta-prevista' : 'etiqueta-real'}>{o.prevista ? 'prevista' : 'real'}</em>
          </button>
        </li>)}</ul>}
    </section>}
  </section>;
}
