import { describe, expect, it } from 'vitest';
import { ddmm, diasEntre, horaMinuto, paraData, textoDias } from './datas';

const HOJE = new Date(2026, 9, 7, 15, 30);

describe('datas', () => {
  it('paraData lê aaaa-mm-dd com ou sem hora', () => {
    expect(paraData('2026-10-01')?.getDate()).toBe(1);
    expect(paraData('2026-10-01 09:00')?.getMonth()).toBe(9);
    expect(paraData('')).toBeNull();
  });
  it('diasEntre conta dias de calendário até hoje', () => {
    expect(diasEntre('2026-10-07', HOJE)).toBe(0);
    expect(diasEntre('2026-10-06', HOJE)).toBe(1);
    expect(diasEntre('2026-09-07', HOJE)).toBe(30);
    expect(diasEntre('', HOJE)).toBeNull();
  });
  it('textoDias', () => {
    expect(textoDias(0)).toBe('hoje');
    expect(textoDias(1)).toBe('há 1 dia');
    expect(textoDias(12)).toBe('há 12 dias');
    expect(textoDias(null)).toBe('');
  });
  it('ddmm e horaMinuto', () => {
    expect(ddmm('2026-10-09')).toBe('09/10');
    expect(ddmm('')).toBe('');
    expect(horaMinuto(new Date(2026, 9, 7, 7, 58).toISOString())).toBe('07:58');
    expect(horaMinuto('lixo')).toBe('--:--');
  });
});
