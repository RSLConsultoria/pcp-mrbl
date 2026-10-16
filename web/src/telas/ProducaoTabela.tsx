import { useMemo, useState } from 'react';
import type { Producao } from '../api/tipos';
import { reais, SITUACOES_PRAZO, totaisProducao } from '../regras/producao';
import {
  COLUNAS_PRODUCAO, colunasVisiveis, filtrarLinhas, lerColunasOcultas, linhasTabela, ordenarLinhas, proximaOrdem,
  salvarColunasOcultas, temFiltroColuna, type ColunaProducao, type FiltrosColuna, type OrdemTabela
} from '../regras/producaoTabela';

// Visão em tabela do Controle de produção. Recebe a lista já filtrada pelos
// filtros gerais e na ordem do Gantt; ordena, filtra por coluna e abre o painel.
export function TabelaProducao({ lista, hojeIso, onAbrir }: { lista: Producao[]; hojeIso: string; onAbrir: (dealId: string) => void }) {
  const [ordem, setOrdem] = useState<OrdemTabela | null>(null);
  const [filtros, setFiltros] = useState<FiltrosColuna>({});
  const [ocultas, setOcultas] = useState<ColunaProducao[]>(lerColunasOcultas);
  const linhas = useMemo(() => linhasTabela(lista, hojeIso), [lista, hojeIso]);
  const visiveis = useMemo(() => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem), [linhas, filtros, ordem]);
  const colunas = colunasVisiveis(ocultas);
  const oficinas = useMemo(() => [...new Set(lista.map((p) => p.oficina))], [lista]);
  const algumFiltro = temFiltroColuna(filtros);
  const totais = useMemo(() => totaisProducao(visiveis.map((l) => l.item)), [visiveis]);

  const alternarColuna = (id: ColunaProducao, mostrar: boolean) => {
    const novas = mostrar ? ocultas.filter((c) => c !== id) : [...ocultas, id];
    setOcultas(novas);
    salvarColunasOcultas(novas);
    if (!mostrar) setFiltros((f) => ({ ...f, [id]: '' }));
  };

  return <section className="producao-tabela__area" aria-label="Tabela de produção">
    <div className="producao-tabela__barra">
      <strong>{visiveis.length} OS</strong>
      <span className="producao-tabela__totais">{totais.pecas.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} peças · {reais(totais.valor)}</span>
      {algumFiltro && <button type="button" className="botao botao--contorno" onClick={() => setFiltros({})}>Limpar filtros</button>}
      <details className="producao-tabela__colunas">
        <summary>Colunas</summary>
        <div>{COLUNAS_PRODUCAO.map((c) => <label key={c.id}>
          <input type="checkbox" checked={c.id === 'os' || !ocultas.includes(c.id)} disabled={c.id === 'os'}
            onChange={(e) => alternarColuna(c.id, e.target.checked)} />{c.titulo}
        </label>)}</div>
      </details>
    </div>
    <div className="producao-tabela__rolagem">
      <table className="producao-tabela">
        <thead>
          <tr>{colunas.map((c) => {
            const sort = ordem?.coluna === c.id ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none';
            return <th key={c.id} aria-sort={sort} className={c.numerica ? 'producao-tabela__num' : ''}>
              <button type="button" onClick={() => setOrdem(proximaOrdem(ordem, c.id))}>{c.titulo}
                <span aria-hidden="true">{sort === 'ascending' ? '▲' : sort === 'descending' ? '▼' : ''}</span></button>
            </th>;
          })}</tr>
          <tr className="producao-tabela__filtros">{colunas.map((c) => <th key={c.id}>
            {c.id === 'oficina' ? <select aria-label={`Filtrar ${c.titulo}`} value={filtros.oficina ?? ''} onChange={(e) => setFiltros({ ...filtros, oficina: e.target.value })}>
              <option value="">Todas</option>{oficinas.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : c.id === 'situacao' ? <select aria-label={`Filtrar ${c.titulo}`} value={filtros.situacao ?? ''} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })}>
                <option value="">Todas</option>{SITUACOES_PRAZO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select>
              : <input type="search" aria-label={`Filtrar ${c.titulo}`} placeholder="Filtrar" value={filtros[c.id] ?? ''}
                onChange={(e) => setFiltros({ ...filtros, [c.id]: e.target.value })} />}
          </th>)}</tr>
        </thead>
        <tbody>{visiveis.map((l) => <tr key={l.item.dealId} tabIndex={0} aria-label={`Abrir OS ${l.item.os}`}
          onClick={() => onAbrir(l.item.dealId)} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(l.item.dealId); }}>
          {colunas.map((c) => <td key={c.id} className={[c.numerica ? 'producao-tabela__num' : '',
            c.id === 'situacao' ? `producao-tabela__situacao--${(l.valores.situacao.filtro ?? '').toLowerCase()}` : ''].join(' ').trim() || undefined}>
            {l.valores[c.id].exibir || '—'}</td>)}
        </tr>)}</tbody>
      </table>
      {visiveis.length === 0 && <p className="gantt__vazio">Nenhuma OS encontrada com estes filtros.</p>}
    </div>
  </section>;
}
