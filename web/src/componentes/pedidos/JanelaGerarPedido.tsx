import { useRef, useState } from 'react';
import type { Acao } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { arredondar3, lerQuantidade, mensagemSucesso } from '../../regras/acoes';
import { validarGerarPedido } from '../../regras/pedidos';
import { chaveItem, itensQueSairam, textoItensQueSairam, type ItemSelecionado } from '../../regras/pedidosQuadro';
import { formatarQtd, quantidadeParaCampo } from '../../regras/quantidade';
import { Janela } from '../Janela';
import { CamposPedido, type FormPedido } from './CamposPedido';
import { focoDepoisDeGerar } from './FaltasSemPedido';
import { LinhaItemPedido, type TextoItem } from './LinhaItemPedido';

interface Props {
  itens: ItemSelecionado[]; // refeitos a cada recarga do board: só os marcados que ainda podem entrar num pedido
  usuarios: string[];
  executar: Executar;
  onRemover: (chave: string) => void;
  onGerado: (chaves: string[]) => void; // o servidor gravou: tira estes itens da marcação
  onFechar: () => void;
}

const chaveDe = ({ caixa, item }: ItemSelecionado) => chaveItem(caixa.dealId, item.id);
const textoInicial = ({ item }: ItemSelecionado): TextoItem => ({ qtd: quantidadeParaCampo(item.resta), fornecedor: '', previsao: '' });

export function JanelaGerarPedido({ itens, usuarios, executar, onRemover, onGerado, onFechar }: Props) {
  // Itens que estavam na lista ao abrir: se a recarga do board mostra que algum deles entrou
  // em outro pedido (ou foi resolvido) com a janela aberta, ele sai da lista com uma nota.
  const [iniciais] = useState(() => itens.map(chaveDe));
  const [removidos, setRemovidos] = useState<Set<string>>(() => new Set());
  const lista = useRef<HTMLUListElement>(null);
  const gerado = useRef(false);
  const [form, setForm] = useState<FormPedido>({ origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '' });
  const [textos, setTextos] = useState<Record<string, TextoItem>>(() => Object.fromEntries(itens.map((x) => [chaveDe(x), textoInicial(x)])));
  const [tentou, setTentou] = useState(false);

  const textoDe = (x: ItemSelecionado) => textos[chaveDe(x)] ?? textoInicial(x);
  const selecao = itens.map(({ caixa, item }) => ({ itemId: chaveItem(caixa.dealId, item.id), un: item.un, resta: item.resta }));
  const erros = validarGerarPedido(selecao, Object.fromEntries(itens.map((x) => [chaveDe(x), textoDe(x).qtd])));
  const temErro = Object.keys(erros).length > 0;
  const sairam = textoItensQueSairam(itensQueSairam(iniciais, itens, removidos));

  function remover(chave: string, indice: number) {
    const janela = lista.current?.closest<HTMLElement>('[role="dialog"]');
    setRemovidos((r) => new Set(r).add(chave));
    onRemover(chave);
    // O botão some com a linha: o foco vai para o Remover da linha que ficou no lugar.
    requestAnimationFrame(() => {
      const botoes = lista.current?.querySelectorAll<HTMLButtonElement>('.linha-item__remover') ?? [];
      const alvo = botoes[Math.min(indice, botoes.length - 1)] ?? janela?.querySelector<HTMLElement>('select, input');
      alvo?.focus();
    });
  }

  function gerar() {
    setTentou(true);
    if (temErro) {
      lista.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
      return;
    }
    const acao: Acao = {
      tipo: 'gerar_pedido',
      itens: itens.map((x) => {
        const t = textoDe(x);
        // previsão vazia = a do pedido
        return { itemId: x.item.id, dealId: x.caixa.dealId, qtd: arredondar3(lerQuantidade(t.qtd)!), fornecedor: t.fornecedor.trim(), previsao: t.previsao ?? '' };
      }),
      origem: form.origem, quem: form.quem.trim(), local: form.local, previsao: form.previsao, responsavel: form.responsavel
    };
    // Fecha na hora: o pedido entra no quadro como "salvando…" e os itens saem das faltas.
    // A marcação só sai quando o servidor confirma; se ele recusar, os itens voltam marcados.
    const chaves = itens.map(chaveDe);
    void executar(acao, (r) => mensagemSucesso(acao, undefined, { pedidoId: r.pedidoId })).then((ok) => { if (ok) onGerado(chaves); });
    gerado.current = true; // o botão Gerar pedido fica desabilitado; o foco vai para Faltas sem pedido
    onFechar();
  }

  const nOs = new Set(itens.map((i) => i.caixa.dealId)).size;
  return (
    <Janela titulo="Gerar pedido" sobretitulo="Novo pedido" larga onFechar={onFechar}
      voltarFoco={() => (gerado.current ? focoDepoisDeGerar() : null)}
      rodape={<>
        <span className="janela__nota">
          {itens.length} {itens.length === 1 ? 'item' : 'itens'} de {nOs} OS · cada OS recebe um registro no Ploomes.
        </span>
        <button type="button" className="botao botao--leve" onClick={onFechar}>Cancelar</button>
        <button type="button" className="botao botao--signal" disabled={itens.length === 0} onClick={gerar}>Confirmar e gerar</button>
      </>}>
      {sairam && <p className="janela__aviso" role="status">{sairam}</p>}
      {itens.length === 0 ? <p className="vazio">Nenhum item selecionado. Marque itens em Faltas sem pedido.</p> : (
        <ul ref={lista} className="linhas-itens">
          {itens.map((x, indice) => {
            const k = chaveDe(x);
            const { caixa, item } = x;
            return (
              <LinhaItemPedido key={k} os={caixa.os} nome={item.nome} cor={item.cor} un={item.un}
                detalhe={`falta ${formatarQtd(item.resta, item.un, item.restaG)}`}
                valor={textoDe(x)} erro={tentou ? erros[k] : undefined}
                onMudar={(v) => setTextos((t) => ({ ...t, [k]: v }))}
                onRemover={() => remover(k, indice)} />
            );
          })}
        </ul>
      )}
      <CamposPedido valor={form} onMudar={setForm} usuarios={usuarios} />
    </Janela>
  );
}
