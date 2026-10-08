import { describe, expect, it } from 'vitest';
import type { EtapaPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import {
  etapasParaDividir, historicoDoPedido, partesDoPedido, proximoIdParte, raizDoPedido, resumoDivisao, validarDivisao
} from './pedidosQuadro';
import { colunaSaida, textoPedidoDoItem } from './saidas';
import { faltasSemPedido } from './pedidos';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'rec', nome: 'Recebidos', ordem: 3 },
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ent', nome: 'Entregue', ordem: 4 }
];
const ziper = { itemId: 'z', dealId: '1', os: '90001', nome: 'ZÍPER METAL', un: 'UN', qtd: 52, fornecedor: '' };
const vies = { itemId: 'v', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 10, fornecedor: '' };
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0002', pai: '', etapa: 'sol', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [ziper, vies], ...o
});

describe('ids das partes', () => {
  it('raiz, partes e próximo id', () => {
    const lista = [ped(), ped({ id: 'PED-0002.1', pai: 'PED-0002' }), ped({ id: 'PED-0002.3', pai: 'PED-0002', finalizado: true }), ped({ id: 'PED-0020.9', pai: 'PED-0020' })];
    expect(raizDoPedido('PED-0002.3')).toBe('PED-0002');
    expect(partesDoPedido(lista, 'PED-0002').map((p) => p.id)).toEqual(['PED-0002.1', 'PED-0002.3']);
    expect(proximoIdParte(lista, 'PED-0002')).toBe('PED-0002.4');
    expect(proximoIdParte(lista, 'PED-0002.1')).toBe('PED-0002.4');
    expect(proximoIdParte([ped()], 'PED-0002')).toBe('PED-0002.1');
  });
});

describe('etapasParaDividir', () => {
  it('todas menos a atual; padrão = a seguinte', () => {
    const r = etapasParaDividir(etapas, 'sol');
    expect(r.opcoes.map((e) => e.id)).toEqual(['a', 'rec', 'ent']);
    expect(r.padrao).toBe('rec');
    expect(etapasParaDividir(etapas, 'ent').padrao).toBe('a');
  });
});

describe('validarDivisao', () => {
  const p = ped();
  it('parcial ok', () => {
    expect(validarDivisao(p, [{ itemId: 'z', chegou: true, qtd: '20' }, { itemId: 'v', chegou: false, qtd: '10' }]))
      .toEqual({ erros: {}, geral: null, itens: [{ itemId: 'z', qtd: 20 }] });
  });
  it('erros por item e gerais', () => {
    expect(validarDivisao(p, [{ itemId: 'z', chegou: true, qtd: '53' }]).erros).toEqual({ z: 'O pedido tem só 52 UN de ZÍPER METAL.' });
    expect(validarDivisao(p, [{ itemId: 'z', chegou: true, qtd: '0' }]).erros).toEqual({ z: 'Informe uma quantidade maior que zero' });
    expect(validarDivisao(p, [{ itemId: 'z', chegou: false, qtd: '52' }]).geral).toBe('Marque ao menos um item que chegou.');
    expect(validarDivisao(p, [{ itemId: 'z', chegou: true, qtd: '52' }, { itemId: 'v', chegou: true, qtd: '10' }]).geral)
      .toBe('Para mover o pedido inteiro, arraste o card.');
    expect(validarDivisao(p, [{ itemId: 'z', chegou: true, qtd: '52' }, { itemId: 'v', chegou: true, qtd: '9,5' }]).geral).toBeNull();
  });
});

describe('resumoDivisao e aviso', () => {
  it('o que vai e o que fica', () => {
    expect(resumoDivisao(ped(), [{ itemId: 'z', qtd: 20 }], 'PED-0002.1', 'Recebidos'))
      .toBe('PED-0002.1 vai para Recebidos com: 20 UN de ZÍPER METAL; o PED-0002 fica com: 32 UN de ZÍPER METAL; 10 MT de VIÉS');
  });
  it('mensagem de sucesso usa o id devolvido', () => {
    expect(mensagemSucesso({ tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'rec', itens: [] }, undefined,
      { pedidoId: 'PED-0002.1', etapa: 'Recebidos' })).toBe('PED-0002 dividido · PED-0002.1 em Recebidos');
  });
});

describe('Saídas com pedidoIds', () => {
  const saiu = (itens = [item()]) => caixa({ saiu: true, saiuComFalta: true, itens });
  const lista = [ped({ etapa: 'ent' }), ped({ id: 'PED-0002.1', pai: 'PED-0002', etapa: 'rec' })];
  it('a parte mais atrasada define a coluna; última etapa só com todas as partes nela', () => {
    const c = saiu([item({ id: 'z', pedidoId: 'PED-0002', pedidoIds: ['PED-0002', 'PED-0002.1'] })]);
    expect(colunaSaida(c, lista, etapas)).toEqual({ coluna: 'etapa:rec', etapasDiferentes: true });
    expect(colunaSaida(c, [lista[0], { ...lista[1], etapa: 'ent' }], etapas)).toEqual({ coluna: 'etapa:ent' });
  });
  it('com pedido quando pedidoIds não está vazio; texto com as partes', () => {
    const c = saiu([item({ id: 'z', pedidoId: 'PED-0002.1', pedidoIds: ['PED-0002.1'] }), item({ id: 'y' })]);
    expect(colunaSaida(c, lista, etapas)).toEqual({ coluna: 'sem_pedido', parcial: { com: 1, total: 2 } });
    expect(textoPedidoDoItem(item({ pedidoId: 'PED-0002', pedidoIds: ['PED-0002', 'PED-0002.1'] }), lista, etapas))
      .toBe('PED-0002 · Entregue, PED-0002.1 · Recebidos');
    const board = { geradoEm: '', avisos: [], usuarios: [], caixas: [c] };
    expect(faltasSemPedido(board)[0].itens.map((i) => i.id)).toEqual(['y']);
  });
});

describe('historicoDoPedido com partes', () => {
  it('PED-0002 não pega as linhas só da parte', () => {
    const h = (texto: string) => ({ quando: '2026-10-08T10:00:00.000Z', usuario: 'Lucca', texto, ploomes: 'ENVIADO' as const });
    const c = caixa({ historico: [h('Lucca moveu PED-0002.1 para Entregue'), h('Lucca dividiu PED-0002: 20 UN de ZÍPER foram para PED-0002.1 (Recebidos)')] });
    expect(historicoDoPedido([c], 'PED-0002').map((x) => x.texto)).toEqual(['Lucca dividiu PED-0002: 20 UN de ZÍPER foram para PED-0002.1 (Recebidos)']);
    expect(historicoDoPedido([c], 'PED-0002.1')).toHaveLength(2);
  });
});

describe('textoFamilia', () => {
  it('parte, original dividido e pedido comum', async () => {
    const { textoFamilia } = await import('./pedidosQuadro');
    expect(textoFamilia({ pai: 'PED-0002' }, 0)).toBe('parte de PED-0002');
    expect(textoFamilia({ pai: '' }, 2)).toBe('dividido em 2 partes');
    expect(textoFamilia({ pai: '' }, 1)).toBe('dividido em 1 parte');
    expect(textoFamilia({ pai: '' }, 0)).toBe('');
  });
});
