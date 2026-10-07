import { describe, expect, it } from 'vitest';
import { corDoTipo, iniciais, nomeDoTipo } from './texto';

describe('texto', () => {
  it('iniciais', () => {
    expect(iniciais('Lucca')).toBe('LU');
    expect(iniciais('Maria Souza')).toBe('MS');
    expect(iniciais('')).toBe('—');
  });
  it('tipo da caixa', () => {
    expect(nomeDoTipo('ACABAMENTO')).toBe('Acabamento');
    expect(nomeDoTipo('COSTURA')).toBe('Costura');
    expect(nomeDoTipo('PREPARACAO')).toBe('Preparação');
    expect(nomeDoTipo('')).toBe('Caixa');
    expect(corDoTipo('ACABAMENTO')).toBe('var(--tipo-acabamento)');
    expect(corDoTipo('COSTURA')).toBe('var(--tipo-costura)');
    expect(corDoTipo('X')).toBe('var(--fog)');
  });
});
