import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import {
  chaveDaAcao, dataPronta, desfechoDoErro, justificativaValida, mensagemSucesso, MSG_CONFLITO, MSG_FALHA,
  ordenarHistorico, SELO_PLOOMES, tamanhoJustificativa, validarBaixa, versaoAtual
} from './acoes';
import { item } from './teste-util';

const it26 = item({ un: 'UN', falta: 26, resta: 26 });

describe('validarBaixa', () => {
  it('aceita quantidade dentro do que resta, no limite e com vírgula', () => {
    expect(validarBaixa('10', it26)).toBeNull();
    expect(validarBaixa('26', it26)).toBeNull();
    expect(validarBaixa(' 2,5 ', it26)).toBeNull();
  });
  it('rejeita vazio, texto, zero e negativo', () => {
    for (const t of ['', '  ', 'abc', '0', '-3', '0,0', '1,2,3', '0,0001'])
      expect(validarBaixa(t, it26)).toBe('Informe uma quantidade maior que zero');
  });
  it('rejeita acima do que resta, com o número em pt-BR', () => {
    expect(validarBaixa('27', it26)).toBe('Falta só 26 UN');
    expect(validarBaixa('3', item({ un: 'cones', falta: 2.5, resta: 2.5 }))).toBe('Falta só 2,5 cones');
  });
  it('compara com tolerância de 3 casas', () => {
    expect(validarBaixa('0,2', item({ falta: 0.3, baixada: 0.1, resta: 0.19999999999999998 }))).toBeNull();
    expect(validarBaixa('1', item({ un: 'UN', falta: 5, baixada: 5, resta: 0 }))).toBe('Falta só 0 UN');
  });
  it('item sem quantidade faltante não recebe baixa', () => {
    expect(validarBaixa('1', item({ falta: null, resta: null }))).toBe('Item sem quantidade faltante registrada.');
  });
});

describe('justificativa', () => {
  it('conta sem os espaços das pontas e exige 15', () => {
    expect(tamanhoJustificativa('   abc   ')).toBe(3);
    expect(justificativaValida('  12345678901234  ')).toBe(false);
    expect(justificativaValida(' 123456789012345 ')).toBe(true);
  });
});

describe('dataPronta', () => {
  it('aceita vazio e datas completas com ano plausível', () => {
    expect(dataPronta('')).toBe(true);
    expect(dataPronta('2026-10-09')).toBe(true);
    expect(dataPronta('0202-10-09')).toBe(false);
    expect(dataPronta('2026-10')).toBe(false);
  });
});

describe('mensagemSucesso', () => {
  const z = { nome: 'ZÍPER METAL', un: 'UN' };
  const base = { dealId: '1', versao: '' };
  it('gera o aviso de cada ação', () => {
    expect(mensagemSucesso({ ...base, tipo: 'baixa', itemId: 'i', valor: 20 }, z)).toBe('Baixa registrada · 20 UN de ZÍPER METAL');
    expect(mensagemSucesso({ ...base, tipo: 'baixa', itemId: 'i', valor: 2.5 }, { nome: 'LINHA', un: 'cones' }))
      .toBe('Baixa registrada · 2,5 cones de LINHA');
    expect(mensagemSucesso({ ...base, tipo: 'previsao_item', itemId: 'i', valor: '2026-10-09' }, z)).toBe('Previsão de ZÍPER METAL: 09/10');
    expect(mensagemSucesso({ ...base, tipo: 'previsao_item', itemId: 'i', valor: '' }, z)).toBe('Previsão de ZÍPER METAL removida');
    expect(mensagemSucesso({ ...base, tipo: 'obs_item', itemId: 'i', valor: 'x' }, z)).toBe('Observação de ZÍPER METAL salva');
    expect(mensagemSucesso({ ...base, tipo: 'obs_item', itemId: 'i', valor: '' }, z)).toBe('Observação de ZÍPER METAL removida');
    expect(mensagemSucesso({ ...base, tipo: 'responsavel', valor: 'Renata' })).toBe('Responsável: Renata');
    expect(mensagemSucesso({ ...base, tipo: 'responsavel', valor: '' })).toBe('Responsável removido');
    expect(mensagemSucesso({ ...base, tipo: 'previsao_caixa', valor: '2026-10-09' })).toBe('Previsão da caixa: 09/10');
    expect(mensagemSucesso({ ...base, tipo: 'previsao_caixa', valor: '' })).toBe('Previsão da caixa removida');
    expect(mensagemSucesso({ ...base, tipo: 'obs_caixa', valor: 'x' })).toBe('Observação da caixa salva');
    expect(mensagemSucesso({ ...base, tipo: 'obs_caixa', valor: '' })).toBe('Observação da caixa removida');
    expect(mensagemSucesso({ ...base, tipo: 'mover', valor: 'completa_pedido' })).toBe('Caixa movida para Caixa completa · Pedido');
  });
});

describe('desfechoDoErro', () => {
  it('classifica a recusa do servidor', () => {
    expect(desfechoDoErro(new ApiError(401, 'Sessão expirada.'))).toEqual({ tipo: 'expirou' });
    expect(desfechoDoErro(new ApiError(409, 'x'))).toEqual({ tipo: 'conflito', texto: MSG_CONFLITO });
    expect(desfechoDoErro(new ApiError(400, 'Falta só 3 UN'))).toEqual({ tipo: 'aviso', texto: 'Falta só 3 UN' });
    expect(desfechoDoErro(new ApiError(404, 'Item não encontrado.'))).toEqual({ tipo: 'aviso', texto: 'Item não encontrado.' });
    expect(desfechoDoErro(new ApiError(500, 'Erro 500'))).toEqual({ tipo: 'aviso', texto: MSG_FALHA });
    expect(desfechoDoErro(new ApiError(0, 'Sem conexão com o servidor.'))).toEqual({ tipo: 'aviso', texto: MSG_FALHA });
    expect(desfechoDoErro(new Error('x'))).toEqual({ tipo: 'aviso', texto: MSG_FALHA });
  });
});

describe('histórico', () => {
  it('selos e ordem do mais novo para o mais antigo', () => {
    expect(SELO_PLOOMES.ENVIADO).toBe('enviado ao Ploomes');
    expect(SELO_PLOOMES.PENDENTE).toBe('aguardando Ploomes');
    expect(SELO_PLOOMES.ERRO).toBe('falhou no Ploomes');
    const e = (quando: string) => ({ quando, usuario: 'Lucca', texto: '', ploomes: 'ENVIADO' as const });
    expect(ordenarHistorico([e('2026-10-06T10:00:00Z'), e('2026-10-07T10:00:00Z')]).map((x) => x.quando))
      .toEqual(['2026-10-07T10:00:00Z', '2026-10-06T10:00:00Z']);
  });
});

describe('fila de ações', () => {
  it('chave por item ou por caixa', () => {
    expect(chaveDaAcao({ tipo: 'baixa', dealId: '7', itemId: 'a1', valor: 1, versao: '' })).toBe('item:7:a1');
    expect(chaveDaAcao({ tipo: 'obs_caixa', dealId: '7', valor: '', versao: '' })).toBe('caixa:7');
  });
  it('segue as trocas de versão feitas pelas nossas ações', () => {
    const t = new Map([['', 'v1'], ['v1', 'v2']]);
    expect(versaoAtual('', t)).toBe('v2');
    expect(versaoAtual('v1', t)).toBe('v2');
    expect(versaoAtual('outra', t)).toBe('outra');
    expect(versaoAtual('v0', undefined)).toBe('v0');
  });
});
