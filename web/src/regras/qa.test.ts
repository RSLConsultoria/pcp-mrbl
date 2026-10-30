import { describe, expect, it } from 'vitest';
import { textoFaixaQa } from './qa';

describe('faixa do ambiente de QA', () => {
  it('mostra a data e a hora da cópia no horário de São Paulo', () => {
    expect(textoFaixaQa('2026-10-30T13:05:00.000Z'))
      .toBe('AMBIENTE DE QA · dados copiados em 30/10 10:05 · nada altera a planilha original');
    expect(textoFaixaQa('2026-01-02T02:59:00.000Z'))
      .toBe('AMBIENTE DE QA · dados copiados em 01/01 23:59 · nada altera a planilha original');
  });
  it('sem data (recarga ainda não rodou ou data inválida) continua avisando', () => {
    expect(textoFaixaQa('')).toBe('AMBIENTE DE QA · dados copiados em --/-- --:-- · nada altera a planilha original');
    expect(textoFaixaQa('ontem')).toBe('AMBIENTE DE QA · dados copiados em --/-- --:-- · nada altera a planilha original');
  });
});
