import { useState, type FormEvent } from 'react';
import { ApiError, entrar } from '../api/client';
import type { Sessao } from '../api/tipos';

const MENSAGENS: Record<number, string> = {
  0: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  400: 'Informe e-mail e senha.',
  401: 'E-mail ou senha incorretos.',
  429: 'Muitas tentativas. Tente de novo em 15 minutos.'
};

export function Login({ aviso, onEntrar }: { aviso: string; onEntrar: (s: Sessao) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      onEntrar(await entrar(email.trim(), senha));
    } catch (x) {
      const status = x instanceof ApiError ? x.status : -1;
      setErro(MENSAGENS[status] ?? 'Não foi possível entrar agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__caixa" onSubmit={enviar}>
        <div className="login__marca">
          <span className="marca__mrbl">MRBL</span>
          <span className="marca__divisor" />
          <span className="marca__texto"><span className="marca__pcp">PCP</span><span className="marca__local">Confecção · Bragança</span></span>
        </div>
        <div className="login__corpo">
          {aviso && <p className="login__aviso" role="status">{aviso}</p>}
          <label className="campo"><span>E-mail</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo"><span>Senha</span>
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          {erro && <p className="login__erro" role="alert">{erro}</p>}
          <button type="submit" className="botao botao--signal" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}
