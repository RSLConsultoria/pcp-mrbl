import { describe, expect, it } from 'vitest';
import { ligarAvisoAoSair } from './avisoAoSair';

const sair = () => new Event('beforeunload', { cancelable: true });

describe('ligarAvisoAoSair', () => {
  it('enquanto ligado, sair da página pede confirmação do navegador', () => {
    const janela = new EventTarget();
    ligarAvisoAoSair(janela);
    const e = sair();
    janela.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('depois de desligar, sair da página não pede nada', () => {
    const janela = new EventTarget();
    const desligar = ligarAvisoAoSair(janela);
    desligar();
    const e = sair();
    janela.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
