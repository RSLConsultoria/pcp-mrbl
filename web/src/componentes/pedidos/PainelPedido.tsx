import { useMemo, useState } from 'react';
import type { Acao, Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { lerQuantidade, mensagemSucesso } from '../../regras/acoes';
import { ddmm } from '../../regras/datas';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import { nomeLocal, nomeOrigem, quemDoPedido, resumoAlteracoes, validarGerarPedido, type EstadoEditavel } from '../../regras/pedidos';
import { acaoEditarPedido, estadoDoPedido, historicoDoPedido, pedidoEditavel, podeDarBaixa } from '../../regras/pedidosQuadro';
import { formatarQtd, qtdComUn, quantidadeParaCampo } from '../../regras/quantidade';
import { Historico } from '../painel/Historico';
import { CamposPedido, type FormPedido } from './CamposPedido';
import { ConfirmarBaixa } from './ConfirmarBaixa';
import { LinhaItemPedido, type TextoItem } from './LinhaItemPedido';
import { ResumoAlteracoes } from './ResumoAlteracoes';

interface Props {
  pedido: Pedido;
  board: Board;
  etapas: EtapaPedido[];
  executar: Executar;
  onFechar: () => void;
}

// Painel do pedido: edição com o resumo exato do que será gravado. Remontado (key) a cada versão.
export function PainelPedido({ pedido, board, etapas, executar, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const editavel = pedidoEditavel(board, pedido);
  const antes = useMemo(() => estadoDoPedido(pedido), [pedido]);
  const textosIniciais = useMemo(
    () => Object.fromEntries(pedido.itens.map((i) => [i.itemId, { qtd: quantidadeParaCampo(i.qtd), fornecedor: i.fornecedor }])) as Record<string, TextoItem>,
    [pedido]
  );
  const [form, setForm] = useState<FormPedido>(() => ({
    etapa: pedido.etapa, origem: pedido.origem, quem: pedido.quem, local: pedido.local, previsao: pedido.previsao, responsavel: pedido.responsavel
  }));
  const [textos, setTextos] = useState(textosIniciais);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const restaDe = (dealId: string, itemId: string) =>
    board.caixas.find((c) => c.dealId === dealId)?.itens.find((i) => i.id === itemId)?.resta ?? Number.POSITIVE_INFINITY;
  const mexidos = pedido.itens.filter((i) => textos[i.itemId].qtd !== textosIniciais[i.itemId].qtd);
  const erros = validarGerarPedido(mexidos.map((i) => ({ itemId: i.itemId, un: i.un, resta: restaDe(i.dealId, i.itemId) })),
    Object.fromEntries(mexidos.map((i) => [i.itemId, textos[i.itemId].qtd])));
  const depois: EstadoEditavel = {
    etapa: form.etapa ?? pedido.etapa, origem: form.origem, quem: form.quem.trim(), local: form.local,
    previsao: form.previsao, responsavel: form.responsavel,
    itens: antes.itens.map((i) => {
      const q = erros[i.itemId] ? null : lerQuantidade(textos[i.itemId].qtd);
      return { ...i, qtd: q ?? i.qtd, fornecedor: textos[i.itemId].fornecedor.trim() };
    })
  };
  const linhas = resumoAlteracoes(antes, depois, etapas);
  const temErro = Object.keys(erros).length > 0;

  async function salvar() {
    const acao = acaoEditarPedido(pedido, antes, depois);
    if (!acao || temErro) return;
    setEnviando(true);
    await executar(acao, mensagemSucesso(acao));
    setEnviando(false);
  }

  async function baixar() {
    const acao: Acao = { tipo: 'baixar_pedido', pedidoId: pedido.id, versao: pedido.versao };
    setBaixando(true);
    await executar(acao, mensagemSucesso(acao));
    setBaixando(false);
  }

  const historico = historicoDoPedido(board.caixas, pedido.id);
  const nomeEtapa = etapas.find((e) => e.id === pedido.etapa)?.nome ?? pedido.etapa;
  return (
    <aside className="painel" aria-label={`Pedido ${pedido.id}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: pedido.origem === 'CLIENTE' ? 'var(--signal)' : 'var(--navy)' }} />Pedido de itens</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <div className="painel__os">{pedido.id}</div>
        <div className="painel__peca">{[nomeOrigem(pedido.origem), quemDoPedido(pedido)].filter(Boolean).join(' · ')}</div>
        <div className="painel__meta">{[pedido.criadoEm && `criado ${ddmm(pedido.criadoEm)}`, nomeEtapa].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="painel__corpo">
        {editavel ? (
          <>
            <CamposPedido valor={form} onMudar={setForm} usuarios={board.usuarios ?? []} etapas={etapas} />
            <section className="secao">
              <h3 className="secao__titulo">Itens do pedido <span>{pedido.itens.length}</span></h3>
              <ul className="linhas-itens">
                {pedido.itens.map((i) => {
                  const resta = restaDe(i.dealId, i.itemId);
                  return (
                    <LinhaItemPedido key={i.itemId} os={i.os} nome={i.nome} un={i.un}
                      detalhe={Number.isFinite(resta) ? `resta ${qtdComUn(resta, i.un)} na caixa` : ''}
                      valor={textos[i.itemId]} erro={erros[i.itemId]}
                      onMudar={(v) => setTextos((t) => ({ ...t, [i.itemId]: v }))} />
                  );
                })}
              </ul>
            </section>
            <ResumoAlteracoes linhas={linhas} />
            <div className="acoes">
              <button type="button" className="botao botao--navy" disabled={linhas.length === 0 || temErro || enviando} onClick={salvar}>
                {linhas.length === 0 ? 'Nada alterado' : 'Salvar alterações'}
              </button>
            </div>
            {podeDarBaixa(pedido, etapas) && (
              <section className="secao">
                <h3 className="secao__titulo">Material chegou</h3>
                <ConfirmarBaixa pedido={pedido} baixando={baixando} onBaixar={baixar} />
              </section>
            )}
          </>
        ) : (
          <>
            <p className="item__nota" role="note">
              {pedido.finalizado ? `Pedido finalizado: baixa registrada nas caixas em ${ddmm(pedido.baixadoEm)}.` : MSG_SOMENTE_LEITURA}
            </p>
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
                    <span className="item__conta">{[formatarQtd(i.qtd, i.un, null), i.fornecedor].filter(Boolean).join(' · ')}</span>
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
