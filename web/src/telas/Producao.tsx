import { useMemo, useState } from 'react';
import type { Board, Producao as ProducaoItem } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { dataHora, ddmm, diaIso } from '../regras/datas';
import { filtrarProducoes, indicadoresProducao, janelaGantt, prazoProducao, statusProducao, validarMudancaProducao } from '../regras/producao';

const LARGURA_DIA = 28;
const PRODUCAO_VAZIA: ProducaoItem[] = [];
const msDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const indiceDia = (iso: string, inicio: string) => Math.round((msDia(iso) - msDia(inicio)) / 86_400_000);

function diasEntre(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => new Date(msDia(inicio) + i * 86_400_000).toISOString().slice(0, 10));
}

function PainelProducao({ item, board, executar, onFechar }: { item: ProducaoItem; board: Board; executar: Executar; onFechar: () => void }) {
  const prazo = prazoProducao(item);
  const [oficinaId, setOficinaId] = useState(item.oficinaId);
  const [dataCombinada, setDataCombinada] = useState(item.dataCombinada);
  const [motivo, setMotivo] = useState('');
  const [motivoSugestao, setMotivoSugestao] = useState('');
  const [erro, setErro] = useState('');
  const editavel = !board.dealsProducaoEditaveis?.length || board.dealsProducaoEditaveis.includes(item.dealId);
  const salvar = () => {
    const e = validarMudancaProducao(item, { oficinaId, dataCombinada, motivo });
    if (e) return setErro(e);
    setErro('');
    void executar({ tipo: 'alterar_producao', dealId: item.dealId, versao: item.versao, oficinaId, dataCombinada, motivo }, 'Combinado da OS atualizado');
  };
  const decidir = (id: string, aceitar: boolean, exigeMotivo: boolean) => {
    if (aceitar && exigeMotivo && !motivoSugestao.trim()) return setErro('Informe o motivo da alteração da data combinada.');
    setErro('');
    void executar(aceitar
      ? { tipo: 'aceitar_sugestao_whatsapp', dealId: item.dealId, sugestaoId: id, versao: item.versao, motivo: motivoSugestao }
      : { tipo: 'ignorar_sugestao_whatsapp', dealId: item.dealId, sugestaoId: id, versao: item.versao }, aceitar ? 'Sugestão aceita' : 'Sugestão ignorada');
  };
  return (
    <aside className="producao-painel" aria-label={`Detalhes da OS ${item.os}`}>
      <header className="producao-painel__cabecalho">
        <div><span className="producao-painel__sobre">Controle de produção</span><h2>OS {item.os}</h2><p>{item.peca || 'Peça sem descrição'} · {item.referencia || 'Sem referência'}</p></div>
        <button type="button" className="producao-painel__fechar" aria-label="Fechar painel" onClick={onFechar}>×</button>
      </header>
      <div className="producao-painel__corpo">
        <section className="producao-resumo">
          <div><span>Oficina</span><strong>{item.oficina}</strong></div>
          <div><span>Cliente</span><strong>{item.cliente || '—'}</strong></div>
          <div><span>Início</span><strong>{ddmm(item.inicioCostura) || '—'}</strong></div>
          <div><span>Data combinada</span><strong>{ddmm(item.dataCombinada) || '—'}</strong></div>
          <div><span>Lead time</span><strong>{ddmm(item.leadTime) || '—'}</strong></div>
          <div><span>Peças</span><strong>{item.pecas ?? '—'}</strong></div>
        </section>
        <a className="producao-link" href={`https://app.ploomes.com/deal/${item.dealId}`} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
        <section className="producao-secao producao-edicao">
          <h3>Alterar combinado</h3>
          <div className="producao-edicao__campos">
            <label>Oficina<select value={oficinaId} disabled={!editavel} onChange={(e) => setOficinaId(e.target.value)}><option value="">ALOCAR</option>{(board.oficinas ?? []).map((o) => <option key={o.ploomesId} value={o.ploomesId}>{o.nome}</option>)}</select></label>
            <label>Data combinada<input type="date" value={dataCombinada} disabled={!editavel} onChange={(e) => setDataCombinada(e.target.value)} /></label>
            <label>Motivo {dataCombinada !== item.dataCombinada && <span className="obrigatorio">*</span>}<textarea rows={2} maxLength={500} value={motivo} disabled={!editavel} onChange={(e) => setMotivo(e.target.value)} /></label>
          </div>
          {erro && <p className="campo__erro" role="alert">{erro}</p>}
          {editavel ? <button type="button" className="botao botao--signal" onClick={salvar}>Salvar combinado</button>
            : <p className="producao-vazio">Edição liberada em breve para esta OS.</p>}
        </section>
        <section className="producao-secao">
          <h3>Prazo</h3>
          <p>{prazo.data ? `${ddmm(prazo.data)} · ${prazo.origem === 'COMBINADA' ? 'data combinada' : 'lead time'}` : 'Sem prazo definido'}</p>
        </section>
        <section className="producao-secao">
          <h3>Faltas da costura <span>{item.faltasCostura.length}</span></h3>
          {item.faltasCostura.length === 0 ? <p className="producao-vazio">Nenhuma falta aberta na caixa de costura.</p>
            : <ul className="producao-lista">{item.faltasCostura.map((f) => <li key={f.id}><strong>{f.nome}</strong><span>{f.resta ?? '—'} {f.un}</span></li>)}</ul>}
        </section>
        <section className="producao-secao">
          <h3>Sugestões do intérprete <span>{item.sugestoes.filter((s) => s.status === 'PENDENTE').length}</span></h3>
          {item.sugestoes.length === 0 ? <p className="producao-vazio">Nenhuma sugestão para esta OS.</p>
            : <ul className="producao-sugestoes">{item.sugestoes.map((s) => <li key={s.id} className={s.status === 'PENDENTE' ? 'producao-sugestao--pendente' : ''}>
              <span>{s.tipo === 'NOVA_DATA_COMBINADA' ? `Nova data: ${ddmm(s.valor)}` : s.tipo.replaceAll('_', ' ').toLowerCase()}</span>
              <strong>{s.resumo}</strong><small>{s.evidencia ? `“${s.evidencia}”` : ''}{s.confianca !== null ? ` · ${Math.round(s.confianca * 100)}%` : ''}</small>
              {s.status === 'PENDENTE' && editavel && <div className="producao-sugestao__acoes">
                {s.tipo === 'NOVA_DATA_COMBINADA' && <label>Motivo da nova data <span className="obrigatorio">*</span><input value={motivoSugestao} maxLength={500} onChange={(e) => setMotivoSugestao(e.target.value)} /></label>}
                <div><button type="button" className="botao botao--signal" onClick={() => decidir(s.id, true, s.tipo === 'NOVA_DATA_COMBINADA')}>Aceitar</button><button type="button" className="botao botao--contorno" onClick={() => decidir(s.id, false, false)}>Ignorar</button></div>
                <small>O intérprete não responde ao grupo.</small>
              </div>}
            </li>)}</ul>}
        </section>
        <section className="producao-secao">
          <h3>Conversa relacionada</h3>
          {item.mensagens.length === 0 ? <p className="producao-vazio">Nenhuma mensagem associada.</p>
            : <ol className="producao-conversa">{item.mensagens.map((m) => <li key={m.id} className={`producao-mensagem producao-mensagem--${m.direcao.toLowerCase()}`}>
              <span>{m.direcao === 'ENVIADA' ? 'PCP' : m.participanteNome || 'Oficina'} · {dataHora(m.quando)}</span>
              <p>{m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto}</p>
              {m.associacao === 'SEM_ASSOCIACAO' && <small>Mensagem ainda sem associação</small>}
            </li>)}</ol>}
        </section>
        <section className="producao-secao"><h3>Histórico</h3>{item.historico.length === 0 ? <p className="producao-vazio">Sem alterações registradas.</p>
          : <ul className="producao-historico">{item.historico.map((h, i) => <li key={`${h.quando}-${i}`}><span>{dataHora(h.quando)}</span><p>{h.texto}</p></li>)}</ul>}</section>
      </div>
    </aside>
  );
}

export function Producao({ board, q, hoje, executar }: { board: Board; q: string; hoje: Date; executar: Executar }) {
  const [oficinaId, setOficinaId] = useState('');
  const [soComFalta, setSoComFalta] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const hojeIso = diaIso(hoje);
  const producao = board.producao ?? PRODUCAO_VAZIA;
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta }), [producao, q, oficinaId, soComFalta]);
  const indicadores = useMemo(() => indicadoresProducao(filtradas, hojeIso), [filtradas, hojeIso]);
  const janela = useMemo(() => janelaGantt(filtradas, hojeIso), [filtradas, hojeIso]);
  const dias = useMemo(() => diasEntre(janela.inicio, janela.dias), [janela]);
  const grupos = useMemo(() => {
    const mapa = new Map<string, ProducaoItem[]>();
    for (const p of filtradas) mapa.set(p.oficina, [...(mapa.get(p.oficina) ?? []), p]);
    return [...mapa.entries()];
  }, [filtradas]);
  const selecionada = producao.find((p) => p.dealId === aberta) ?? null;
  const semAssociacao = board.mensagensWhatsappSemAssociacao ?? [];

  return <div className="producao-tela">
    <div className="producao-filtros">
      <label>Oficina<select value={oficinaId} onChange={(e) => setOficinaId(e.target.value)}><option value="">Todas</option>{(board.oficinas ?? []).map((o) => <option key={o.ploomesId} value={o.ploomesId}>{o.nome}</option>)}</select></label>
      <label className="producao-check"><input type="checkbox" checked={soComFalta} onChange={(e) => setSoComFalta(e.target.checked)} /> Só com falta na costura</label>
    </div>
    <div className="producao-kpis">
      <article><span>OS na Costura</span><strong>{indicadores.os}</strong><small>{indicadores.pecas} peças · {indicadores.oficinas} oficinas</small></article>
      <article><span>Caixas com falta</span><strong>{indicadores.caixasComFalta}</strong><small>{indicadores.itensEmFalta} itens abertos</small></article>
      <article className={indicadores.atrasadas ? 'producao-kpi--erro' : ''}><span>Passaram do prazo</span><strong>{indicadores.atrasadas}</strong><small>pedem acompanhamento</small></article>
      <article><span>Sem data combinada</span><strong>{indicadores.semCombinada}</strong><small>usam lead time ou sem prazo</small></article>
    </div>
    {semAssociacao.length > 0 && <details className="producao-pendentes">
      <summary>{semAssociacao.length} {semAssociacao.length === 1 ? 'mensagem aguardando associação' : 'mensagens aguardando associação'}</summary>
      <ul>{semAssociacao.map((m) => <li key={m.id}>
        <span>{m.grupoNome || m.oficina || 'Oficina'} · {m.participanteNome || 'Participante'} · {dataHora(m.quando)}</span>
        <p>{m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto}</p>
      </li>)}</ul>
    </details>}
    <div className="gantt__rolagem">
      <div className="gantt" style={{ width: 260 + janela.dias * LARGURA_DIA }}>
        <div className="gantt__cabecalho gantt__fixo"><strong>Oficina / OS</strong><span>{ddmm(janela.inicio)} — {ddmm(janela.fim)}</span></div>
        <div className="gantt__dias" style={{ width: janela.dias * LARGURA_DIA }}>{dias.map((d) => <div key={d} className={`${d === hojeIso ? 'gantt__dia--hoje' : ''} ${[0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? 'gantt__dia--fim' : ''}`}><span>{d.slice(8)}</span></div>)}</div>
        {grupos.map(([oficina, itens]) => <div className="gantt__grupo" key={oficina}>
          <div className={`gantt__grupo-nome gantt__fixo ${oficina === 'ALOCAR' ? 'gantt__grupo-nome--alocar' : ''}`}><strong>{oficina}</strong><span>{itens.length} OS</span></div>
          <div className="gantt__grupo-faixa" />
          {itens.map((p) => {
            const prazo = prazoProducao(p);
            const status = statusProducao(p, hojeIso);
            const inicio = p.inicioCostura || prazo.data;
            const esquerda = inicio ? Math.max(0, indiceDia(inicio, janela.inicio)) * LARGURA_DIA : 0;
            const fim = prazo.data ? Math.min(janela.dias - 1, indiceDia(prazo.data, janela.inicio)) : 0;
            const largura = p.inicioCostura && prazo.data ? Math.max(16, (fim - Math.max(0, indiceDia(p.inicioCostura, janela.inicio)) + 1) * LARGURA_DIA - 6) : 14;
            return <div className="gantt__linha" key={p.dealId}>
              <button className="gantt__os gantt__fixo" type="button" onClick={() => setAberta(p.dealId)}><strong>OS {p.os}</strong><span>{p.peca || p.referencia || 'Sem descrição'}</span>{p.faltasCostura.length > 0 && <em>{p.faltasCostura.length} faltas</em>}</button>
              <div className="gantt__pista" style={{ width: janela.dias * LARGURA_DIA }}>
                {prazo.data ? <button type="button" onClick={() => setAberta(p.dealId)} title={`OS ${p.os} · ${ddmm(prazo.data)}`}
                  className={`gantt__barra gantt__barra--${status.status.toLowerCase()} ${prazo.origem === 'LEAD_TIME' ? 'gantt__barra--lead' : ''} ${!p.inicioCostura ? 'gantt__barra--marco' : ''} ${p.faltasCostura.length ? 'gantt__barra--falta' : ''}`}
                  style={{ left: esquerda + 3, width: largura }}><span>{p.os}</span></button>
                  : <button type="button" className="gantt__sem-prazo" onClick={() => setAberta(p.dealId)}>Sem prazo</button>}
              </div>
            </div>;
          })}
        </div>)}
        {filtradas.length === 0 && <p className="gantt__vazio">Nenhuma OS encontrada com estes filtros.</p>}
      </div>
    </div>
    {selecionada && <PainelProducao key={selecionada.dealId} item={selecionada} board={board} executar={executar} onFechar={() => setAberta(null)} />}
  </div>;
}
