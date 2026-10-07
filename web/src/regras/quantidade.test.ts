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
  it('contaDoItem junta necessário, separado e falta', () => {
    expect(contaDoItem(item({ necessaria: 52, separada: 10, falta: 42 }))).toBe('necessário 52 · separado 10 · falta 42 UN');
    expect(contaDoItem(item({ necessaria: null, separada: null, falta: 3, un: 'cones' }))).toBe('falta 3 cones');
  });
});
