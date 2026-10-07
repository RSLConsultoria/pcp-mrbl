import { describe, expect, it } from 'vitest';
import { validarBaixa } from './acoes';
import { item } from './teste-util';

const it26 = item({ un: 'UN', falta: 26, resta: 26 });

describe('validarBaixa', () => {
  it('aceita quantidade dentro do que resta, no limite e com vírgula', () => {
    expect(validarBaixa('10', it26)).toBeNull();
    expect(validarBaixa('26', it26)).toBeNull();
    expect(validarBaixa(' 2,5 ', it26)).toBeNull();
  });
  it('rejeita vazio, texto, zero e negativo', () => {
    for (const t of ['', '  ', 'abc', '0', '-3', '0,0', '1,2,3'])
      expect(validarBaixa(t, it26)).toBe('Informe uma quantidade maior que zero');
  });
  it('rejeita acima do que resta, com o número em pt-BR', () => {
    expect(validarBaixa('27', it26)).toBe('Falta só 26 UN');
    expect(validarBaixa('3', item({ un: 'cones', falta: 2.5, resta: 2.5 }))).toBe('Falta só 2,5 cones');
  });
  it('item sem quantidade faltante não recebe baixa', () => {
    expect(validarBaixa('1', item({ falta: null, resta: null }))).toBe('Item sem quantidade faltante registrada.');
  });
});
