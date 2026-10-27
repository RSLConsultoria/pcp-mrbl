import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, buscarPeca, ErroConfiguracao } from '../api/client';
import type { Board, CandidatoPeca, Producao, RespostaPeca } from '../api/tipos';
import { ConversaWhatsapp } from '../componentes/ConversaWhatsapp';
import type { Executar } from '../hooks/useAcao';
import { itemAberto } from '../regras/colunas';
import { dataHora, ddmm, diaIso } from '../regras/datas';
import {
  cardPrincipal, caixasDaOs, dealDaAnotacao, erroAnotacao, linhaDoTempo, MAX_ANOTACAO, podeAnotar, producaoDaOs, resumoSituacao,
  ROTULO_FONTE, urlCard, urlHub, type EventoPeca
} from '../regras/peca';
import { situacaoPrazo } from '../regras/producao';
import { buscaDaPeca, hashDaPeca } from '../regras/telas';
import { nomeDoTipo } from '../regras/texto';

export interface PropsPeca { board: Board; token: string; hoje: Date; executar: Executar; aoExpirar: () => void }

const MSG_PLOOMES_FORA = 'Não foi possível ler o Ploomes agora. Mostrando só o que o app tem desta OS.';
type Aba = 'tempo' | 'caixas' | 'prazos' | 'whatsapp' | 'emails';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'tempo', nome: 'Linha do tempo' }, { id: 'caixas', nome: 'Caixas e faltas' }, { id: 'prazos', nome: 'Oficina e prazos' },
  { id: 'whatsapp', nome: 'WhatsApp' }, { id: 'emails', nome: 'E-mails do PCP' }
];

type Estado =
  | { tipo: 'vazio' }
  | { tipo: 'carregando' }
  | { tipo: 'nada' }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'candidatos'; candidatos: CandidatoPeca[] }
  | { tipo: 'pronto'; os: string; ploomes: RespostaPeca | null; aviso: string };

// A busca mora no hash (#peca/<q>): links dos painéis e o recarregar caem no mesmo dossiê.
function useBuscaDaPeca(): string {
  const [q, setQ] = useState(() => buscaDaPeca(window.location.hash));
  useEffect(() => {
    const aoMudar = () => setQ(buscaDaPeca(window.location.hash));
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return q;
}

export function Peca({ board, token, hoje, executar, aoExpirar }: PropsPeca) {
  const q = useBuscaDaPeca();
  const [campo, setCampo] = useState(q);
  const [estado, setEstado] = useState<Estado>({ tipo: 'vazio' });
  const expirar = useRef(aoExpirar);
  expirar.current = aoExpirar;
  useEffect(() => setCampo(q), [q]);
  useEffect(() => {
    if (!q) {
      setEstado({ tipo: 'vazio' });
      return;
    }
    let vivo = true;
    setEstado({ tipo: 'carregando' });
    buscarPeca(token, q).then((r) => {
      if (!vivo) return;
      const candidatos = r.candidatos ?? [];
      if (candidatos.length === 1) {
        window.location.replace(hashDaPeca(candidatos[0].os));
        return;
      }
      setEstado(candidatos.length ? { tipo: 'candidatos', candidatos } : { tipo: 'pronto', os: r.os || q, ploomes: r, aviso: '' });
    }).catch((e: unknown) => {
      if (!vivo) return;
      if (e instanceof ApiError && e.status === 401) return expirar.current();
      if (e instanceof ApiError && e.status === 404) return setEstado({ tipo: 'nada' });
      if (e instanceof ApiError && e.status === 400) return setEstado({ tipo: 'erro', texto: e.message });
      if (e instanceof ErroConfiguracao) return setEstado({ tipo: 'erro', texto: e.message });
      // Ploomes fora (502) ou sem conexão: com uma OS na busca, o dossiê sai só do board.
      setEstado(/^\d+$/.test(q) ? { tipo: 'pronto', os: q, ploomes: null, aviso: MSG_PLOOMES_FORA } : { tipo: 'erro', texto: MSG_PLOOMES_FORA });
    });
    return () => { vivo = false; };
  }, [q, token]);
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const v = campo.trim();
    if (v) window.location.hash = hashDaPeca(v);
  };
  return (
    <div className="peca">
      <form className="peca__busca" role="search" onSubmit={buscar}>
        <label>OS ou referência<input type="search" value={campo} maxLength={60} placeholder="Ex.: 123456 ou REF-01" onChange={(e) => setCampo(e.target.value)} /></label>
        <button type="submit" className="botao botao--navy">Abrir</button>
      </form>
      {estado.tipo === 'vazio' && <p className="peca__vazio">Busque uma OS ou referência para ver tudo dela: Ploomes, caixas, pedidos, produção e WhatsApp.</p>}
      {estado.tipo === 'carregando' && <p className="peca__vazio" role="status">Lendo o Ploomes…</p>}
      {estado.tipo === 'nada' && <p className="peca__vazio" role="status">Nenhuma OS encontrada no Ploomes.</p>}
      {estado.tipo === 'erro' && <p className="peca__aviso" role="alert">{estado.texto}</p>}
      {estado.tipo === 'candidatos' && <Candidatos lista={estado.candidatos} />}
      {estado.tipo === 'pronto' && <Dossie key={estado.os} board={board} os={estado.os} ploomes={estado.ploomes} aviso={estado.aviso} hoje={hoje} executar={executar} />}
    </div>
  );
}

function Candidatos({ lista }: { lista: CandidatoPeca[] }) {
  return (
    <section className="peca__candidatos" aria-label="OS encontradas">
      <h2>Mais de uma OS com essa referência</h2>
      <ul>{lista.map((c) => <li key={c.os}><a href={hashDaPeca(c.os)}>
        <strong>OS {c.os}</strong><span>{c.peca || '—'}</span><span>{[c.etapa, c.funil].filter(Boolean).join(' · ')}</span>
      </a></li>)}</ul>
    </section>
  );
}

interface PropsDossie { board: Board; os: string; ploomes: RespostaPeca | null; aviso: string; hoje: Date; executar: Executar }

function Dossie({ board, os, ploomes, aviso, hoje, executar }: PropsDossie) {
  const [aba, setAba] = useState<Aba>('tempo');
  const cards = ploomes?.cards ?? [];
  const trilha = ploomes?.trilha ?? null;
  const principal = cardPrincipal(cards);
  const producao = producaoDaOs(board, os);
  const caixas = caixasDaOs(board, os);
  const resumo = resumoSituacao(board, os);
  const eventos = useMemo(() => linhaDoTempo(board, ploomes, os), [board, ploomes, os]);
  const peca = principal?.peca || producao?.peca || caixas[0]?.peca || '';
  const cliente = principal?.cliente || producao?.cliente || caixas[0]?.cliente || '';
  const referencia = principal?.referencia || producao?.referencia || caixas[0]?.referencia || '';
  const prazo = producao ? situacaoPrazo(producao, diaIso(hoje)) : null;
  const links = cards.length ? cards.map((c) => ({ dealId: c.dealId, funil: c.funil })) : producao ? [{ dealId: producao.dealId, funil: 'Produção' }] : [];
  return (
    <article className="peca__dossie" aria-label={`Visão da peça da OS ${os}`}>
      <header className="peca__cabecalho">
        <span className="peca__sobre">Visão da peça</span>
        <div className="peca__titulo">
          <h1 className="peca__os">{os}</h1>
          <span className="peca__nome">{peca || 'Peça sem descrição'}</span>
          {cliente && <span className="peca__cliente">{cliente}</span>}
          {referencia && <span className="peca__ref">{referencia}</span>}
        </div>
        <nav className="peca__links" aria-label="Links da OS">
          {links.map((c) => <a key={c.dealId} href={urlCard(c.dealId)} target="_blank" rel="noreferrer">{links.length > 1 ? `Abrir card no Ploomes · ${c.funil}` : 'Abrir card no Ploomes'}</a>)}
          {referencia && <a href={urlHub(referencia)} target="_blank" rel="noreferrer">Ficha técnica no HUB de Peças</a>}
        </nav>
        {trilha && trilha.etapas.length > 0 && <ol className="peca__trilha" aria-label={`Etapas do funil ${trilha.funil}`}>
          {trilha.etapas.map((e) => <li key={e.id} aria-current={e.id === trilha.atualId ? 'step' : undefined}>{e.nome}</li>)}
        </ol>}
        {aviso && <p className="peca__aviso" role="alert">{aviso}</p>}
        {!resumo.temDados && <p className="peca__vazio">Esta OS ainda não tem caixas, pedidos ou mensagens no app.</p>}
      </header>
      <div className="peca__corpo">
        <aside className="peca__lateral" aria-label="Resumo da OS">
          <div className={`peca__prazo peca__prazo--${(prazo?.situacao ?? 'SEM_PRAZO').toLowerCase()}`}>{prazo ? prazo.texto : 'Fora do Controle de produção'}</div>
          <section className="peca__bloco">
            <h2>Produção</h2>
            <dl>
              <div><dt>Etapa</dt><dd>{principal?.etapa || producao?.etapaNome || '—'}</dd></div>
              <div><dt>Oficina</dt><dd>{producao?.oficina || '—'}</dd></div>
              <div><dt>Início</dt><dd>{ddmm(producao?.inicioCostura ?? '') || '—'}</dd></div>
              <div><dt>Data combinada</dt><dd>{ddmm(producao?.dataCombinada ?? '') || '—'}</dd></div>
              <div><dt>Lead time</dt><dd>{ddmm(producao?.leadTime ?? '') || '—'}</dd></div>
              <div><dt>Peças</dt><dd>{producao?.pecas ?? '—'}</dd></div>
              <div><dt>Costura</dt><dd>{!producao ? '—' : producao.prevista ? `prevista ${ddmm(producao.inicioCosturaPrevisto ?? '')}`.trim() : 'real (na Costura)'}</dd></div>
            </dl>
          </section>
          <section className="peca__bloco">
            <h2>Situação hoje</h2>
            <dl>
              <div><dt>Caixas</dt><dd>{resumo.caixas ? `${resumo.caixasComFalta} de ${resumo.caixas} com falta · ${resumo.itensAbertos} ${resumo.itensAbertos === 1 ? 'item' : 'itens'} em aberto` : 'Nenhuma caixa'}</dd></div>
              <div><dt>Pedidos abertos</dt><dd>{resumo.pedidosAbertos.length ? resumo.pedidosAbertos.map((p) => `${p.id} · ${p.etapa}`).join('; ') : 'Nenhum'}</dd></div>
              <div><dt>WhatsApp</dt><dd>{resumo.ultimaMensagem ? `${dataHora(resumo.ultimaMensagem.quando)} · ${resumo.ultimaMensagem.texto}` : 'Sem mensagens'}</dd></div>
            </dl>
          </section>
        </aside>
        <section className="peca__principal">
          <div className="peca__abas" role="tablist" aria-label="Seções da OS">
            {ABAS.map((a) => <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id}
              aria-controls={`painel-${a.id}`} onClick={() => setAba(a.id)}>{a.nome}</button>)}
          </div>
          <div className="peca__painel" role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
            {aba === 'tempo' && <LinhaDoTempo eventos={eventos} board={board} os={os} dealId={dealDaAnotacao(cards, board, os)} executar={executar} />}
            {aba === 'caixas' && <CaixasEFaltas board={board} os={os} />}
            {aba === 'prazos' && <OficinaEPrazos producao={producao} />}
            {aba === 'whatsapp' && <ConversaWhatsapp mensagens={producao?.mensagens ?? []} />}
            {aba === 'emails' && <p className="peca__vazio">Chega na próxima parte da F5.</p>}
          </div>
        </section>
      </div>
    </article>
  );
}

function LinhaDoTempo({ eventos, board, os, dealId, executar }: { eventos: EventoPeca[]; board: Board; os: string; dealId: string; executar: Executar }) {
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  const liberada = podeAnotar(board, dealId);
  const anotar = (e: FormEvent) => {
    e.preventDefault();
    const msg = erroAnotacao(nota);
    if (msg) return setErro(msg);
    setErro('');
    void executar({ tipo: 'anotar_peca', os, dealId, texto: nota.trim() }, 'Anotação registrada');
    setNota('');
  };
  return (
    <>
      <form className="peca__anotar" onSubmit={anotar}>
        <label>Anotar algo no histórico<textarea rows={2} maxLength={MAX_ANOTACAO} value={nota} disabled={!liberada} onChange={(e) => setNota(e.target.value)} /></label>
        <button type="submit" className="botao botao--navy" disabled={!liberada}>Anotar</button>
        {!liberada && <p className="peca__nota">{dealId ? 'Edição liberada em breve para esta OS.' : 'Sem card do Ploomes para anotar.'}</p>}
        {erro && <p className="campo__erro" role="alert">{erro}</p>}
      </form>
      {eventos.length === 0 ? <p className="peca__vazio">Nenhum evento registrado ainda.</p>
        : <ol className="peca__eventos">{eventos.map((e) => <Evento key={e.chave} e={e} />)}</ol>}
    </>
  );
}

function Evento({ e }: { e: EventoPeca }) {
  return (
    <li className="peca__evento">
      <span className="peca__quando">{dataHora(e.quando)}</span>
      <span className={`peca__selo peca__selo--${e.fonte.toLowerCase()}`}>{ROTULO_FONTE[e.fonte]}</span>
      <div>
        <p className={e.desfeita ? 'peca__desfeita' : undefined}>{e.desfeita ? <s>{e.texto}</s> : e.texto}{e.desfeita && ' (desfeita)'}</p>
        <small>{[e.autor, e.enviadoPloomes ? 'enviado ao Ploomes' : ''].filter(Boolean).join(' · ')}</small>
      </div>
    </li>
  );
}

function CaixasEFaltas({ board, os }: { board: Board; os: string }) {
  const caixas = caixasDaOs(board, os);
  if (!caixas.length) return <p className="peca__vazio">Nenhuma caixa desta OS no almoxarifado ainda.</p>;
  return (
    <div className="peca__caixas">{caixas.map((c, k) => {
      const ciclo = c.ciclo === 'CORTE' ? 'Corte' : 'Pedido';
      return (
        <section key={`${c.id}-${c.tipo}-${c.ciclo}-${k}`} className="peca__caixa" aria-label={`Caixa de ${nomeDoTipo(c.tipo)} · ${ciclo}`}>
          <h3>Caixa de {nomeDoTipo(c.tipo)} <span>{ciclo} · {c.saiu ? `saiu ${ddmm(c.saiuEm)}`.trim() : 'no almoxarifado'}</span></h3>
          {c.itens.length === 0 ? <p className="peca__vazio">Sem itens.</p> : <div className="peca__tabela"><table>
            <thead><tr><th>Item</th><th>Falta</th><th>Baixado</th><th>Resta</th><th>Previsão</th><th>Pedido</th></tr></thead>
            <tbody>{c.itens.map((i) => <tr key={i.id} className={itemAberto(i) ? undefined : 'peca__item--ok'}>
              <td>{i.nome}{i.cor && <small> {i.cor}</small>}</td><td>{i.falta ?? '—'} {i.un}</td><td>{i.baixada}</td>
              <td>{i.resta ?? '—'}</td><td>{ddmm(i.previsao) || '—'}</td><td>{i.pedidoId || 'Sem pedido'}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      );
    })}</div>
  );
}

function OficinaEPrazos({ producao }: { producao: Producao | undefined }) {
  if (!producao) return <p className="peca__vazio">Esta OS não está no Controle de produção (só entram as OS na Costura ou previstas para ela).</p>;
  const alteracoes = producao.historico.filter((h) => !h.acao || h.acao === 'PRODUCAO_ALTERAR_COMBINADO');
  return (
    <>
      <dl className="peca__dados">
        <div><dt>Oficina</dt><dd>{producao.oficina}</dd></div>
        <div><dt>Início</dt><dd>{ddmm(producao.inicioCostura) || '—'}</dd></div>
        <div><dt>Data combinada</dt><dd>{ddmm(producao.dataCombinada) || '—'}</dd></div>
        <div><dt>Lead time</dt><dd>{ddmm(producao.leadTime) || '—'}</dd></div>
        <div><dt>Peças</dt><dd>{producao.pecas ?? '—'}</dd></div>
      </dl>
      <h3>Alterações do combinado</h3>
      {alteracoes.length === 0 ? <p className="peca__vazio">Nenhuma alteração registrada.</p>
        : <ol className="peca__eventos">{alteracoes.map((h, k) => <li key={h.id ?? `${h.quando}-${k}`} className="peca__evento peca__evento--simples">
          <span className="peca__quando">{dataHora(h.quando)}</span><div><p>{h.texto}</p><small>{h.usuario}</small></div>
        </li>)}</ol>}
      <p className="peca__nota">A oficina e a data combinada mudam no painel da OS em Controle de produção. <a href="#producao">Abrir Controle de produção</a></p>
    </>
  );
}
