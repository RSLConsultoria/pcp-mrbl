import { useEffect, useId, useRef, useState } from 'react';
import type { Acao, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import {
  entraNaUltimaEtapa, etapasParaDividir, partesPorPrevisao, previsoesDiferentes, proximoIdParte, resumoDivisao,
  resumoDivisaoPorPrevisao, textoConfirmarResolvido, validarDivisao, type LinhaDivisao
} from '../../regras/pedidosQuadro';
import { qtdComUn, quantidadeParaCampo } from '../../regras/quantidade';
import { ConfirmarResolvido } from './ConfirmarResolvido';

interface Props {
  pedido: Pedido;
  pedidos: Pedido[]; // todos do board, para prever o id da parte nova
  etapas: EtapaPedido[];
  executar: Executar;
}

type Modo = 'fechado' | 'itens' | 'previsao';

// Parte do pedido chegou: os itens marcados (com a quantidade que chegou) viram um pedido
// novo PED-xxxx.n na etapa escolhida; o original fica com o resto. Atalho "Dividir por
// previsão": uma parte por data de previsão dos itens (a mais próxima fica no pedido).
export function DividirPedido({ pedido, pedidos, etapas, executar }: Props) {
  const id = useId();
  const [modo, setModo] = useState<Modo>('fechado');
  const { opcoes, padrao } = etapasParaDividir(etapas, pedido.etapa);
  const [etapa, setEtapa] = useState(padrao);
  const iniciais = (): LinhaDivisao[] => pedido.itens.map((i) => ({ itemId: i.itemId, chegou: false, qtd: quantidadeParaCampo(i.qtd) }));
  const [linhas, setLinhas] = useState<LinhaDivisao[]>(iniciais);
  const [confirmando, setConfirmando] = useState(false);
  const abrirRef = useRef<HTMLButtonElement>(null);
  const primeiroRef = useRef<HTMLInputElement>(null);
  const porPrevisaoRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);
  const comPrevisoes = previsoesDiferentes(pedido);

  useEffect(() => {
    if (modo === 'itens') primeiroRef.current?.focus();
    else if (modo === 'previsao') porPrevisaoRef.current?.focus();
    else if (voltarFoco.current) { voltarFoco.current = false; abrirRef.current?.focus(); }
  }, [modo]);

  if (opcoes.length === 0 && !comPrevisoes) return null;
  const fechar = () => { voltarFoco.current = true; setConfirmando(false); setModo('fechado'); };

  if (modo === 'fechado') {
    return (
      <div className="acoes">
        {opcoes.length > 0 && (
          <button ref={abrirRef} type="button" className="botao botao--contorno"
            onClick={() => { setLinhas(iniciais()); setEtapa(padrao); setConfirmando(false); setModo('itens'); }}>
            Dividir pedido
          </button>
        )}
        {comPrevisoes && (
          <button type="button" className="botao botao--contorno" onClick={() => setModo('previsao')}>
            Dividir por previsão
          </button>
        )}
      </div>
    );
  }

  if (modo === 'previsao') {
    const partes = partesPorPrevisao(pedido, pedidos);
    function confirmarPrevisao() {
      const acao: Acao = { tipo: 'dividir_por_previsao', pedidoId: pedido.id, versao: pedido.versao };
      void executar(acao, (r) => mensagemSucesso(acao, undefined, { partes: r.partes?.length ?? partes.length }));
      setModo('fechado');
    }
    return (
      <section className="secao divisao" aria-label={`Dividir ${pedido.id} por previsão`}>
        <h3 className="secao__titulo">Dividir por previsão</h3>
        <p className="divisao__ajuda">Cada data de previsão vira uma parte, na etapa atual. A data mais próxima fica no {pedido.id}.</p>
        <ul className="divisao__partes" aria-live="polite">
          {resumoDivisaoPorPrevisao(pedido, partes).map((l) => <li key={l} className="divisao__resumo">{l}</li>)}
        </ul>
        <div className="acoes">
          <button ref={porPrevisaoRef} type="button" className="botao botao--signal" onClick={confirmarPrevisao}>
            Confirmar divisão por previsão
          </button>
          <button type="button" className="botao botao--leve" onClick={fechar}>Cancelar</button>
        </div>
      </section>
    );
  }

  const v = validarDivisao(pedido, linhas);
  const temErroItem = Object.keys(v.erros).length > 0;
  const nomeEtapa = etapas.find((e) => e.id === etapa)?.nome ?? etapa;
  const parteId = proximoIdParte(pedidos, pedido.id);
  const pronto = !temErroItem && v.geral === null && etapa !== '';
  const mudar = (itemId: string, m: Partial<LinhaDivisao>) => {
    setConfirmando(false);
    setLinhas((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...m } : l)));
  };
  const algumMarcado = linhas.some((l) => l.chegou);
  // a parte que vai para a última etapa (Resolvido) já nasce com a baixa: pede confirmação
  const paraUltima = entraNaUltimaEtapa(pedido.etapa, etapa, etapas);
  const itensDaParte = pedido.itens.filter((i) => v.itens.some((x) => x.itemId === i.itemId));

  function confirmar() {
    if (!pronto) return;
    const acao: Acao = { tipo: 'dividir_pedido', pedidoId: pedido.id, versao: pedido.versao, etapa, itens: v.itens };
    void executar(acao, (r) => mensagemSucesso(acao, undefined, { pedidoId: r.pedidoId, etapa: nomeEtapa }));
    setConfirmando(false);
    setModo('fechado');
  }

  return (
    <section className="secao divisao" aria-label={`Dividir ${pedido.id}`}>
      <h3 className="secao__titulo">Dividir pedido</h3>
      <p className="divisao__ajuda">Marque o que chegou. Esses itens viram um pedido novo; o {pedido.id} fica com o resto.</p>
      <ul className="divisao__itens">
        {pedido.itens.map((i, idx) => {
          const l = linhas.find((x) => x.itemId === i.itemId)!;
          const erro = l.chegou ? v.erros[i.itemId] : undefined;
          const base = `${id}-${idx}`;
          return (
            <li key={i.itemId} className={l.chegou ? 'divisao__item divisao__item--marcado' : 'divisao__item'}>
              <label className="divisao__marca">
                <input ref={idx === 0 ? primeiroRef : undefined} type="checkbox" checked={l.chegou}
                  aria-label={`Chegou ${i.nome}`} onChange={(e) => mudar(i.itemId, { chegou: e.target.checked })} />
                <span className="divisao__nome">
                  <span><span className="linha-item__os">OS {i.os}</span> · {i.nome}</span>
                  <span className="linha-item__detalhe">no pedido: {i.qtd !== null ? qtdComUn(i.qtd, i.un) : '—'}</span>
                </span>
              </label>
              <div className="campo divisao__qtd">
                <label htmlFor={`${base}-qtd`}>Chegou{i.un ? ` (${i.un})` : ''}</label>
                <input id={`${base}-qtd`} type="text" inputMode="decimal" autoComplete="off" value={l.qtd} disabled={!l.chegou}
                  aria-label={`Quantidade que chegou de ${i.nome}`} aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${base}-erro` : undefined}
                  onChange={(e) => mudar(i.itemId, { qtd: e.target.value })} />
              </div>
              {erro && <p id={`${base}-erro`} className="campo__erro divisao__erro">{erro}</p>}
            </li>
          );
        })}
      </ul>
      <div className="campo">
        <label htmlFor={`${id}-etapa`}>Mover para</label>
        <select id={`${id}-etapa`} value={etapa} onChange={(e) => { setConfirmando(false); setEtapa(e.target.value); }}>
          {opcoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      {pronto ? (
        <p className="divisao__resumo" aria-live="polite">{resumoDivisao(pedido, v.itens, parteId, nomeEtapa)}</p>
      ) : (
        v.geral && algumMarcado && <p className="campo__erro" role="alert">{v.geral}</p>
      )}
      {confirmando ? (
        <ConfirmarResolvido rotulo={`Confirmar ${nomeEtapa} da divisão do ${pedido.id}`}
          texto={textoConfirmarResolvido(itensDaParte, nomeEtapa)} ocupado={false}
          onConfirmar={confirmar} onCancelar={() => setConfirmando(false)} />
      ) : (
        <div className="acoes">
          <button type="button" className="botao botao--signal" disabled={!pronto}
            onClick={() => (paraUltima ? setConfirmando(true) : confirmar())}>
            Confirmar divisão
          </button>
          <button type="button" className="botao botao--leve" onClick={fechar}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
