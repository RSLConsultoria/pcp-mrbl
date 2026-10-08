import { useEffect } from 'react';
import type { Caixa } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { colunaDaCaixa, COLUNAS, itemAberto } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { MSG_SOMENTE_LEITURA } from '../regras/edicao';
import { corDoTipo, nomeDoTipo } from '../regras/texto';
import { CamposCaixa } from './painel/CamposCaixa';
import { Historico } from './painel/Historico';
import { ItemEditavel } from './painel/ItemEditavel';

const URL_PLOOMES = 'https://app10.ploomes.com/deal/';

interface Props {
  caixa: Caixa;
  hoje: Date;
  usuarios: string[];
  editavel: boolean;
  executar: Executar;
  onFechar: () => void;
}

export function PainelCaixa({ caixa, hoje, usuarios, editavel, executar, onFechar }: Props) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoTecla);
    return () => document.removeEventListener('keydown', aoTecla);
  }, [onFechar]);
  const coluna = COLUNAS.find((c) => c.id === colunaDaCaixa(caixa))!;
  const dias = diasEntre(caixa.registradoEm, hoje);
  // Abertos primeiro; o sort é estável, então a ordem do board se mantém dentro de cada grupo.
  const itens = [...caixa.itens].sort((a, b) => Number(itemAberto(b)) - Number(itemAberto(a)));
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)}</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <div className="painel__os">{caixa.os}</div>
        <div className="painel__peca">{caixa.peca}</div>
        <div className="painel__meta">{[caixa.cliente, caixa.referencia].filter(Boolean).join(' · ')}</div>
        <a className="painel__link" href={URL_PLOOMES + caixa.dealId} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
      </div>
      <div className="painel__corpo">
        {!editavel && <p className="item__nota" role="note">{MSG_SOMENTE_LEITURA}</p>}
        <dl className="leitura">
          <div><dt>Etapa</dt><dd>{coluna.nome}</dd></div>
          <div><dt>Registro</dt><dd>{caixa.registradoEm ? `${ddmm(caixa.registradoEm)} · ${textoDias(dias)}` : '—'}</dd></div>
          {caixa.saiu && <div><dt>Saiu do almoxarifado</dt><dd>{caixa.saiuEm ? ddmm(caixa.saiuEm) : 'sim'}</dd></div>}
        </dl>
        <CamposCaixa caixa={caixa} usuarios={usuarios} executar={executar} somenteLeitura={!editavel} />
        <section className="secao">
          <h3 className="secao__titulo">Itens <span>{itens.length}</span></h3>
          <ul className="itens">
            {itens.map((i) => <ItemEditavel key={i.id} item={i} dealId={caixa.dealId} executar={executar} somenteLeitura={!editavel} />)}
          </ul>
          {itens.length === 0 && <p className="vazio">Nenhum item registrado nesta caixa.</p>}
        </section>
        <Historico entradas={caixa.historico ?? []} />
      </div>
    </aside>
  );
}
