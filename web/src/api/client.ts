import type { Board, Sessao } from './tipos';

export class ApiError extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, init);
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
