import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Board, MensagemWhatsappSemAssociacao, Producao as ProducaoItem } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { useRascunhoDoBoard } from '../hooks/useValorDoBoard';
import { ConversaWhatsapp } from '../componentes/ConversaWhatsapp';
import { dataHora, ddmm, diaIso } from '../regras/datas';
import { TabelaProducao } from './ProducaoTabela';
import { CargaProducao } from './ProducaoCarga';
import { lerAgrupamento, lerIncluirPrevistas, lerVisao, salvarAgrupamento, salvarIncluirPrevistas, salvarVisao, type AgrupamentoGantt, type VisaoProducao } from '../regras/producaoTabela';
import { agruparPorOficina, chaveEnvioWhatsapp, filtrarProducoes, SITUACOES_PRAZO, type SituacaoPrazo, indicadoresProducao, intervaloBarraProducao, janelaGantt, modeloMensagemProducao, opcoesAssociacaoMensagem, ordenarPorEntrega, prazoProducao, resumoFaltasAviamentos, statusProducao, textoBarraProducao, tituloBarraPrevista, tituloBarraProducao, validarMudancaProducao, type ModeloMensagemProducao } from '../regras/producao';

const LARGURA_DIA = 28;
// Dias antes de hoje que ficam à vista quando o Gantt abre posicionado em hoje (spec F4 §7).
const DIAS_ANTES_DE_HOJE = 3;
const PRODUCAO_VAZIA: ProducaoItem[] = [];
const msDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const indiceDia = (iso: string, inicio: string) => Math.round((msDia(iso) - msDia(inicio)) / 86_400_000);

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

function diasEntre(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => new Date(msDia(inicio) + i * 86_400_000).toISOString().slice(0, 10));
}

function MensagemPendente({ mensagem, producao, editaveis, executar }: {
  mensagem: MensagemWhatsappSemAssociacao;
  producao: ProducaoItem[];
  editaveis: string[] | undefined;
  executar: Executar;
}) {
  const opcoes = opcoesAssociacaoMensagem(producao, mensagem.oficinaId, editaveis);
  const [dealId, setDealId] = useState(opcoes.length === 1 ? opcoes[0].dealId : '');
  const escolhida = opcoes.find((p) => p.dealId === dealId);
  return <li>
    <span>{mensagem.grupoNome || mensagem.oficina || 'Oficina'} · {mensagem.participanteNome || 'Participante'} · {dataHora(mensagem.quando)}</span>
    <p>{mensagem.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : mensagem.texto}</p>
    {mensagem.perguntado && <small className="producao-selo producao-selo--ia">perguntado à oficina</small>}
    {opcoes.length > 0 ? <div className="producao-pendentes__associar">
      <label>Associar à OS<select value={dealId} onChange={(e) => setDealId(e.target.value)}>
        <option value="">Selecione</option>{opcoes.map((p) => <option key={p.dealId} value={p.dealId}>OS {p.os} · {p.peca || p.referencia}</option>)}
      </select></label>
      <button type="button" className="botao botao--contorno" disabled={!escolhida}
        onClick={() => escolhida && void executar({ tipo: 'associar_whatsapp', dealId: escolhida.dealId, mensagemId: mensagem.id, versao: escolhida.versao }, 'Mensagem associada. A interpretação aparece em até 1 minuto.')}>Associar</button>
    </div> : <small>Nenhuma OS editável deste grupo está disponível.</small>}
  </li>;
}

// Mensagem ligada pela IA (22/10): o PCP pode mandá-la para outra OS da mesma oficina.
function TrocarOs({ mensagemId, item, producao, editaveis, executar }: {
  mensagemId: string;
  item: ProducaoItem;
  producao: ProducaoItem[];
  editaveis: string[] | undefined;
  executar: Executar;
}) {
  const opcoes = opcoesAssociacaoMensagem(producao, item.oficinaId, editaveis).filter((p) => p.dealId !== item.dealId);
  const [dealId, setDealId] = useState('');
  const escolhida = opcoes.find((p) => p.dealId === dealId);
  if (!opcoes.length) return null;
  return <div className="producao-pendentes__associar">
    <label>Trocar para a OS<select value={dealId} onChange={(e) => setDealId(e.target.value)}>
      <option value="">Selecione</option>{opcoes.map((p) => <option key={p.dealId} value={p.dealId}>OS {p.os} · {p.peca || p.referencia}</option>)}
    </select></label>
    <button type="button" className="botao botao--contorno" disabled={!escolhida}
      onClick={() => escolhida && void executar({ tipo: 'associar_whatsapp', dealId: escolhida.dealId, mensagemId, versao: escolhida.versao }, 'Mensagem movida para a OS escolhida.')}>Trocar OS</button>
  </div>;
}

function PainelProducao({ item, board, hojeIso, executar, onFechar }: { item: ProducaoItem; board: Board; hojeIso: string; executar: Executar; onFechar: () => void }) {
  const prazo = prazoProducao(item);
  const alertaAviamentos = resumoFaltasAviamentos(item);
  // O formulário acompanha a OS (sugestão aceita, recarga): salvar só a oficina não reenvia uma data velha.
  const [oficinaId, setOficinaId] = useRascunhoDoBoard(item.oficinaId);
  const [dataCombinada, setDataCombinada] = useRascunhoDoBoard(item.dataCombinada);
  const [motivo, setMotivo] = useState('');
  const [motivoSugestao, setMotivoSugestao] = useState('');
  const [erro, setErro] = useState('');
  const [erroMensagem, setErroMensagem] = useState('');
  const [modelo, setModelo] = useState<ModeloMensagemProducao>('COBRANCA_PRAZO');
  const [mensagem, setMensagem] = useState(() => modeloMensagemProducao('COBRANCA_PRAZO', item, hojeIso));
  const [enfileirando, setEnfileirando] = useState(false);
  // OS prevista ainda não chegou na Costura: o servidor recusa escrita, então o painel é só leitura.
  const editavel = !item.prevista && (!board.dealsProducaoEditaveis?.length || board.dealsProducaoEditaveis.includes(item.dealId));
  const motivoSoLeitura = item.prevista ? 'OS ainda não chegou na Costura: só leitura.' : 'Edição liberada em breve para esta OS.';
  const oficina = board.oficinas?.find((o) => o.ploomesId === item.oficinaId);
  const salvar = () => {
    const e = validarMudancaProducao(item, { oficinaId, dataCombinada, motivo });
    if (e) return setErro(e);
    setErro('');
    const enviado = motivo;
    void executar({ tipo: 'alterar_producao', dealId: item.dealId, versao: item.versao, oficinaId, dataCombinada, motivo }, 'Combinado da OS atualizado')
      .then((ok) => { if (ok) setMotivo((atual) => (atual === enviado ? '' : atual)); });
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
    const digitado = mensagem;
    void executar({ tipo: 'enviar_whatsapp', dealId: item.dealId, versao: item.versao, modelo, texto, chave: chaveEnvioWhatsapp() }, 'Mensagem colocada na fila do WhatsApp')
      .then((ok) => {
        // Na fila: a caixa volta ao modelo (se a pessoa não começou outro texto enquanto isso).
        if (ok) setMensagem((atual) => (atual === digitado ? modeloMensagemProducao(modelo, item, hojeIso) : atual));
      })
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
        {item.prevista && <section className="producao-secao producao-previsao" aria-label="Previsão da OS">
          <h3>OS prevista <em className="etiqueta-prevista">prevista</em></h3>
          <div className="producao-resumo">
            <div><span>Etapa atual</span><strong>{item.etapaNome || '—'}</strong></div>
            <div><span>Na etapa desde</span><strong>{ddmm(item.etapaInicio ?? '') || '—'}</strong></div>
            <div><span>Chegada prevista à Costura</span><strong>{ddmm(item.inicioCosturaPrevisto ?? '') || '—'}</strong></div>
            <div><span>Fim previsto da Costura</span><strong>{ddmm(item.fimCosturaPrevisto ?? '') || '—'}</strong></div>
          </div>
          {!item.inicioCosturaPrevisto && <p className="producao-vazio">OS sem peças informadas: sem previsão a partir do Corte.</p>}
        </section>}
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
            : <p className="producao-vazio">{motivoSoLeitura}</p>}
        </section>
        <section className="producao-secao" aria-label="Prazo">
          <h3>Prazo</h3>
          {/* A OS prevista ainda não tem prazo da Costura: mostra a previsão, não "sem prazo". */}
          <p>{item.prevista ? (item.fimCosturaPrevisto ? `${ddmm(item.fimCosturaPrevisto)} · fim previsto da Costura` : 'Sem previsão a partir do Corte')
            : prazo.data ? `${ddmm(prazo.data)} · ${prazo.origem === 'COMBINADA' ? 'data combinada' : 'lead time'}` : 'Sem prazo definido'}</p>
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
          {item.prevista ? <p className="producao-vazio">A mensagem para a oficina fica disponível quando a OS chegar à Costura.</p>
            : !item.oficinaId ? <p className="producao-vazio">Aloque uma oficina antes de preparar a mensagem.</p>
            : !oficina?.grupoConfigurado ? <p className="producao-vazio">Configure o grupo desta oficina na aba OFICINAS.</p>
            : <>
              <label>Modelo<select value={modelo} disabled={!editavel} onChange={(e) => trocarModelo(e.target.value as ModeloMensagemProducao)}>
                <option value="COBRANCA_PRAZO">Cobrança de prazo</option><option value="CONFIRMAR_DATA">Confirmar data</option>
              </select></label>
              <label>Mensagem<textarea rows={5} maxLength={1500} value={mensagem} disabled={!editavel} onChange={(e) => setMensagem(e.target.value)} /></label>
              <small>Será enviada para {oficina.grupoNome || oficina.nome}. O texto pode ser revisado antes de entrar na fila.</small>
              {erroMensagem && <p className="campo__erro" role="alert">{erroMensagem}</p>}
              {editavel ? <button type="button" className="botao botao--signal" disabled={enfileirando} onClick={enfileirarMensagem}>Colocar na fila</button>
                : <p className="producao-vazio">{motivoSoLeitura}</p>}
            </>}
        </section>
        <section className="producao-secao">
          <h3>Sugestões do intérprete <span>{item.sugestoes.filter((s) => s.status === 'PENDENTE').length}</span></h3>
          {item.sugestoes.length === 0 ? <p className="producao-vazio">Nenhuma sugestão para esta OS.</p>
            : <ul className="producao-sugestoes">{item.sugestoes.map((s) => <li key={s.id} className={s.status === 'PENDENTE' ? 'producao-sugestao--pendente' : 'producao-sugestao--decidida'}>
              <span>{s.tipo === 'NOVA_DATA_COMBINADA' ? `Nova data: ${ddmm(s.valor)}` : s.tipo.replaceAll('_', ' ').toLowerCase()}
                {s.status !== 'PENDENTE' && <em className="producao-sugestao__estado">{s.status === 'ACEITA' ? 'aceita' : 'ignorada'}</em>}</span>
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
          <ConversaWhatsapp mensagens={item.mensagens}
            trocarOs={(m) => m.associacao === 'IA' && editavel && <TrocarOs mensagemId={m.id} item={item} producao={board.producao ?? []} editaveis={board.dealsProducaoEditaveis} executar={executar} />}
            reenviar={(m) => m.statusEnvio === 'ERRO' && !m.reenviada && editavel && <button type="button" className="botao botao--contorno" onClick={() => reenviarMensagem(m.id, m.texto)}>Reenviar</button>} />
        </section>
        <section className="producao-secao"><h3>Histórico</h3>{item.historico.length === 0 ? <p className="producao-vazio">Sem alterações registradas.</p>
          : <ul className="producao-historico">{item.historico.map((h, i) => <li key={`${h.quando}-${i}`}><span>{dataHora(h.quando)}</span><p>{h.texto}</p></li>)}</ul>}</section>
      </div>
    </aside>
  );
}

export function Producao({ board, q, hoje, executar, ehAdm }: { board: Board; q: string; hoje: Date; executar: Executar; ehAdm: boolean }) {
  const [oficinaId, setOficinaId] = useState('');
  const [soComFalta, setSoComFalta] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoPrazo | ''>('');
  const [visao, setVisao] = useState<VisaoProducao>(lerVisao);
  const [agrupamento, setAgrupamento] = useState<AgrupamentoGantt>(lerAgrupamento);
  const [aberta, setAberta] = useState<string | null>(null);
  const [incluirPrevistas, setIncluirPrevistas] = useState(lerIncluirPrevistas);
  const hojeIso = diaIso(hoje);
  const producao = board.producao ?? PRODUCAO_VAZIA;
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso, incluirPrevistas }), [producao, q, oficinaId, soComFalta, situacao, hojeIso, incluirPrevistas]);
  // A Carga sempre soma o que vem aí: inclui as previstas.
  const paraCarga = useMemo(() => visao === 'CARGA' ? filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso, incluirPrevistas: true }) : PRODUCAO_VAZIA,
    [visao, producao, q, oficinaId, soComFalta, situacao, hojeIso]);
  const indicadores = useMemo(() => indicadoresProducao(filtradas, hojeIso), [filtradas, hojeIso]);
  const janela = useMemo(() => janelaGantt(filtradas, hojeIso), [filtradas, hojeIso]);
  const dias = useMemo(() => diasEntre(janela.inicio, janela.dias), [janela]);
  const indiceHoje = indiceDia(hojeIso, janela.inicio);
  const grupos = useMemo(() => agruparPorOficina(filtradas), [filtradas]);
  // A tabela parte da mesma ordem do Gantt: grupo a grupo.
  const ordemGantt = useMemo(() => grupos.flatMap(([, itens]) => itens), [grupos]);
  const porEntrega = useMemo(() => agrupamento === 'ENTREGA' ? ordenarPorEntrega(filtradas) : [], [agrupamento, filtradas]);
  const trocarVisao = (v: VisaoProducao) => { setVisao(v); salvarVisao(v); };
  const trocarAgrupamento = (a: AgrupamentoGantt) => { setAgrupamento(a); salvarAgrupamento(a); };
  const trocarPrevistas = (v: boolean) => { setIncluirPrevistas(v); salvarIncluirPrevistas(v); };
  // Ao abrir (ou voltar para) o Gantt, a rolagem horizontal começa em hoje, com alguns dias
  // antes à vista. Só nessa hora: recarga e filtros não mexem na rolagem de quem já rolou.
  const rolagemGantt = useRef<HTMLDivElement>(null);
  const indiceHojeRef = useRef(indiceHoje);
  indiceHojeRef.current = indiceHoje;
  useLayoutEffect(() => {
    const el = rolagemGantt.current;
    if (visao !== 'GANTT' || !el) return;
    el.scrollLeft = Math.max(0, (indiceHojeRef.current - DIAS_ANTES_DE_HOJE) * LARGURA_DIA);
  }, [visao]);
  const selecionada = producao.find((p) => p.dealId === aberta) ?? null;
  const semAssociacao = board.mensagensWhatsappSemAssociacao ?? [];

  // Linha do Gantt: igual nos dois agrupamentos; por entrega, mostra a oficina da OS.
  const linhaGantt = (p: ProducaoItem, comOficina: boolean) => {
    if (p.prevista) return linhaPrevista(p, comOficina);
    const prazo = prazoProducao(p);
    const status = statusProducao(p, hojeIso);
    const alertaAviamentos = resumoFaltasAviamentos(p);
    const intervalo = intervaloBarraProducao(p, hojeIso);
    const esquerda = intervalo ? Math.max(0, indiceDia(intervalo.inicio, janela.inicio)) * LARGURA_DIA : 0;
    const fim = intervalo ? Math.min(janela.dias - 1, indiceDia(intervalo.fim, janela.inicio)) : 0;
    const largura = p.inicioCostura && intervalo ? Math.max(16, (fim - Math.max(0, indiceDia(intervalo.inicio, janela.inicio)) + 1) * LARGURA_DIA - 6) : 14;
    return <div className="gantt__linha" key={p.dealId}>
      <button className="gantt__os gantt__fixo" type="button" onClick={() => setAberta(p.dealId)}><strong>OS {p.os}</strong>{comOficina ? <span className="gantt__os-texto"><span>{p.peca || p.referencia || 'Sem descrição'}</span><span className={`gantt__oficina ${p.oficina === 'ALOCAR' ? 'gantt__oficina--alocar' : ''}`}>{p.oficina || 'Sem oficina'}</span></span> : <span>{p.peca || p.referencia || 'Sem descrição'}</span>}<span className="gantt__alertas">{alertaAviamentos.costura > 0 && <em className="gantt__sinal gantt__sinal--costura" aria-label={alertaAviamentos.textoCostura}>🚫 {alertaAviamentos.costura}</em>}{alertaAviamentos.acabamento > 0 && <em className="gantt__sinal gantt__sinal--acabamento" aria-label={alertaAviamentos.textoAcabamento}>⚠️ {alertaAviamentos.acabamento}</em>}</span></button>
      <div className="gantt__pista" style={{ width: janela.dias * LARGURA_DIA }}>
        {prazo.data ? <button type="button" onClick={() => setAberta(p.dealId)} title={tituloBarraProducao(p)}
          className={`gantt__barra gantt__barra--${status.status.toLowerCase()} ${prazo.origem === 'LEAD_TIME' ? 'gantt__barra--lead' : ''} ${!p.inicioCostura ? 'gantt__barra--marco' : ''} ${alertaAviamentos.costura ? 'gantt__barra--bloqueio' : alertaAviamentos.acabamento ? 'gantt__barra--falta' : ''}`}
          style={{ left: esquerda + 3, width: largura }}><span>{alertaAviamentos.costura > 0 && <span className="gantt__alerta" aria-label={alertaAviamentos.textoCostura}>🚫</span>}{alertaAviamentos.acabamento > 0 && <span className="gantt__alerta" aria-label={alertaAviamentos.textoAcabamento}>⚠️</span>}{textoBarraProducao(p)}</span></button>
          : <button type="button" className="gantt__sem-prazo" onClick={() => setAberta(p.dealId)}>Sem prazo</button>}
      </div>
    </div>;
  };

  // OS prevista: barra tracejada da chegada prevista ao fim previsto, com a etiqueta "prevista".
  const linhaPrevista = (p: ProducaoItem, comOficina: boolean) => {
    const ini = p.inicioCosturaPrevisto ?? '';
    const fim = p.fimCosturaPrevisto ?? '';
    const esquerda = ini ? Math.max(0, indiceDia(ini, janela.inicio)) * LARGURA_DIA : 0;
    const largura = ini && fim ? Math.max(16, (Math.min(janela.dias - 1, indiceDia(fim, janela.inicio)) - Math.max(0, indiceDia(ini, janela.inicio)) + 1) * LARGURA_DIA - 6) : 14;
    return <div className="gantt__linha gantt__linha--prevista" key={p.dealId}>
      <button className="gantt__os gantt__fixo" type="button" onClick={() => setAberta(p.dealId)}><strong>OS {p.os}</strong>
        <span className="gantt__os-texto"><span>{p.peca || p.referencia || 'Sem descrição'}</span>{comOficina && <span className={`gantt__oficina ${p.oficina === 'ALOCAR' ? 'gantt__oficina--alocar' : ''}`}>{p.oficina || 'Sem oficina'}</span>}</span>
        <em className="etiqueta-prevista">prevista</em></button>
      <div className="gantt__pista" style={{ width: janela.dias * LARGURA_DIA }}>
        {ini && fim ? <button type="button" onClick={() => setAberta(p.dealId)} title={tituloBarraPrevista(p)}
          className="gantt__barra gantt__barra--prevista" style={{ left: esquerda + 3, width: largura }}><span>{textoBarraProducao(p)}</span></button>
          : <button type="button" className="gantt__sem-prazo" onClick={() => setAberta(p.dealId)}>Sem previsão</button>}
      </div>
    </div>;
  };

  return <div className="producao-tela">
    <div className="producao-filtros">
      <label>Oficina<select value={oficinaId} onChange={(e) => setOficinaId(e.target.value)}><option value="">Todas</option>{(board.oficinas ?? []).map((o) => <option key={o.ploomesId} value={o.ploomesId}>{o.nome}</option>)}</select></label>
      <label>Situação do prazo<select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoPrazo | '')}><option value="">Todas</option>{SITUACOES_PRAZO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select></label>
      <label className="producao-check"><input type="checkbox" checked={soComFalta} onChange={(e) => setSoComFalta(e.target.checked)} /> Só com falta na costura</label>
      {visao !== 'CARGA' && <label className="producao-check"><input type="checkbox" checked={incluirPrevistas} onChange={(e) => trocarPrevistas(e.target.checked)} /> Incluir previstas</label>}
      {visao === 'GANTT' && <div className="producao-agrupar" role="group" aria-label="Agrupar">
        <span>Agrupar</span>
        <div className="producao-visao">{(['OFICINA', 'ENTREGA'] as const).map((a) => <button key={a} type="button" aria-pressed={agrupamento === a} onClick={() => trocarAgrupamento(a)}>{a === 'OFICINA' ? 'Oficina' : 'Entrega'}</button>)}</div>
      </div>}
      <div className="producao-visao" role="group" aria-label="Visão">
        {(['GANTT', 'TABELA', 'CARGA'] as const).map((v) => <button key={v} type="button" aria-pressed={visao === v} onClick={() => trocarVisao(v)}>{v === 'GANTT' ? 'Gantt' : v === 'TABELA' ? 'Tabela' : 'Carga'}</button>)}
      </div>
    </div>
    <div className="producao-kpis">
      <article><span>OS na Costura</span><strong>{indicadores.os}</strong><small>{plural(indicadores.pecas, 'peça', 'peças')} · {plural(indicadores.oficinas, 'oficina', 'oficinas')}</small></article>
      <article><span>Caixas com falta</span><strong>{indicadores.caixasComFalta}</strong><small>{plural(indicadores.itensEmFalta, 'item aberto', 'itens abertos')}</small></article>
      <article className={indicadores.atrasadas ? 'producao-kpi--erro' : ''}><span>Passaram do prazo</span><strong>{indicadores.atrasadas}</strong><small>pedem acompanhamento</small></article>
      <article><span>Sem data combinada</span><strong>{indicadores.semCombinada}</strong><small>usam lead time ou sem prazo</small></article>
    </div>
    {semAssociacao.length > 0 && <details className="producao-pendentes">
      <summary>{semAssociacao.length} {semAssociacao.length === 1 ? 'mensagem aguardando associação' : 'mensagens aguardando associação'}</summary>
      <ul>{semAssociacao.map((m) => <MensagemPendente key={m.id} mensagem={m} producao={producao}
        editaveis={board.dealsProducaoEditaveis} executar={executar} />)}</ul>
    </details>}
    {(visao === 'CARGA' || incluirPrevistas) && board.previsaoSemHistorico && <p className="producao-aviso" role="status">Previsão sem histórico: as OS previstas usam duração de 1 dia por etapa e fila zero até o cálculo diário das médias.</p>}
    {visao === 'CARGA' ? <CargaProducao lista={paraCarga} oficinas={board.oficinas ?? []} hojeIso={hojeIso} oficinaId={oficinaId} ehAdm={ehAdm} executar={executar} onAbrir={setAberta} />
      : visao === 'TABELA' ? <TabelaProducao lista={ordemGantt} hojeIso={hojeIso} incluirPrevistas={incluirPrevistas} onAbrir={setAberta} /> : <div className="gantt__rolagem" ref={rolagemGantt}>
      <div className="gantt" style={{ width: 260 + janela.dias * LARGURA_DIA }}>
        <div className="gantt__topo">
        <div className="gantt__cabecalho gantt__fixo"><strong>{agrupamento === 'ENTREGA' ? 'OS por entrega' : 'Oficina / OS'}</strong><span>{ddmm(janela.inicio)} — {ddmm(janela.fim)}</span></div>
        <div className="gantt__dias" style={{ width: janela.dias * LARGURA_DIA }}>{dias.map((d) => <div key={d} className={`${d === hojeIso ? 'gantt__dia--hoje' : ''} ${[0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? 'gantt__dia--fim' : ''}`}><span>{d.slice(8)}</span></div>)}</div>
        </div>
        {indiceHoje >= 0 && indiceHoje < janela.dias && <div className="gantt__hoje-coluna" aria-hidden="true" data-testid="gantt-hoje-coluna" style={{ '--dia-hoje': indiceHoje } as CSSProperties} />}
        {agrupamento === 'ENTREGA' ? <div className="gantt__grupo">{porEntrega.map((p) => linhaGantt(p, true))}</div>
          : grupos.map(([oficina, itens]) => <div className="gantt__grupo" key={oficina}>
          <div className={`gantt__grupo-nome gantt__fixo ${oficina === 'ALOCAR' ? 'gantt__grupo-nome--alocar' : ''}`}><strong>{oficina}</strong><span>{itens.length} OS</span></div>
          <div className="gantt__grupo-faixa" />
          {itens.map((p) => linhaGantt(p, false))}
        </div>)}
        {filtradas.length === 0 && <p className="gantt__vazio">Nenhuma OS encontrada com estes filtros.</p>}
      </div>
    </div>}
    {selecionada && <PainelProducao key={selecionada.dealId} item={selecionada} board={board} hojeIso={hojeIso} executar={executar} onFechar={() => setAberta(null)} />}
  </div>;
}
