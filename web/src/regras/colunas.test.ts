import { describe, expect, it } from 'vitest';
import { colunaDaCaixa, COLUNAS, itemAberto, itensAbertos, visivelNoQuadro } from './colunas';
import { caixa, item } from './teste-util';

const HOJE = new Date(2026, 9, 7);
const resolvido = item({ id: 'r', status: 'RESOLVIDO', falta: 0, resta: 0 });

describe('colunas', () => {
  it('tem as 6 colunas na ordem do protótipo', () => {
    expect(COLUNAS.map((c) => c.id)).toEqual(['falta_pedido', 'completa_pedido', 'falta_corte', 'completa_corte', 'saiu_com', 'saiu_sem']);
  });
  it('itemAberto: ABERTO/PARCIAL com falta > 0 ou desconhecida', () => {
    expect(itemAberto(item())).toBe(true);
    expect(itemAberto(item({ status: 'PARCIAL', falta: 4, resta: 4 }))).toBe(true);
    expect(itemAberto(item({ falta: 0, resta: 0 }))).toBe(false);
    expect(itemAberto(item({ falta: 52, baixada: 52, resta: 0 }))).toBe(false);
    expect(itemAberto(item({ falta: null, resta: null }))).toBe(true);
    expect(itemAberto(resolvido)).toBe(false);
    expect(itensAbertos(caixa({ itens: [item(), resolvido] }))).toHaveLength(1);
  });
  it('colunaDaCaixa', () => {
    expect(colunaDaCaixa(caixa())).toBe('falta_pedido');
    expect(colunaDaCaixa(caixa({ itens: [resolvido] }))).toBe('completa_pedido');
    expect(colunaDaCaixa(caixa({ ciclo: 'CORTE' }))).toBe('falta_corte');
    expect(colunaDaCaixa(caixa({ ciclo: 'CORTE', itens: [] }))).toBe('completa_corte');
    expect(colunaDaCaixa(caixa({ saiu: true }))).toBe('saiu_com');
    expect(colunaDaCaixa(caixa({ saiu: true, itens: [resolvido] }))).toBe('saiu_sem');
  });
  it('colunaDaCaixa ignora colunaManual (a coluna vem dos dados)', () => {
    expect(colunaDaCaixa({ ...caixa(), colunaManual: 'saiu_sem' } as never)).toBe('falta_pedido');
  });
  it('visivelNoQuadro esconde "saiu sem faltas" depois de 30 dias', () => {
    const saiuSem = (saiuEm: string) => caixa({ saiu: true, saiuEm, itens: [] });
    expect(visivelNoQuadro(saiuSem('2026-09-07'), HOJE)).toBe(true);
    expect(visivelNoQuadro(saiuSem('2026-09-06'), HOJE)).toBe(false);
    expect(visivelNoQuadro(saiuSem(''), HOJE)).toBe(true);
    expect(visivelNoQuadro(caixa({ saiu: true, saiuEm: '2026-01-01' }), HOJE)).toBe(true);
  });
});
