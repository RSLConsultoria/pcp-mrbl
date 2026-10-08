import { useRef, useState } from 'react';
import type { Acao } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { arredondar3, lerQuantidade, mensagemSucesso } from '../../regras/acoes';
import { validarGerarPedido } from '../../regras/pedidos';
import { chaveItem, type ItemSelecionado } from '../../regras/pedidosQuadro';
import { formatarQtd, quantidadeParaCampo } from '../../regras/quantidade';
import { Janela } from '../Janela';
import { CamposPedido, type FormPedido } from './CamposPedido';
import { LinhaItemPedido, type TextoItem } from './LinhaItemPedido';

interface Props {
  itens: ItemSelecionado[];
  usuarios: string[];
  executar: Executar;
  onGerado: () => void;
  onFechar: () => void;
}

export function JanelaGerarPedido({ itens: itensAoAbrir, usuarios, executar, onGerado, onFechar }: Props) {
  // A lista fica fixa enquanto a janela está aberta; o servidor recusa item que já entrou em outro pedido.
  const [itens] = useState(itensAoAbrir);
  const lista = useRef<HTMLUListElement>(null);
  const [form, setForm] = useState<FormPedido>({ origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '' });
  const [textos, setTextos] = useState<Record<string, TextoItem>>(() =>
    Object.fromEntries(itens.map(({ caixa, item }) => [chaveItem(caixa.dealId, item.id), { qtd: quantidadeParaCampo(item.resta), fornecedor: '' }])));
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const selecao = itens.map(({ caixa, item }) => ({ itemId: chaveItem(caixa.dealId, item.id), un: item.un, resta: item.resta }));
  const erros = validarGerarPedido(selecao, Object.fromEntries(Object.entries(textos).map(([k, v]) => [k, v.qtd])));
  const temErro = Object.keys(erros).length > 0;

  async function gerar() {
    setTentou(true);
    if (temErro) {
      lista.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
      return;
    }
    const acao: Acao = {
      tipo: 'gerar_pedido',
      itens: itens.map(({ caixa, item }) => {
        const t = textos[chaveItem(caixa.dealId, item.id)];
        return { itemId: item.id, dealId: caixa.dealId, qtd: arredondar3(lerQuantidade(t.qtd)!), fornecedor: t.fornecedor.trim() };
      }),
      origem: form.origem, quem: form.quem.trim(), local: form.local, previsao: form.previsao, responsavel: form.responsavel
    };
    setEnviando(true);
    const ok = await executar(acao, (r) => mensagemSucesso(acao, undefined, { pedidoId: r.pedidoId }));
    setEnviando(false);
    if (ok) {
      onGerado();
      onFechar();
    }
  }

  const nOs = new Set(itens.map((i) => i.caixa.dealId)).size;
  return (
    <Janela titulo="Gerar pedido" sobretitulo="Novo pedido" larga onFechar={onFechar}
      rodape={<>
        <span className="janela__nota">
          {itens.length} {itens.length === 1 ? 'item' : 'itens'} de {nOs} OS · cada OS recebe um registro no Ploomes.
        </span>
        <button type="button" className="botao botao--leve" onClick={onFechar}>Cancelar</button>
        <button type="button" className="botao botao--signal" disabled={enviando || itens.length === 0} onClick={gerar}>Confirmar e gerar</button>
      </>}>
      {itens.length === 0 ? <p className="vazio">Nenhum item selecionado. Marque itens em Faltas sem pedido.</p> : (
        <ul ref={lista} className="linhas-itens">
          {itens.map(({ caixa, item }) => {
            const k = chaveItem(caixa.dealId, item.id);
            return (
              <LinhaItemPedido key={k} os={caixa.os} nome={item.nome} cor={item.cor} un={item.un}
                detalhe={`falta ${formatarQtd(item.resta, item.un, item.restaG)}`}
                valor={textos[k]} erro={tentou ? erros[k] : undefined}
                onMudar={(v) => setTextos((t) => ({ ...t, [k]: v }))} />
            );
          })}
        </ul>
      )}
      <CamposPedido valor={form} onMudar={setForm} usuarios={usuarios} />
    </Janela>
  );
}
