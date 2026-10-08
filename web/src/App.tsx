import { useCallback, useEffect, useState } from 'react';
import type { Caixa, Sessao } from './api/tipos';
import { lerSessao, limparSessao, salvarSessao } from './auth/sessao';
import { AvisoProvider, useAviso } from './componentes/Aviso';
import { FaixaOffline } from './componentes/FaixaOffline';
import { Legenda } from './componentes/Legenda';
import { Navbar } from './componentes/Navbar';
import { AcoesPedidos } from './componentes/pedidos/AcoesPedidos';
import { Subnav } from './componentes/Subnav';
import { useAcao } from './hooks/useAcao';
import { useBoard } from './hooks/useBoard';
import type { FiltroPedidos } from './regras/pedidos';
import { chaveItem, itensSelecionados } from './regras/pedidosQuadro';
import { itensParaPedido } from './regras/saidas';
import { BUSCA_DA_TELA, hashDaTela, telaDoHash, type Tela } from './regras/telas';
import { Login } from './telas/Login';
import { NoPloomes } from './telas/NoPloomes';
import { Pedidos, type JanelaPedidos } from './telas/Pedidos';
import { Saidas } from './telas/Saidas';

// Guia atual guardada no hash (#saidas, #pedidos) para o recarregar voltar nela.
function useTela(): [Tela, (t: Tela) => void] {
  const [tela, setTela] = useState<Tela>(() => telaDoHash(window.location.hash));
  useEffect(() => {
    const aoMudar = () => setTela(telaDoHash(window.location.hash));
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  const irPara = useCallback((t: Tela) => {
    setTela(t);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + search + hashDaTela(t));
  }, []);
  return [tela, irPara];
}

function Quadro({ sessao, aoExpirar, onSair }: { sessao: Sessao; aoExpirar: () => void; onSair: () => void }) {
  const { board, erroDesde, carregando, recarregar } = useBoard(sessao.token, aoExpirar);
  const avisar = useAviso();
  const executar = useAcao({ token: sessao.token, recarregar, aoExpirar, avisar });
  const [tela, irPara] = useTela();
  const [buscas, setBuscas] = useState<Record<Tela, string>>({ ploomes: '', saidas: '', pedidos: '' });
  const [filtro, setFiltro] = useState<FiltroPedidos>('aberto');
  const [janela, setJanela] = useState<JanelaPedidos>(null);
  const [selecao, setSelecao] = useState<Set<string>>(() => new Set());
  const hoje = new Date();
  const q = buscas[tela];
  const selecionados = board ? itensSelecionados(board, selecao).length : 0;

  const selecionarParaPedido = useCallback((c: Caixa) => {
    const itens = itensParaPedido(c);
    setSelecao((s) => new Set([...s, ...itens.map((i) => chaveItem(c.dealId, i.id))]));
    irPara('pedidos');
    avisar(`${itens.length} ${itens.length > 1 ? 'itens selecionados' : 'item selecionado'} em Solicitações de faltas`);
  }, [irPara, avisar]);

  return (
    <div className="app">
      <Navbar nome={sessao.nome} geradoEm={board?.geradoEm} tela={tela} onTela={irPara} onSair={onSair} />
      <Subnav q={q} onQ={(v) => setBuscas((b) => ({ ...b, [tela]: v }))} placeholder={BUSCA_DA_TELA[tela]}>
        {tela === 'pedidos'
          ? <AcoesPedidos filtro={filtro} onFiltro={setFiltro} selecionados={selecionados}
              onEtapas={() => setJanela('etapas')} onGerar={() => setJanela('gerar')} />
          : <Legenda />}
      </Subnav>
      {erroDesde && <FaixaOffline desde={erroDesde} temDados={board !== null} />}
      <main className="app__principal">
        {!board ? <div className="carregando">{carregando ? 'Carregando o quadro…' : 'Não foi possível carregar o quadro.'}</div>
          : tela === 'saidas' ? <Saidas board={board} q={q} hoje={hoje} executar={executar} onSelecionarParaPedido={selecionarParaPedido} />
          : tela === 'pedidos' ? <Pedidos board={board} q={q} filtro={filtro} janela={janela} selecao={selecao} executar={executar}
              onJanela={setJanela} onSelecao={setSelecao} />
          : <NoPloomes board={board} q={q} hoje={hoje} executar={executar} />}
      </main>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao());
  const [aviso, setAviso] = useState('');

  const sair = useCallback((msg: string) => {
    limparSessao();
    setAviso(msg);
    setSessao(null);
  }, []);

  return (
    <AvisoProvider>
      {sessao
        ? <Quadro sessao={sessao} aoExpirar={() => sair('Sua sessão expirou. Entre de novo.')} onSair={() => sair('')} />
        : <Login aviso={aviso} onEntrar={(s) => { salvarSessao(s); setAviso(''); setSessao(s); }} />}
    </AvisoProvider>
  );
}
