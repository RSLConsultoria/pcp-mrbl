import { describe, expect, it } from 'vitest';
import { caixaAtendeBusca, normalizar } from './busca';
import { caixa, item } from './teste-util';

const c = caixa({ os: '90002', peca: 'CALÇA TESTE AÇAI', cliente: 'CLIENTE BETA', responsavel: 'Maria', referencia: 'R-77',
  itens: [item({ nome: 'TAG CUIDADOS PADRÃO', cor: 'amora' })] });

describe('busca', () => {
  it('normalizar tira acento, caixa e espaços das pontas', () => {
    expect(normalizar('  Calça AÇAÍ ')).toBe('calca acai');
  });
  it('procura em OS, peça, cliente, responsável, referência e itens, sem acento', () => {
    expect(caixaAtendeBusca(c, '')).toBe(true);
    expect(caixaAtendeBusca(c, '0002')).toBe(true);
    expect(caixaAtendeBusca(c, 'acai')).toBe(true);
    expect(caixaAtendeBusca(c, 'beta')).toBe(true);
    expect(caixaAtendeBusca(c, 'maria')).toBe(true);
    expect(caixaAtendeBusca(c, 'r-77')).toBe(true);
    expect(caixaAtendeBusca(c, 'padrao')).toBe(true);
    expect(caixaAtendeBusca(c, 'AMORA')).toBe(true);
    expect(caixaAtendeBusca(c, 'zíper')).toBe(false);
  });
});
