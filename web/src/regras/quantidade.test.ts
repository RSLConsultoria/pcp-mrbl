import { describe, expect, it } from 'vitest';
import { contaDoItem, formatarNumero, formatarQtd } from './quantidade';
import { item } from './teste-util';

describe('quantidade', () => {
  it('formatarNumero usa vírgula e até 3 casas', () => {
    expect(formatarNumero(163.5)).toBe('163,5');
    expect(formatarNumero(1200)).toBe('1.200');
  });
  it('formatarQtd mostra unidade e gramas quando houver', () => {
    expect(formatarQtd(26, 'UN', null)).toBe('26 UN');
    expect(formatarQtd(2, 'cones', 100)).toBe('2 cones · 100 g');
    expect(formatarQtd(3, '', null)).toBe('3');
    expect(formatarQtd(null, 'UN', null)).toBe('—');
  });
  it('contaDoItem mostra faltava, baixado e resta', () => {
    expect(contaDoItem(item({ falta: 42, baixada: 10, resta: 32 }))).toBe('faltava 42 UN · baixado 10 · resta 32 UN');
    expect(contaDoItem(item({ un: 'cones', falta: 2, faltaG: 100, baixada: 0, resta: 2, restaG: 100 })))
      .toBe('faltava 2 cones · 100 g · baixado 0 · resta 2 cones · 100 g');
    expect(contaDoItem(item({ falta: null, resta: null }))).toBe('falta não informada');
  });
});
