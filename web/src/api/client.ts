import type { Acao, Board, RespostaAcao, RespostaPeca, Sessao } from './tipos';

export class ApiError extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Build sem o endereço esperado: a tela mostra a mensagem em vez de "Ploomes fora".
export class ErroConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
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
  if (typeof r.versao !== 'string' || r.historico === undefined) throw new ApiError(200, 'Resposta inválida do servidor.');
  const resp: RespostaAcao = { versao: r.versao, historico: r.historico };
  if (typeof r.pedidoId === 'string') resp.pedidoId = r.pedidoId;
  if (Array.isArray(r.partes) && r.partes.every((x) => typeof x === 'string')) resp.partes = r.partes;
  if (Array.isArray(r.itemIds) && r.itemIds.every((x) => typeof x === 'string')) resp.itemIds = r.itemIds;
  // Sem o mensagemId a fila não reconhece a mensagem enfileirada no board e ela aparece em dobro.
  if (typeof r.mensagemId === 'string') resp.mensagemId = r.mensagemId;
  // Sem o anotacaoId a fila não reconhece a anotação gravada no board.
  if (typeof r.anotacaoId === 'string') resp.anotacaoId = r.anotacaoId;
  if (typeof r.emailId === 'string') resp.emailId = r.emailId;
  return resp;
}

// O pcp-peca mora ao lado do pcp-board (o homolog termina em -h): a URL sai da do board,
// sem variável nova no build.
// Sem o pcp-board no fim, a troca não aconteceria e a busca iria ao board: erro claro.
export function urlPeca(): string {
  const board = import.meta.env.VITE_API_BOARD ?? '';
  if (!/pcp-board(-h)?$/.test(board)) throw new ErroConfiguracao('Endereço da Visão da peça não configurado (VITE_API_BOARD deve terminar em pcp-board).');
  return board.replace(/pcp-board(-h)?$/, 'pcp-peca$1');
}

export async function buscarPeca(token: string, q: string): Promise<RespostaPeca> {
  const r = await pedir<RespostaPeca>(`${urlPeca()}?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!Array.isArray(r.cards) || !Array.isArray(r.eventos)) throw new ApiError(200, 'Resposta inválida do servidor.');
  return r;
}
