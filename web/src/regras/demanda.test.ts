import { describe, expect, it } from 'vitest';
import type { Board } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { colunaDaCaixa, semPosSaida } from './colunas';
import { acaoNovaDemanda, caixaDaDemanda, linhaVazia, MAX_ITENS_DEMANDA, MSG_MAX_ITENS_DEMANDA, validarDemanda } from './demanda';
import { aplicarOtimista } from './otimista';
import { faltasSemPedido } from './pedidos';
import { saiuComFalta } from './saidas';
import { caixa, item } from './teste-util';

const quadro = (caixas: Board['caixas'], o: Partial<Board> = {}): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas, ...o });
const saiu = caixa({ id: '700003', dealId: '700003', os: '90003', tipo: 'COSTURA', saiu: true, saiuEm: '2026-10-01', itens: [] });

describe('caixaDaDemanda', () => {
  it('acha a caixa que saiu pela OS e pelo tipo', () => {
    expect(caixaDaDemanda(quadro([saiu]), ' 90003 ', 'COSTURA')).toEqual({ caixa: saiu });
  });
  it('mensagens iguais às do servidor', () => {
    expect(caixaDaDemanda(quadro([saiu]), '90003', 'ACABAMENTO')).toEqual({ erro: 'Caixa da OS 90003 (Acabamento) não encontrada.' });
    expect(caixaDaDemanda(quadro([{ ...saiu, saiu: false }]), '90003', 'COSTURA')).toEqual({ erro: 'A caixa da OS 90003 (Costura) ainda não saiu.' });
    expect(caixaDaDemanda(quadro([saiu, { ...saiu, id: '700099', dealId: '700099' }]), '90003', 'COSTURA'))
      .toEqual({ erro: 'Mais de uma caixa da OS 90003 (Costura) saiu. Fale com o PCP.' });
    expect(caixaDaDemanda(quadro([saiu], { dealsEditaveis: ['1'] }), '90003', 'COSTURA')).toEqual({ erro: 'Edição liberada em breve para esta caixa.' });
  });
});

describe('validarDemanda', () => {
  it('nome, quantidade e unidade obrigatórios; cor opcional; linha vazia ignorada', () => {
    const r = validarDemanda([
      { nome: ' BOTÃO ', cor: '', qtd: '2', un: 'UN' },
      { nome: '', cor: '', qtd: '', un: '' },
      { nome: 'VIÉS', cor: 'preto', qtd: '0', un: 'MT' },
      { nome: 'LINHA', cor: '', qtd: '1,5', un: '' },
      { nome: '', cor: 'azul', qtd: '1', un: 'UN' }
    ]);
    expect(r.itens).toEqual([{ nome: 'BOTÃO', cor: '', qtd: 2, un: 'UN' }]);
    expect(r.erros).toEqual({ 2: 'Informe uma quantidade maior que zero', 3: 'Informe a unidade do item.', 4: 'Informe o nome do item.' });
  });
  it('no máximo 30 itens, com a mensagem do servidor', () => {
    expect(MAX_ITENS_DEMANDA).toBe(30);
    expect(MSG_MAX_ITENS_DEMANDA).toBe('No máximo 30 itens por demanda.');
    const linha = { nome: 'X', cor: '', qtd: '1', un: 'UN' };
    expect(validarDemanda(Array.from({ length: 30 }, () => linha)).geral).toBeNull();
    expect(validarDemanda(Array.from({ length: 31 }, () => linha)).geral).toBe('No máximo 30 itens por demanda.');
    // linhas vazias não contam
    expect(validarDemanda([...Array.from({ length: 30 }, () => linha), linhaVazia()]).geral).toBeNull();
  });
  it('corpo da ação e mensagem de sucesso', () => {
    const a = acaoNovaDemanda(' 90003 ', 'COSTURA', [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }]);
    expect(a).toEqual({ tipo: 'nova_demanda', os: '90003', caixa: 'COSTURA', itens: [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }] });
    expect(mensagemSucesso(a)).toBe('Demanda pós-saída criada · 1 item na OS 90003');
  });
});

describe('demanda pós-saída nas telas', () => {
  it('otimista: os itens entram na caixa como pós-saída, ainda sem edição (id provisório)', () => {
    const b = aplicarOtimista(quadro([saiu]), acaoNovaDemanda('90003', 'COSTURA', [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }]), { hoje: '2026-10-09', n: 4 });
    expect(b.caixas[0].itens).toMatchObject([{ id: 'novo:4.0', nome: 'BOTÃO', cor: 'azul', un: 'UN', falta: 2, resta: 2, status: 'ABERTO', posSaida: true, editavel: false }]);
    const sem = quadro([{ ...saiu, saiu: false }]);
    expect(aplicarOtimista(sem, acaoNovaDemanda('90003', 'COSTURA', [{ nome: 'X', cor: '', qtd: 1, un: 'UN' }]), { hoje: '', n: 1 })).toBe(sem);
  });
  it('otimista acha a caixa como o servidor: OS com espaços, só caixa editável e uma só que saiu', () => {
    const um = [{ nome: 'X', cor: '', qtd: 1, un: 'UN' }];
    const acao = { tipo: 'nova_demanda' as const, os: ' 90003 ', caixa: 'COSTURA' as const, itens: um };
    expect(aplicarOtimista(quadro([{ ...saiu, os: '90003 ' }]), acao, { hoje: '', n: 1 }).caixas[0].itens).toHaveLength(1);
    const so = quadro([saiu], { dealsEditaveis: ['1'] });
    expect(aplicarOtimista(so, acao, { hoje: '', n: 1 })).toBe(so);
    const duas = quadro([saiu, { ...saiu, id: '700099', dealId: '700099' }]);
    expect(aplicarOtimista(duas, acao, { hoje: '', n: 1 })).toBe(duas);
  });
  it('item pós-saída gravado aparece em Faltas sem pedido e põe a caixa em Saídas, mas não no No Ploomes', () => {
    const c = { ...saiu, itens: [item({ id: '700003|POS_SAIDA|u1', posSaida: true })] };
    expect(faltasSemPedido(quadro([c]))[0].itens.map((i) => i.id)).toEqual(['700003|POS_SAIDA|u1']);
    expect(saiuComFalta(c)).toBe(true);
    expect(saiuComFalta({ ...c, itens: [] })).toBe(false);
    expect(semPosSaida(c).itens).toEqual([]);
    expect(colunaDaCaixa(semPosSaida(c))).toBe('saiu_sem');
    const misto = { ...c, itens: [item({ id: 'a' }), ...c.itens] };
    expect(semPosSaida(misto).itens.map((i) => i.id)).toEqual(['a']);
    expect(semPosSaida(saiu)).toBe(saiu);
  });
});
