import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { horaMinuto } from '../regras/datas';
import type { Tela } from '../regras/telas';
import { iniciais } from '../regras/texto';
import { Icone, type NomeIcone } from './Icone';

// tela ausente = guia ainda desabilitada.
const GUIAS: { nome: string; icone: NomeIcone; tela?: Tela }[] = [
  { nome: 'No Ploomes', icone: 'produtos', tela: 'ploomes' },
  { nome: 'Saídas com falta', icone: 'bell', tela: 'saidas' },
  { nome: 'Solicitações de faltas', icone: 'propostas', tela: 'pedidos' },
  { nome: 'Controle de produção', icone: 'funil' },
  { nome: 'Visão das peças', icone: 'doc' }
];

interface Props { nome: string; geradoEm?: string; tela: Tela; onTela: (t: Tela) => void; onSair: () => void }

export function Navbar({ nome, geradoEm, tela, onTela, onSair }: Props) {
  const [menu, setMenu] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    const aoClicar = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('keydown', aoTecla);
    document.addEventListener('mousedown', aoClicar);
    return () => {
      document.removeEventListener('keydown', aoTecla);
      document.removeEventListener('mousedown', aoClicar);
    };
  }, [menu]);
  return (
    <header className="soc-navbar navbar">
      <div className="marca">
        <span className="marca__mrbl">MRBL</span>
        <span className="marca__divisor" />
        <span className="marca__texto">
          <span className="marca__pcp">PCP</span>
          <span className="marca__local">Confecção · Bragança</span>
        </span>
      </div>
      <nav className="soc-modnav" aria-label="Módulos" style={{ '--mc': 'var(--signal)' } as CSSProperties}>
        {GUIAS.map((g) => (
          <button key={g.nome} type="button" className="soc-modnav__item" disabled={!g.tela}
            aria-current={g.tela === tela ? 'page' : undefined} title={g.tela ? undefined : 'Em breve'}
            onClick={() => g.tela && onTela(g.tela)}>
            <Icone nome={g.icone} />
            <span>{g.nome}</span>
          </button>
        ))}
      </nav>
      <div className="navbar__direita">
        <span className="sync" title="Leitura da planilha de faltas">
          <span className="sync__ponto" />
          Ploomes · sincronizado {geradoEm ? horaMinuto(geradoEm) : '--:--'}
        </span>
        <div className="avatar" ref={avatarRef}>
          <button type="button" className="avatar__botao" title={nome} aria-label={`Conta de ${nome}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {iniciais(nome)}
          </button>
          {menu && (
            <div className="avatar__menu" role="menu">
              <span className="avatar__nome">{nome}</span>
              <button type="button" role="menuitem" onClick={onSair}>Sair</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
