import type { Caixa } from '../api/tipos';
import { itensAbertos } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { formatarQtd } from '../regras/quantidade';
import { corDoTipo, iniciais, nomeDoTipo } from '../regras/texto';

interface Props { caixa: Caixa; hoje: Date; selecionada: boolean; onAbrir: () => void }

export function CardCaixa({ caixa, hoje, selecionada, onAbrir }: Props) {
  const abertos = itensAbertos(caixa);
  const resolvidos = caixa.itens.filter((i) => i.status === 'RESOLVIDO').length;
  const dias = diasEntre(caixa.registradoEm, hoje);
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${caixa.os}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <div className="card__topo">
        <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)}</span>
        <span className="card__cliente">{caixa.cliente}</span>
      </div>
      <div>
        <div className="card__os">{caixa.os}</div>
        <div className="card__peca">{caixa.peca}</div>
      </div>
      <div className="selos">
        <span className={abertos.length ? 'selo selo--falta' : 'selo selo--ok'}>
          {abertos.length ? `${abertos.length} ${abertos.length > 1 ? 'itens faltando' : 'item faltando'}` : 'nada faltando'}
        </span>
        {dias !== null && <span className="selo">{textoDias(dias)}</span>}
      </div>
      {abertos.length > 0 && (
        <div className="card__itens">
          {abertos.map((i) => (
            <div key={i.id} className="card__item">
              <div className="card__item-linha">
                <span className="card__item-nome">{i.nome} <span className="card__item-cor">{i.cor}</span></span>
                <span className="card__item-qtd">{formatarQtd(i.falta, i.un, i.faltaG)}</span>
              </div>
              {i.previsao && <span className="card__item-prev">previsão {ddmm(i.previsao)}</span>}
              {i.obs && <span className="card__item-obs">{i.obs}</span>}
            </div>
          ))}
        </div>
      )}
      {resolvidos > 0 && (
        <span className="card__resolvidos">+ {resolvidos} {resolvidos > 1 ? 'itens já resolvidos' : 'item já resolvido'}</span>
      )}
      {caixa.responsavel && (
        <div className="card__rodape">
          <span className="resp"><span className="resp__ini">{iniciais(caixa.responsavel)}</span>{caixa.responsavel}</span>
        </div>
      )}
    </div>
  );
}
