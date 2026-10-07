import type { Sessao } from '../api/tipos';

const CHAVE = 'pcp-mrbl.sessao';

// localStorage pode lançar exceção (aba privada, bloqueio de dados do site).
// Nesse caso a sessão vale só enquanto a aba estiver aberta.
export function lerSessao(agora: number = Date.now()): Sessao | null {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Sessao;
    if (!s.token || !(Date.parse(s.expiraEm) > agora)) {
      localStorage.removeItem(CHAVE);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function salvarSessao(s: Sessao): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* sessão fica só em memória */
  }
}

export function limparSessao(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a limpar */
  }
}
