import type { Sessao } from '../api/tipos';

// O site de QA (/pcp-mrbl/qa/) fica na mesma origem da produção: chave própria para
// um login não derrubar o outro.
export function chaveSessao(base: string): string {
  return base.endsWith('/qa/') ? 'pcp-mrbl.qa.sessao' : 'pcp-mrbl.sessao';
}

const CHAVE = chaveSessao(import.meta.env.BASE_URL);

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
