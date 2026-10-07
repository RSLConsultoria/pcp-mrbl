// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { lerSessao, limparSessao, salvarSessao } from './sessao';

const S = { token: 't', nome: 'Lucca', perfil: 'ADM', expiraEm: '2026-10-08T00:00:00.000Z' };
const ANTES = Date.parse('2026-10-07T12:00:00.000Z');
const DEPOIS = Date.parse('2026-10-08T00:00:01.000Z');

describe('sessao', () => {
  beforeEach(() => localStorage.clear());

  it('salva, lê e limpa', () => {
    salvarSessao(S);
    expect(lerSessao(ANTES)).toEqual(S);
    limparSessao();
    expect(lerSessao(ANTES)).toBeNull();
  });

  it('sessão vencida é descartada', () => {
    salvarSessao(S);
    expect(lerSessao(DEPOIS)).toBeNull();
    expect(localStorage.getItem('pcp-mrbl.sessao')).toBeNull();
  });

  it('conteúdo corrompido não quebra', () => {
    localStorage.setItem('pcp-mrbl.sessao', '{nao e json');
    expect(lerSessao(ANTES)).toBeNull();
  });
});
