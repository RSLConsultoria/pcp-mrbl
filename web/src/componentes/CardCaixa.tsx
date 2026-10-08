import type { CSSProperties } from 'react';
import type { Caixa } from '../api/tipos';
import { itensAbertos } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { formatarQtd } from '../regras/quantidade';
import { corDoTipo, iniciais, nomeDoTipo } from '../regras/texto';

// Itens visíveis na frente do card; o resto fica no painel.
const ITENS_NO_CARD = 3;

interface Props { caixa: Caixa; hoje: Date; selecionada: boolean; onAbrir: () => void }

export function CardCaixa({ caixa, hoje, selecionada, onAbrir }: Props) {
  const abertos = itensAbertos(caixa);
  const resolvidos = caixa.itens.filter((i) => i.status === 'RESOLVIDO').length;
  const dias = diasEntre(caixa.registradoEm, hoje);
  const visiveis = abertos.slice(0, ITENS_NO_CARD);
  const ocultos = abertos.length - visiveis.length;
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${caixa.os}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      style={{ '--cor-tipo': corDoTipo(caixa.tipo) } as CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <div className="card__cabeca">
        <span className="card__os">{caixa.os}</span>
        {caixa.responsavel && <span className="card__resp" title={caixa.responsavel}>{iniciais(caixa.responsavel)}</span>}
      </div>
      <div className="card__peca">{caixa.peca}</div>
      <div className="card__meta">{[caixa.cliente, nomeDoTipo(caixa.tipo)].filter(Boolean).join(' · ')}</div>

      {visiveis.length > 0 && (
        <ul className="card__itens">
          {visiveis.map((i) => (
            <li key={i.id} className="card__item">
              <span className="card__item-nome">
                {i.nome}{i.cor && <span className="card__item-cor"> {i.cor}</span>}
                {i.previsao && <span className="card__item-prev"> · previsão {ddmm(i.previsao)}</span>}
              </span>
              <span className="card__item-qtd">{formatarQtd(i.falta, i.un, i.faltaG)}</span>
            </li>
          ))}
          {ocultos > 0 && <li className="card__mais">+ {ocultos} {ocultos > 1 ? 'itens' : 'item'}</li>}
        </ul>
      )}

      <div className="card__rodape">
        <span className={abertos.length ? 'card__estado card__estado--falta' : 'card__estado card__estado--ok'}>
          {abertos.length ? `${abertos.length} ${abertos.length > 1 ? 'itens faltando' : 'item faltando'}` : 'nada faltando'}
        </span>
        {dias !== null && <span>{textoDias(dias)}</span>}
        {caixa.previsao && <span className="card__prev">previsão {ddmm(caixa.previsao)}</span>}
        {resolvidos > 0 && <span className="card__resolvidos">+ {resolvidos} {resolvidos > 1 ? 'itens já resolvidos' : 'item já resolvido'}</span>}
      </div>
    </div>
  );
}
