import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buscarBoard, entrar } from './client';

function resposta(status: number, corpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_LOGIN', 'http://api.test/pcp-login');
    vi.stubEnv('VITE_API_BOARD', 'http://api.test/pcp-board');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
});
