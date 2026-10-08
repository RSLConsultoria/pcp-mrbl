import { useCallback, useState } from 'react';
import type { Sessao } from './api/tipos';
import { lerSessao, limparSessao, salvarSessao } from './auth/sessao';
import { AvisoProvider, useAviso } from './componentes/Aviso';
import { FaixaOffline } from './componentes/FaixaOffline';
import { Navbar } from './componentes/Navbar';
import { Subnav } from './componentes/Subnav';
import { useAcao } from './hooks/useAcao';
import { useBoard } from './hooks/useBoard';
import { Login } from './telas/Login';
import { NoPloomes } from './telas/NoPloomes';

function Quadro({ sessao, aoExpirar, onSair }: { sessao: Sessao; aoExpirar: () => void; onSair: () => void }) {
  const { board, erroDesde, carregando, recarregar } = useBoard(sessao.token, aoExpirar);
  const avisar = useAviso();
  const executar = useAcao({ token: sessao.token, recarregar, aoExpirar, avisar });
  const [q, setQ] = useState('');
  const hoje = new Date();
  return (
    <div className="app">
      <Navbar nome={sessao.nome} geradoEm={board?.geradoEm} onSair={onSair} />
      <Subnav q={q} onQ={setQ} />
      {erroDesde && <FaixaOffline desde={erroDesde} temDados={board !== null} />}
      <main className="app__principal">
        {board ? <NoPloomes board={board} q={q} hoje={hoje} executar={executar} />
          : <div className="carregando">{carregando ? 'Carregando o quadro…' : 'Não foi possível carregar o quadro.'}</div>}
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
