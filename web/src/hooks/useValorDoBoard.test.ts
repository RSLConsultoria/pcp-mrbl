import { describe, expect, it } from 'vitest';
import { adotarDoBoard } from './useValorDoBoard';

describe('adotarDoBoard', () => {
  it('fora do foco, o board sempre vence', () => {
    expect(adotarDoBoard('digitado', 'antigo', false)).toBe(true);
  });
  it('com foco e sem edição local, acompanha o board', () => {
    expect(adotarDoBoard('antigo', 'antigo', true)).toBe(true);
  });
  it('com foco e texto em edição, mantém o que está sendo digitado', () => {
    expect(adotarDoBoard('digitado', 'antigo', true)).toBe(false);
  });
});
