import type { Acao, Board, RespostaAcao, Sessao } from './tipos';

export class ApiError extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Sem resposta em 20 s, o pedido é cancelado e conta como falta de conexão.
export const TEMPO_LIMITE_MS = 20_000;

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  const corpo = (await r.json().catch(() => undefined)) as { erro?: string } | null | undefined;
  if (!r.ok) throw new ApiError(r.status, corpo?.erro || `Erro ${r.status}`);
  if (corpo === null || corpo === undefined || typeof corpo !== 'object') {
    throw new ApiError(r.status, 'Resposta inválida do servidor.');
  }
  return corpo as T;
}

export function entrar(email: string, senha: string): Promise<Sessao> {
  return pedir<Sessao>(import.meta.env.VITE_API_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
}

export async function buscarBoard(token: string): Promise<Board> {
  const b = await pedir<Board>(import.meta.env.VITE_API_BOARD, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!Array.isArray(b.caixas)) throw new ApiError(200, 'Resposta inválida do servidor.');
  return b;
}

export async function enviarAcao(token: string, acao: Acao): Promise<RespostaAcao> {
  const r = await pedir<Partial<RespostaAcao>>(import.meta.env.VITE_API_ACAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(acao)
  });
  if (typeof r.versao !== 'string' || !r.historico) throw new ApiError(200, 'Resposta inválida do servidor.');
  return { versao: r.versao, historico: r.historico };
}
