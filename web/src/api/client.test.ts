import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buscarBoard, enviarAcao, entrar } from './client';

function resposta(status: number, corpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_LOGIN', 'http://api.test/pcp-login');
    vi.stubEnv('VITE_API_BOARD', 'http://api.test/pcp-board');
    vi.stubEnv('VITE_API_ACAO', 'http://api.test/pcp-acao');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pedido sem resposta é cancelado em 20 s e vira ApiError status 0', async () => {
    const ctrl = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctrl.signal);
    // fetch que nunca responde; só termina quando o sinal cancela.
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_ok, falha) => {
      init.signal?.addEventListener('abort', () => falha(init.signal?.reason));
    })));
    const p = buscarBoard('t').catch((x) => x);
    expect(timeout).toHaveBeenCalledWith(20_000);
    ctrl.abort(new DOMException('signal timed out', 'TimeoutError'));
    const e = await p;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, message: 'Sem conexão com o servidor.' });
  });

  it('entrar faz POST com JSON e devolve a sessão', async () => {
    const f = vi.fn(() => resposta(200, { token: 't', nome: 'Lucca', perfil: 'ADM', expiraEm: '2026-10-08T00:00:00.000Z' }));
    vi.stubGlobal('fetch', f);
    const s = await entrar('lucca@rslconsultoria.com', 'x');
    expect(s.nome).toBe('Lucca');
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-login', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'lucca@rslconsultoria.com', senha: 'x' })
    }));
  });

  it('erro HTTP vira ApiError com status e mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(401, { erro: 'E-mail ou senha incorretos.' })));
    await expect(entrar('a', 'b')).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha incorretos.' });
  });

  it('falha de rede vira ApiError status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const e = await buscarBoard('t').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
  });

  it('buscarBoard manda o token no Authorization', async () => {
    const f = vi.fn(() => resposta(200, { geradoEm: 'x', caixas: [], avisos: [] }));
    vi.stubGlobal('fetch', f);
    await buscarBoard('abc');
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-board', expect.objectContaining({
      headers: { Authorization: 'Bearer abc' }
    }));
  });

  it('200 com corpo HTML vira ApiError com mensagem de resposta inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 }))));
    await expect(buscarBoard('t')).rejects.toMatchObject({
      status: 200,
      message: 'Resposta inválida do servidor.'
    });
  });

  it('board sem lista de caixas vira erro', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(200, {})));
    await expect(buscarBoard('t')).rejects.toMatchObject({
      status: 200,
      message: 'Resposta inválida do servidor.'
    });
  });

  it('500 com corpo não-JSON vira ApiError status 500 e mensagem genérica', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('erro', { status: 500 }))));
    await expect(entrar('a', 'b')).rejects.toMatchObject({
      status: 500,
      message: 'Erro 500'
    });
  });

  it('enviarAcao faz POST com token e corpo, e devolve versao e historico', async () => {
    const h = { quando: '2026-10-07T12:00:00.000Z', usuario: 'Maria', texto: 'Baixa de 3 UN', ploomes: 'PENDENTE' };
    const f = vi.fn(() => resposta(200, { ok: true, versao: 'v2', historico: h }));
    vi.stubGlobal('fetch', f);
    const acao = { tipo: 'baixa', dealId: '700001', itemId: 'a1', valor: 3, versao: 'v1' } as const;
    const r = await enviarAcao('abc', acao);
    expect(r).toEqual({ versao: 'v2', historico: h });
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-acao', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc' },
      body: JSON.stringify(acao)
    }));
  });

  it('enviarAcao repassa pedidoId e partes (dividir por previsão)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(200, { ok: true, versao: 'v2', historico: null, pedidoId: 'PED-0001.1', partes: ['PED-0001.1', 'PED-0001.2'] })));
    const r = await enviarAcao('t', { tipo: 'dividir_por_previsao', pedidoId: 'PED-0001', versao: 'v1' });
    expect(r).toEqual({ versao: 'v2', historico: null, pedidoId: 'PED-0001.1', partes: ['PED-0001.1', 'PED-0001.2'] });
  });

  it('enviarAcao: 409 vira ApiError(409) com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(409, { erro: 'Alguém alterou esta caixa agora há pouco.' })));
    const e = await enviarAcao('t', { tipo: 'obs_caixa', dealId: '1', valor: 'x', versao: '' }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, message: 'Alguém alterou esta caixa agora há pouco.' });
  });

  it('enviarAcao: 200 sem versao/historico vira resposta inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(200, { ok: true })));
    await expect(enviarAcao('t', { tipo: 'responsavel', dealId: '1', valor: 'Maria', versao: '' }))
      .rejects.toMatchObject({ message: 'Resposta inválida do servidor.' });
  });
});
