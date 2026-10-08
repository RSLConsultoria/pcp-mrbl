import { describe, expect, it } from 'vitest';
import { hashDaTela, telaDoHash } from './telas';

describe('telaDoHash / hashDaTela', () => {
  it('lê o hash e volta ao No Ploomes no resto', () => {
    expect(telaDoHash('#saidas')).toBe('saidas');
    expect(telaDoHash('#PEDIDOS')).toBe('pedidos');
    expect(telaDoHash('')).toBe('ploomes');
    expect(telaDoHash('#outra')).toBe('ploomes');
  });
  it('ida e volta', () => {
    for (const t of ['ploomes', 'saidas', 'pedidos'] as const) expect(telaDoHash(hashDaTela(t))).toBe(t);
  });
});
