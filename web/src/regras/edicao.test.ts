import { describe, expect, it } from 'vitest';
import { caixaEditavelNoApp } from './edicao';

describe('caixaEditavelNoApp', () => {
  const c = { dealId: '700001' };
  it('lista ausente ou vazia libera todas', () => {
    expect(caixaEditavelNoApp({}, c)).toBe(true);
    expect(caixaEditavelNoApp({ dealsEditaveis: [] }, c)).toBe(true);
  });
  it('com lista, só as que estão nela', () => {
    expect(caixaEditavelNoApp({ dealsEditaveis: ['700001'] }, c)).toBe(true);
    expect(caixaEditavelNoApp({ dealsEditaveis: ['607479158'] }, c)).toBe(false);
  });
});
