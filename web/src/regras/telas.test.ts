import { describe, expect, it } from 'vitest';
import { buscaDaPeca, hashDaPeca, hashDaTela, telaDoHash } from './telas';

describe('telaDoHash / hashDaTela', () => {
  it('lê o hash e volta ao No Ploomes no resto', () => {
    expect(telaDoHash('#saidas')).toBe('saidas');
    expect(telaDoHash('#PEDIDOS')).toBe('pedidos');
    expect(telaDoHash('#producao')).toBe('producao');
    expect(telaDoHash('')).toBe('ploomes');
    expect(telaDoHash('#outra')).toBe('ploomes');
  });
  it('Visão da peça: #peca e #peca/<OS ou referência>', () => {
    expect(telaDoHash('#peca')).toBe('peca');
    expect(telaDoHash('#peca/90001')).toBe('peca');
    expect(telaDoHash('#PECA/REF%2001')).toBe('peca');
    expect(telaDoHash('#pecas')).toBe('ploomes');
    expect(buscaDaPeca('#peca/REF%2001%2FA')).toBe('REF 01/A');
    expect(buscaDaPeca('#peca')).toBe('');
    expect(buscaDaPeca('#peca/%E0%A4%A')).toBe('');
    expect(hashDaPeca(' REF 01/A ')).toBe('#peca/REF%2001%2FA');
    expect(hashDaTela('peca')).toBe('#peca');
  });
  it('ida e volta', () => {
    for (const t of ['ploomes', 'saidas', 'pedidos', 'producao', 'peca'] as const) expect(telaDoHash(hashDaTela(t))).toBe(t);
  });
});
