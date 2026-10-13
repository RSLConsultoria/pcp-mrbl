import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { lerQuantidade, mensagemSucesso } from '../../regras/acoes';
import { ddmm } from '../../regras/datas';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import {
  MSG_ITEM_MUDOU, clientesDasCaixas, erroEdicaoPedido, etapaFinal, nomeLocal, nomeOrigem, opcoesDeQuem, quemDoPedido, resumoAlteracoes, validarGerarPedido, type EstadoEditavel
} from '../../regras/pedidos';
import {
  acaoEditarPedido, camposAlterados, comAlterados, estadoDoPedido, etapaNoQuadro, historicoDoPedido, partesDoPedido, pedidoEditavel, textoFamilia
} from '../../regras/pedidosQuadro';
import { formatarQtd, qtdComUn, quantidadeParaCampo } from '../../regras/quantidade';
import { Historico } from '../painel/Historico';
import { CamposPedido, type FormPedido } from './CamposPedido';
import { DividirPedido } from './DividirPedido';
import { LinhaItemPedido, type TextoItem } from './LinhaItemPedido';
import { ResumoAlteracoes } from './ResumoAlteracoes';

interface Props {
  pedido: Pedido;
  board: Board;
  etapas: EtapaPedido[];
  executar: Executar;
  onFechar: () => void;
}

// Painel do pedido: edição com o resumo exato do que será gravado. A etapa muda só arrastando
// o card. O formulário é o pedido como está agora mais o que o usuário mudou: se o pedido mudar
// com o painel aberto (arraste, ação na fila, recarga), os campos não mexidos acompanham e o que
// foi digitado fica. Pedido com baixa (ou finalizado) é só leitura. Salvar não espera o servidor:
// o board já mostra as alterações (e volta atrás se ele recusar).
export function PainelPedido({ pedido, board, etapas, executar, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const editavel = pedidoEditavel(board, pedido);
  const antes = useMemo(() => estadoDoPedido(pedido), [pedido]);
  const textosIniciais = useMemo(
    () => Object.fromEntries(antes.itens.map((i) => [i.itemId, { qtd: quantidadeParaCampo(i.qtd), fornecedor: i.fornecedor, previsao: i.previsao }])) as Record<string, TextoItem>,
    [antes]
  );
  const formInicial: FormPedido = {
    origem: pedido.origem, quem: pedido.quem, local: pedido.local, previsao: pedido.previsao, responsavel: pedido.responsavel
  };
  // Só o que o usuário mudou; o resto vem do pedido como está agora (regras/pedidosQuadro.ts).
  const [formAlterado, setFormAlterado] = useState<Partial<FormPedido>>({});
  const [textosAlterados, setTextosAlterados] = useState<Record<string, Partial<TextoItem>>>({});
  const form = comAlterados(formInicial, formAlterado);
  const textos = Object.fromEntries(Object.entries(textosIniciais).map(([k, t]) => [k, comAlterados(t, textosAlterados[k] ?? {})])) as Record<string, TextoItem>;
  // Depois de salvar o botão vira "Nada alterado" (desabilitado) e o foco iria para o <body>:
  // vai para o título do painel.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [focarTitulo, setFocarTitulo] = useState(false);
  useEffect(() => {
    if (!focarTitulo) return;
    tituloRef.current?.focus();
    setFocarTitulo(false);
  }, [focarTitulo]);

  const restaDe = (dealId: string, itemId: string) =>
    board.caixas.find((c) => c.dealId === dealId)?.itens.find((i) => i.id === itemId)?.resta ?? Number.POSITIVE_INFINITY;
  const mexidos = pedido.itens.filter((i) => textos[i.itemId].qtd !== textosIniciais[i.itemId].qtd);
  const erros = validarGerarPedido(mexidos.map((i) => ({ itemId: i.itemId, un: i.un, resta: restaDe(i.dealId, i.itemId), mudou: i.itemMudou })),
    Object.fromEntries(mexidos.map((i) => [i.itemId, textos[i.itemId].qtd])));
  const depois: EstadoEditavel = {
    // no painel origem e local sempre vêm do pedido (nunca "Selecionar")
    origem: form.origem || pedido.origem, quem: form.quem.trim(), local: form.local || pedido.local,
    previsao: form.previsao, responsavel: form.responsavel,
    itens: antes.itens.map((i) => {
      const q = erros[i.itemId] ? null : lerQuantidade(textos[i.itemId].qtd);
      return { ...i, qtd: q ?? i.qtd, fornecedor: textos[i.itemId].fornecedor.trim(), previsao: textos[i.itemId].previsao ?? '' };
    })
  };
  const linhas = resumoAlteracoes(antes, depois);
  const erroDados = erroEdicaoPedido(antes, depois); // não deixa limpar fornecedor/cliente nem responsável
  const temErro = Object.keys(erros).length > 0 || erroDados !== null;
  const clientes = clientesDasCaixas(board.caixas, pedido.itens.map((i) => i.dealId));
  const fornecedores = board.fornecedores ?? [];

  function salvar() {
    const acao = acaoEditarPedido(pedido, antes, depois);
    if (!acao || temErro) return;
    void executar(acao, mensagemSucesso(acao));
    // o pedido na tela já tem as alterações (board otimista): o formulário volta a segui-lo
    setFormAlterado({});
    setTextosAlterados({});
    setFocarTitulo(true);
  }

  const historico = historicoDoPedido(board.caixas, pedido.id);
  const nomeEtapa = etapas.find((e) => e.id === etapaNoQuadro(pedido, etapas))?.nome ?? pedido.etapa;
  const todos = board.pedidos ?? [];
  const familia = textoFamilia(pedido, partesDoPedido(todos, pedido.id).length);
  // item que saiu no corte sem correspondente: avisa enquanto o pedido não deu a baixa
  const avisoDe = (i: Pedido['itens'][number]) => (i.itemMudou && !pedido.baixadoEm && !pedido.finalizado ? MSG_ITEM_MUDOU : undefined);
  const nota = pedido.finalizado
    ? `Pedido finalizado${pedido.concluidoEm ? ` em ${ddmm(pedido.concluidoEm)}` : ''}: o destino confirmou o recebimento.`
    : pedido.baixadoEm
      ? `Baixa registrada nas caixas em ${ddmm(pedido.baixadoEm)}. Quando o destino confirmar o recebimento, arraste o card para ${etapaFinal(etapas)?.nome ?? 'a última etapa'}.`
      : MSG_SOMENTE_LEITURA;
  return (
    <aside className="painel" aria-label={`Pedido ${pedido.id}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: pedido.origem === 'CLIENTE' ? 'var(--signal)' : 'var(--navy)' }} />Pedido de itens</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <h2 ref={tituloRef} className="painel__os painel__titulo-foco" tabIndex={-1}>{pedido.id}</h2>
        <div className="painel__peca">{[nomeOrigem(pedido.origem), quemDoPedido(pedido)].filter(Boolean).join(' · ')}</div>
        <div className="painel__meta">{[pedido.criadoEm && `criado ${ddmm(pedido.criadoEm)}`, nomeEtapa].filter(Boolean).join(' · ')}</div>
        {familia && <div className="painel__meta painel__familia">{familia}</div>}
      </div>
      <div className="painel__corpo">
        {editavel ? (
          <>
            <CamposPedido valor={form} onMudar={(v) => setFormAlterado(camposAlterados(formInicial, v))}
              fornecedores={fornecedores} clientes={clientes} responsaveis={board.responsaveis ?? []} />
            <section className="secao">
              <h3 className="secao__titulo">Itens do pedido <span>{pedido.itens.length}</span></h3>
              <ul className="linhas-itens">
                {pedido.itens.map((i) => {
                  const resta = restaDe(i.dealId, i.itemId);
                  return (
                    <LinhaItemPedido key={i.itemId} os={i.os} nome={i.nome} un={i.un}
                      detalhe={Number.isFinite(resta) ? `resta ${qtdComUn(resta, i.un)} na caixa` : ''} aviso={avisoDe(i)}
                      valor={textos[i.itemId]} erro={erros[i.itemId]} fornecedores={opcoesDeQuem(form.origem, fornecedores, clientes)}
                      onMudar={(v) => setTextosAlterados((t) => ({ ...t, [i.itemId]: camposAlterados(textosIniciais[i.itemId], v) }))} />
                  );
                })}
              </ul>
            </section>
            <ResumoAlteracoes linhas={linhas} />
            <div className="acoes">
              {erroDados && <p className="campo__erro" role="alert">{erroDados}</p>}
              <button type="button" className="botao botao--navy" disabled={linhas.length === 0 || temErro} onClick={salvar}>
                {linhas.length === 0 ? 'Nada alterado' : 'Salvar alterações'}
              </button>
            </div>
            <DividirPedido pedido={pedido} pedidos={todos} etapas={etapas} executar={executar} />
          </>
        ) : (
          <>
            <p className="item__nota" role="note">{nota}</p>
            <dl className="leitura">
              <div><dt>Etapa</dt><dd>{nomeEtapa}</dd></div>
              <div><dt>Previsão de entrega</dt><dd>{pedido.previsao ? ddmm(pedido.previsao) : '—'}</dd></div>
              <div><dt>Local de entrega</dt><dd>{nomeLocal(pedido.local)}</dd></div>
              <div><dt>Responsável</dt><dd>{pedido.responsavel || '—'}</dd></div>
            </dl>
            <section className="secao">
              <h3 className="secao__titulo">Itens do pedido <span>{pedido.itens.length}</span></h3>
              <ul className="itens">
                {pedido.itens.map((i) => (
                  <li key={i.itemId} className="item">
                    <span className="item__nome">OS {i.os} · {i.nome}</span>
                    <span className="item__conta">
                      {[formatarQtd(i.qtd, i.un, null), i.fornecedor, i.previsao && `previsão ${ddmm(i.previsao)}`].filter(Boolean).join(' · ')}
                    </span>
                    {avisoDe(i) && <span className="selo-dias selo-dias--atrasado aviso-corte">{avisoDe(i)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <Historico entradas={historico} />
      </div>
    </aside>
  );
}
