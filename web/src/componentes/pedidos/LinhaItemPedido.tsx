import { useId } from 'react';
import { Icone } from '../Icone';

export interface TextoItem { qtd: string; fornecedor: string }

interface Props {
  os: string;
  nome: string;
  cor?: string;
  un: string;
  detalhe: string; // ex.: "resta 26 UN"
  valor: TextoItem;
  erro?: string;
  onMudar: (v: TextoItem) => void;
  onRemover?: () => void; // só na janela Gerar pedido
}

// Uma linha de item com a quantidade e o fornecedor editáveis (janela Gerar pedido e painel do pedido).
export function LinhaItemPedido({ os, nome, cor, un, detalhe, valor, erro, onMudar, onRemover }: Props) {
  const id = useId();
  return (
    <li className={onRemover ? 'linha-item linha-item--removivel' : 'linha-item'}>
      <div className="linha-item__texto">
        <span className="linha-item__nome"><span className="linha-item__os">OS {os}</span> · {nome}{cor && <span className="card__item-cor"> {cor}</span>}</span>
        <span className="linha-item__detalhe">{detalhe}</span>
      </div>
      <div className="linha-item__campos">
        <div className="campo">
          <label htmlFor={`${id}-qtd`}>Quantidade{un ? ` (${un})` : ''}</label>
          <input id={`${id}-qtd`} type="text" inputMode="decimal" autoComplete="off" value={valor.qtd}
            aria-label={`Quantidade${un ? ` (${un})` : ''} de ${nome}`} aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(e) => onMudar({ ...valor, qtd: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-forn`}>Fornecedor do item</label>
          <input id={`${id}-forn`} type="text" maxLength={100} value={valor.fornecedor} placeholder="Igual ao do pedido"
            aria-label={`Fornecedor do item ${nome}`} onChange={(e) => onMudar({ ...valor, fornecedor: e.target.value })} />
        </div>
      </div>
      {onRemover && (
        <button type="button" className="linha-item__remover" aria-label={`Remover ${nome} da lista`} title="Remover da lista" onClick={onRemover}>
          <Icone nome="remover" tamanho={16} />
        </button>
      )}
      {erro && <p id={`${id}-erro`} className="campo__erro">{erro}</p>}
    </li>
  );
}
