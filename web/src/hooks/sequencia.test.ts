import { describe, expect, it } from 'vitest';
import { criarSequencia } from './sequencia';

describe('criarSequencia', () => {
  it('só a chamada mais recente continua valendo', () => {
    const s = criarSequencia();
    const a = s.nova();
    expect(a()).toBe(true);
    const b = s.nova();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
  });
  it('resposta antiga que chega depois da nova é descartada', async () => {
    const s = criarSequencia();
    const aplicados: string[] = [];
    const carregar = async (nome: string, espera: number) => {
      const vale = s.nova();
      await new Promise((r) => setTimeout(r, espera));
      if (vale()) aplicados.push(nome);
    };
    await Promise.all([carregar('antiga', 20), carregar('nova', 1)]);
    expect(aplicados).toEqual(['nova']);
  });
});
