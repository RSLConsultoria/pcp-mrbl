import { useState, type ReactNode } from 'react';
import type { Board } from '../api/tipos';
import { ddmm, diaIso } from '../regras/datas';
import { insightsDoDia, lerInsightsAbertos, resumoInsights, salvarInsightsAbertos } from '../regras/insights';
import { hashDaPeca } from '../regras/telas';

const LINHAS_VISIVEIS = 5;

function Cartao<T>({ titulo, itens, vazio, linha, chave, alerta }: {
  titulo: string;
  itens: T[];
  vazio: string;
  linha: (item: T) => ReactNode;
  chave: (item: T) => string;
  alerta?: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? itens : itens.slice(0, LINHAS_VISIVEIS);
  return (
    <section className="insights__cartao" role="group" aria-label={titulo}>
      <header className="insights__topo">
        <h3>{titulo}</h3>
        <strong className={`insights__n ${itens.length && alerta ? 'insights__n--alerta' : ''}`}>{itens.length}</strong>
      </header>
      {itens.length === 0 ? <p className="insights__vazio">{vazio}</p>
        : <ul className="insights__linhas">{visiveis.map((i) => <li key={chave(i)}>{linha(i)}</li>)}</ul>}
      {itens.length > LINHAS_VISIVEIS && <button type="button" className="insights__todas" onClick={() => setTodas((t) => !t)}>
        {todas ? 'ver menos' : `ver todas (${itens.length})`}
      </button>}
    </section>
  );
}

function LinhaOs({ os, children }: { os: string; children: ReactNode }) {
  return <a className="insights__linha" href={hashDaPeca(os)}><strong>{os}</strong><span>{children}</span></a>;
}

// Faixa "Insights do dia" (F5b): logo abaixo da navbar, em todas as telas. Recolhida por padrão.
export function FaixaInsights({ board, agora, onOficina }: { board: Board; agora: Date; onOficina: (oficinaId: string) => void }) {
  const [aberta, setAberta] = useState(lerInsightsAbertos);
  const ins = insightsDoDia(board, agora);
  const alternar = () => { setAberta(!aberta); salvarInsightsAbertos(!aberta); };
  const juntar = (...partes: string[]) => partes.filter(Boolean).join(' · ');
  return (
    <section className={`insights ${aberta ? 'insights--aberta' : ''}`} aria-label="Insights do dia">
      <button type="button" className="insights__alternar" aria-expanded={aberta}
        aria-label={aberta ? 'Recolher insights do dia' : 'Ver insights do dia'} onClick={alternar}>
        <span className="insights__rotulo">Insights do dia · {ddmm(diaIso(agora))}</span>
        <span className="insights__resumo">{resumoInsights(ins)}</span>
        <span className="insights__acao" aria-hidden="true">{aberta ? 'Recolher' : 'Ver insights'}</span>
      </button>
      {aberta && <div className="insights__cartoes">
        <Cartao titulo="Prazo estourando" itens={ins.prazos} alerta chave={(l) => l.dealId}
          vazio="Nenhuma OS vence nos próximos 3 dias."
          linha={(l) => <LinhaOs os={l.os}>{juntar(l.peca, l.oficina, l.texto)}</LinhaOs>} />
        <Cartao titulo="Caixas paradas" itens={ins.caixas} chave={(l) => l.id}
          vazio="Nenhuma caixa com falta parada há 7 dias ou mais."
          linha={(l) => <LinhaOs os={l.os}>{juntar(l.tipo, l.texto, l.itens)}</LinhaOs>} />
        <Cartao titulo="Oficinas com mais atraso" itens={ins.oficinas} alerta chave={(l) => l.oficinaId}
          vazio="Nenhuma oficina com prazo vencido."
          linha={(l) => <button type="button" className="insights__linha insights__linha--oficina" onClick={() => onOficina(l.oficinaId)}>
            <strong>{l.oficina}</strong><span>{l.texto}</span></button>} />
        <Cartao titulo="Cobrança sem resposta" itens={ins.cobrancas} chave={(l) => l.dealId}
          vazio="Nenhuma cobrança esperando resposta."
          linha={(l) => <LinhaOs os={l.os}>{juntar(l.peca, l.oficina, l.texto)}</LinhaOs>} />
      </div>}
    </section>
  );
}
