import { useMemo, useState } from 'react';
import type { Board, MensagemWhatsappSemAssociacao, Producao as ProducaoItem } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { dataHora, ddmm, diaIso } from '../regras/datas';
import { chaveEnvioWhatsapp, filtrarProducoes, indicadoresProducao, janelaGantt, modeloMensagemProducao, prazoProducao, resumoFaltasAviamentos, statusProducao, validarMudancaProducao, type ModeloMensagemProducao } from '../regras/producao';

const LARGURA_DIA = 28;
const PRODUCAO_VAZIA: ProducaoItem[] = [];
const msDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const indiceDia = (iso: string, inicio: string) => Math.round((msDia(iso) - msDia(inicio)) / 86_400_000);

function diasEntre(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => new Date(msDia(inicio) + i * 86_400_000).toISOString().slice(0, 10));
}

function MensagemPendente({ mensagem, producao, editaveis, executar }: {
  mensagem: MensagemWhatsappSemAssociacao;
  producao: ProducaoItem[];
  editaveis: string[] | undefined;
  executar: Executar;
}) {
  const opcoes = producao.filter((p) => p.oficinaId === mensagem.oficinaId && (!editaveis?.length || editaveis.includes(p.dealId)));
  const [dealId, setDealId] = useState(opcoes.length === 1 ? opcoes[0].dealId : '');
  const escolhida = opcoes.find((p) => p.dealId === dealId);
  return <li>
    <span>{mensagem.grupoNome || mensagem.oficina || 'Oficina'} · {mensagem.participanteNome || 'Participante'} · {dataHora(mensagem.quando)}</span>
    <p>{mensagem.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : mensagem.texto}</p>
    {opcoes.length > 0 ? <div className="producao-pendentes__associar">
      <label>Associar à OS<select value={dealId} onChange={(e) => setDealId(e.target.value)}>
        <option value="">Selecione</option>{opcoes.map((p) => <option key={p.dealId} value={p.dealId}>OS {p.os} · {p.peca || p.referencia}</option>)}
      </select></label>
      <button type="button" className="botao botao--contorno" disabled={!escolhida}
        onClick={() => escolhida && void executar({ tipo: 'associar_whatsapp', dealId: escolhida.dealId, mensagemId: mensagem.id, versao: escolhida.versao }, 'Mensagem associada. A interpretação aparece em até 1 minuto.')}>Associar</button>
    </div> : <small>Nenhuma OS editável deste grupo está disponível.</small>}
  </li>;
}

function PainelProducao({ item, board, hojeIso, executar, onFechar }: { item: ProducaoItem; board: Board; hojeIso: string; executar: Executar; onFechar: () => void }) {
  const prazo = prazoProducao(item);
  const alertaAviamentos = resumoFaltasAviamentos(item);
  const [oficinaId, setOficinaId] = useState(item.oficinaId);
  const [dataCombinada, setDataCombinada] = useState(item.dataCombinada);
  const [motivo, setMotivo] = useState('');
  const [motivoSugestao, setMotivoSugestao] = useState('');
  const [erro, setErro] = useState('');
  const [erroMensagem, setErroMensagem] = useState('');
  const [modelo, setModelo] = useState<ModeloMensagemProducao>('COBRANCA_PRAZO');
  const [mensagem, setMensagem] = useState(() => modeloMensagemProducao('COBRANCA_PRAZO', item, hojeIso));
  const [enfileirando, setEnfileirando] = useState(false);
  const editavel = !board.dealsProducaoEditaveis?.length || board.dealsProducaoEditaveis.includes(item.dealId);
  const oficina = board.oficinas?.find((o) => o.ploomesId === item.oficinaId);
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
  const trocarModelo = (novo: ModeloMensagemProducao) => {
    setModelo(novo);
    setMensagem(modeloMensagemProducao(novo, item, hojeIso));
  };
  const enfileirarMensagem = () => {
    const texto = mensagem.trim();
    if (!texto || texto.length > 1500) return setErroMensagem('Escreva uma mensagem com até 1500 caracteres.');
    if (enfileirando) return;
    setErroMensagem('');
    setEnfileirando(true);
    // Uma chave por clique: a fila guarda a ação com ela e o servidor não duplica a mensagem.
    void executar({ tipo: 'enviar_whatsapp', dealId: item.dealId, versao: item.versao, modelo, texto, chave: chaveEnvioWhatsapp() }, 'Mensagem colocada na fila do WhatsApp')
      .finally(() => setEnfileirando(false));
  };
  const reenviarMensagem = (mensagemId: string, texto: string) => {
    if (!window.confirm(`Reenviar esta mensagem?\n\n${texto}`)) return;
    void executar({ tipo: 'reenviar_whatsapp', dealId: item.dealId, mensagemId, versao: item.versao, confirmou: true }, 'Reenvio colocado na fila do WhatsApp');
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
        {alertaAviamentos.costura > 0 && <p className="producao-alerta-aviamentos producao-alerta-aviamentos--costura" aria-label={alertaAviamentos.textoCostura}>🚫 {alertaAviamentos.textoCostura}</p>}
        {alertaAviamentos.acabamento > 0 && <p className="producao-alerta-aviamentos producao-alerta-aviamentos--acabamento" aria-label={alertaAviamentos.textoAcabamento}>⚠️ {alertaAviamentos.textoAcabamento}</p>}
        <a className="producao-link" href={`https://app10.ploomes.com/deal/${item.dealId}`} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
        <section className="producao-secao producao-edicao">
          <h3>Alterar combinado</h3>
          <div className="producao-edicao__campos">
            <label>Oficina<select value={oficinaId} disabled={!editavel} onChange={(e) => setOficinaId(e.target.value)}>{/* No Ploomes "ALOCAR" é um usuário: quando ele vem na lista, a opção vazia sai para não repetir. */}{!(board.oficinas ?? []).some((o) => o.nome.trim().toUpperCase() === 'ALOCAR') && <option value="">ALOCAR</option>}{(board.oficinas ?? []).map((o) => <option key={o.ploomesId} value={o.ploomesId}>{o.nome}</option>)}</select></label>
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
          <h3>Aviamentos para o acabamento <span>{item.faltasAcabamento.length}</span></h3>
          <p className="producao-secao__ajuda">Precisam estar prontos quando a oficina concluir a costura.</p>
          {item.faltasAcabamento.length === 0 ? <p className="producao-vazio">Nenhuma falta aberta na caixa de acabamento.</p>
            : <ul className="producao-lista">{item.faltasAcabamento.map((f) => <li key={f.id}><strong>{f.nome}</strong><span>{f.resta ?? '—'} {f.un}</span></li>)}</ul>}
        </section>
        <section className="producao-secao producao-envio">
          <h3>Mensagem para a oficina</h3>
          {!item.oficinaId ? <p className="producao-vazio">Aloque uma oficina antes de preparar a mensagem.</p>
            : !oficina?.grupoConfigurado ? <p className="producao-vazio">Configure o grupo desta oficina na aba OFICINAS.</p>
            : <>
              <label>Modelo<select value={modelo} disabled={!editavel} onChange={(e) => trocarModelo(e.target.value as ModeloMensagemProducao)}>
                <option value="COBRANCA_PRAZO">Cobrança de prazo</option><option value="CONFIRMAR_DATA">Confirmar data</option>
              </select></label>
              <label>Mensagem<textarea rows={5} maxLength={1500} value={mensagem} disabled={!editavel} onChange={(e) => setMensagem(e.target.value)} /></label>
              <small>Será enviada para {oficina.grupoNome || oficina.nome}. O texto pode ser revisado antes de entrar na fila.</small>
              {erroMensagem && <p className="campo__erro" role="alert">{erroMensagem}</p>}
              {editavel && <button type="button" className="botao botao--signal" disabled={enfileirando} onClick={enfileirarMensagem}>Colocar na fila</button>}
            </>}
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
              {m.statusEnvio === 'PENDENTE' && !!m.envioTentativas && <small>Aguardando nova tentativa ({m.envioTentativas} de 5)</small>}
              {m.interpretacao === 'ERRO' && <small>Não foi possível interpretar esta mensagem.</small>}
              {m.statusEnvio === 'ERRO' && <small>Falha no envio.</small>}
              {m.statusEnvio === 'ERRO' && !m.reenviada && editavel && <button type="button" className="botao botao--contorno" onClick={() => reenviarMensagem(m.id, m.texto)}>Reenviar</button>}
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
      <ul>{semAssociacao.map((m) => <MensagemPendente key={m.id} mensagem={m} producao={producao}
        editaveis={board.dealsProducaoEditaveis} executar={executar} />)}</ul>
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
            const alertaAviamentos = resumoFaltasAviamentos(p);
            const inicio = p.inicioCostura || prazo.data;
            const esquerda = inicio ? Math.max(0, indiceDia(inicio, janela.inicio)) * LARGURA_DIA : 0;
            const fim = prazo.data ? Math.min(janela.dias - 1, indiceDia(prazo.data, janela.inicio)) : 0;
            const largura = p.inicioCostura && prazo.data ? Math.max(16, (fim - Math.max(0, indiceDia(p.inicioCostura, janela.inicio)) + 1) * LARGURA_DIA - 6) : 14;
            return <div className="gantt__linha" key={p.dealId}>
              <button className="gantt__os gantt__fixo" type="button" onClick={() => setAberta(p.dealId)}><strong>OS {p.os}</strong><span>{p.peca || p.referencia || 'Sem descrição'}</span><span className="gantt__alertas">{alertaAviamentos.costura > 0 && <em className="gantt__sinal gantt__sinal--costura" aria-label={alertaAviamentos.textoCostura}>🚫 {alertaAviamentos.costura}</em>}{alertaAviamentos.acabamento > 0 && <em className="gantt__sinal gantt__sinal--acabamento" aria-label={alertaAviamentos.textoAcabamento}>⚠️ {alertaAviamentos.acabamento}</em>}</span></button>
              <div className="gantt__pista" style={{ width: janela.dias * LARGURA_DIA }}>
                {prazo.data ? <button type="button" onClick={() => setAberta(p.dealId)} title={`OS ${p.os} · ${ddmm(prazo.data)}`}
                  className={`gantt__barra gantt__barra--${status.status.toLowerCase()} ${prazo.origem === 'LEAD_TIME' ? 'gantt__barra--lead' : ''} ${!p.inicioCostura ? 'gantt__barra--marco' : ''} ${alertaAviamentos.costura ? 'gantt__barra--bloqueio' : alertaAviamentos.acabamento ? 'gantt__barra--falta' : ''}`}
                  style={{ left: esquerda + 3, width: largura }}><span>{alertaAviamentos.costura > 0 && <span className="gantt__alerta" aria-label={alertaAviamentos.textoCostura}>🚫</span>}{alertaAviamentos.acabamento > 0 && <span className="gantt__alerta" aria-label={alertaAviamentos.textoAcabamento}>⚠️</span>}{p.os}</span></button>
                  : <button type="button" className="gantt__sem-prazo" onClick={() => setAberta(p.dealId)}>Sem prazo</button>}
              </div>
            </div>;
          })}
        </div>)}
        {filtradas.length === 0 && <p className="gantt__vazio">Nenhuma OS encontrada com estes filtros.</p>}
      </div>
    </div>
    {selecionada && <PainelProducao key={selecionada.dealId} item={selecionada} board={board} hojeIso={hojeIso} executar={executar} onFechar={() => setAberta(null)} />}
  </div>;
}
