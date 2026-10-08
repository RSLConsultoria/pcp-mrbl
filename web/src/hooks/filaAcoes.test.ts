import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Acao, RespostaAcao } from '../api/tipos';
import { caixa, item } from '../regras/teste-util';
import { criarFila, type DepoisDoErro } from './filaAcoes';

interface Chamada { acao: Acao; ok: (r: RespostaAcao) => void; falha: (e: unknown) => void }

// Servidor de mentira: cada envio fica aberto até o teste responder.
function montar(aoFalhar: (e: unknown) => DepoisDoErro = () => 'seguir') {
  const chamadas: Chamada[] = [];
  const esvaziou = vi.fn();
  const falhas: unknown[] = [];
  const fila = criarFila();
  fila.configurar({
    enviar: (acao) => new Promise<RespostaAcao>((ok, falha) => chamadas.push({ acao, ok, falha })),
    aoFalhar: (e) => { falhas.push(e); return aoFalhar(e); },
    aoEsvaziar: esvaziou
  });
  return { fila, chamadas, esvaziou, falhas };
}
const resposta = (versao: string): RespostaAcao => ({ versao, historico: null });
const obs = (valor: string, versao = 'v1'): Acao => ({ tipo: 'obs_item', dealId: '600001', itemId: 'i1', valor, versao });
const tique = () => new Promise((r) => setTimeout(r, 0));

describe('criarFila', () => {
  it('envia uma por vez, na ordem, e já mostra todas como pendentes', async () => {
    const { fila, chamadas } = montar();
    const a = fila.adicionar(obs('a'));
    void fila.adicionar(obs('b'));
    expect(fila.pendentes().map((p) => [p.id, p.estado])).toEqual([[1, 'enviando'], [2, 'fila']]);
    expect(chamadas).toHaveLength(1);
    chamadas[0].ok(resposta('v2'));
    expect(await a).toEqual(resposta('v2'));
    await tique();
    expect(chamadas).toHaveLength(2);
    expect(fila.pendentes().map((p) => p.estado)).toEqual(['confirmada', 'enviando']);
  });

  it('a ação seguinte no mesmo alvo segue a versão que a anterior trocou', async () => {
    const { fila, chamadas } = montar();
    void fila.adicionar(obs('a', 'v1'));
    void fila.adicionar(obs('b', 'v1'));
    chamadas[0].ok(resposta('v2'));
    await tique();
    expect(chamadas[1].acao).toMatchObject({ versao: 'v2', valor: 'b' });
  });

  it('relê o board uma vez só, quando a fila esvazia', async () => {
    const { fila, chamadas, esvaziou } = montar();
    void fila.adicionar(obs('a'));
    void fila.adicionar(obs('b'));
    chamadas[0].ok(resposta('v2'));
    await tique();
    expect(esvaziou).not.toHaveBeenCalled();
    chamadas[1].ok(resposta('v3'));
    await tique();
    expect(esvaziou).toHaveBeenCalledTimes(1);
  });

  it('recusa: tira a ação da tela, resolve null e segue com a próxima', async () => {
    const { fila, chamadas, falhas, esvaziou } = montar();
    const a = fila.adicionar(obs('a'));
    void fila.adicionar(obs('b'));
    const erro = new ApiError(409, 'Alguém alterou esta caixa agora há pouco.');
    chamadas[0].falha(erro);
    expect(await a).toBeNull();
    expect(falhas).toEqual([erro]);
    expect(fila.pendentes().map((p) => p.id)).toEqual([2]);
    await tique();
    chamadas[1].ok(resposta('v2'));
    await tique();
    expect(esvaziou).toHaveBeenCalledTimes(1);
  });

  it('sessão expirada para a fila e descarta o resto', async () => {
    const { fila, chamadas, esvaziou } = montar(() => 'parar');
    void fila.adicionar(obs('a'));
    const b = fila.adicionar(obs('b'));
    chamadas[0].falha(new ApiError(401, 'Sessão expirada.'));
    expect(await b).toBeNull();
    expect(fila.pendentes()).toEqual([]);
    expect(chamadas).toHaveLength(1);
    expect(esvaziou).not.toHaveBeenCalled();
  });

  it('marco sobe a cada confirmação e podar tira o que o board já mostra', async () => {
    const { fila, chamadas } = montar();
    void fila.adicionar(obs('a'));
    expect(fila.marco()).toBe(0);
    chamadas[0].ok(resposta('v2'));
    await tique();
    expect(fila.marco()).toBe(1);
    const board = { geradoEm: '', avisos: [], usuarios: [], caixas: [caixa({ itens: [item({ versao: 'v1' })] })] };
    fila.podar(board, 0); // board pedido antes da confirmação e sem a versão nova: fica
    expect(fila.pendentes()).toHaveLength(1);
    fila.podar(board, 1);
    expect(fila.pendentes()).toEqual([]);
  });

  it('avisa os ouvintes a cada mudança', async () => {
    const { fila, chamadas } = montar();
    const ouvinte = vi.fn();
    const sair = fila.assinar(ouvinte);
    void fila.adicionar(obs('a'));
    chamadas[0].ok(resposta('v2'));
    await tique();
    expect(ouvinte.mock.calls.length).toBeGreaterThanOrEqual(3); // entrou, enviando, confirmada
    sair();
    void fila.adicionar(obs('b'));
    const n = ouvinte.mock.calls.length;
    await tique();
    expect(ouvinte.mock.calls.length).toBe(n);
  });
});
