import { useEffect } from 'react';
import type { Caixa, Item } from '../api/tipos';
import { colunaDaCaixa, COLUNAS, itemAberto } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { contaDoItem } from '../regras/quantidade';
import { corDoTipo, nomeDoTipo } from '../regras/texto';

const URL_PLOOMES = 'https://app10.ploomes.com/deal/';

function ItemDoPainel({ item }: { item: Item }) {
  const aberto = itemAberto(item);
  return (
    <div className="item">
      <div className="item__topo">
        <div className="item__nomes">
          <span className="item__nome">{item.nome}</span>
          <span className="item__cor">{[item.cor, item.un].filter(Boolean).join(' · ')}</span>
        </div>
        <span className={aberto ? 'tag tag--falta' : 'tag tag--ok'}>{aberto ? item.status.toLowerCase() : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {item.previsao && <span className="item__prev">previsão {ddmm(item.previsao)}</span>}
      {item.obs && <span className="item__obs">{item.obs}</span>}
      {item.resolvidoEm && <span className="item__resolvido">resolvido em {ddmm(item.resolvidoEm)}</span>}
    </div>
  );
}

export function PainelCaixa({ caixa, hoje, onFechar }: { caixa: Caixa; hoje: Date; onFechar: () => void }) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoTecla);
    return () => document.removeEventListener('keydown', aoTecla);
  }, [onFechar]);
  const coluna = COLUNAS.find((c) => c.id === colunaDaCaixa(caixa))!;
  const dias = diasEntre(caixa.registradoEm, hoje);
  const itens = [...caixa.itens].sort((a, b) => Number(itemAberto(b)) - Number(itemAberto(a)));
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)} · {caixa.cliente || '—'}</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <div className="painel__os">{caixa.os}</div>
        <div className="painel__peca">{caixa.peca}</div>
        {caixa.referencia && <div className="painel__ref">{caixa.referencia}</div>}
        <a className="painel__link" href={URL_PLOOMES + caixa.dealId} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
      </div>
      <div className="painel__corpo">
        <dl className="leitura">
          <div><dt>Responsável</dt><dd>{caixa.responsavel || '—'}</dd></div>
          <div><dt>Etapa atual</dt><dd>{coluna.nome}</dd></div>
          <div><dt>Registro</dt><dd>{caixa.registradoEm ? `${ddmm(caixa.registradoEm)} · ${textoDias(dias)}` : '—'}</dd></div>
          {caixa.saiu && <div><dt>Saiu do almoxarifado</dt><dd>{caixa.saiuEm ? ddmm(caixa.saiuEm) : 'sim'}</dd></div>}
        </dl>
        <section className="secao">
          <h3 className="eyebrow">Itens</h3>
          {itens.map((i) => <ItemDoPainel key={i.id} item={i} />)}
          {itens.length === 0 && <p className="vazio">Nenhum item registrado nesta caixa.</p>}
        </section>
        <p className="painel__nota">Baixa, previsão e responsável passam a ser editáveis aqui na próxima fase.</p>
      </div>
    </aside>
  );
}
