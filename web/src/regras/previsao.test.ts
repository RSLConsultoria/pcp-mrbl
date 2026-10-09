import { describe, expect, it } from 'vitest';
import type { ItemPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { resumoAlteracoes } from './pedidos';
import {
  acaoEditarPedido, estadoDoPedido, partesPorPrevisao, previsaoMaisProxima, previsoesDiferentes, resumoDivisaoPorPrevisao
} from './pedidosQuadro';

// 08/10/2026: previsão por item (PEDIDOS_ITENS.previsao) e dividir por previsão.
const ip = (o: Partial<ItemPedido> = {}): ItemPedido => ({
  itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', ...o
});
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '2026-10-15',
  responsavel: '', criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false,
  itens: [ip(), ip({ itemId: 'i2', dealId: '2', os: '90002', nome: 'ZÍPER', un: 'UN', qtd: 5 })], ...o
});

describe('previsão por item', () => {
  const tres = ped({
    itens: [
      ip({ previsao: '2026-10-15' }),
      ip({ itemId: 'i2', dealId: '2', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 5, previsao: '2026-10-25' }),
      ip({ itemId: 'i3', nome: 'ZÍPER', un: 'UN', qtd: 6, previsao: '2026-10-20' })
    ]
  });
  it('mais próxima e previsões diferentes (com ou sem os campos do board)', () => {
    expect(previsaoMaisProxima(tres)).toBe('2026-10-15');
    expect(previsoesDiferentes(tres)).toBe(true);
    expect(previsoesDiferentes(ped())).toBe(false);
    expect(previsaoMaisProxima(ped({ previsao: '' }))).toBe('');
    expect(previsaoMaisProxima({ ...tres, previsaoMaisProxima: '2026-10-01' })).toBe('2026-10-01');
  });
  it('partes por previsão: a mais próxima fica; ids das partes em sequência', () => {
    const outras = [tres, ped({ id: 'PED-0044.1', pai: 'PED-0044' })];
    const partes = partesPorPrevisao(tres, outras);
    expect(partes.map((p) => [p.id, p.previsao, p.itens.map((i) => i.itemId)])).toEqual([
      ['PED-0044.2', '2026-10-20', ['i3']],
      ['PED-0044.3', '2026-10-25', ['i2']]
    ]);
    expect(resumoDivisaoPorPrevisao(tres, partes)).toEqual([
      'PED-0044.2 (previsão 20/10): 6 UN de ZÍPER',
      'PED-0044.3 (previsão 25/10): 5 UN de BOTÃO',
      'PED-0044 fica com: 20 MT de VIÉS (previsão 15/10)'
    ]);
  });
  it('estado editável guarda só a previsão própria do item; editar manda a previsão quando muda', () => {
    const p = ped({ itens: [ip({ previsao: '2026-10-15' }), ip({ itemId: 'i2', nome: 'ZÍPER', previsao: '2026-10-22' })] });
    const antes = estadoDoPedido(p);
    expect(antes.itens.map((i) => i.previsao)).toEqual(['', '2026-10-22']);
    const depois = structuredClone(antes);
    depois.itens[0].previsao = '2026-10-18';
    depois.itens[1].previsao = '';
    expect(acaoEditarPedido(p, antes, depois)).toEqual({
      tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'v1', campos: {},
      itens: [{ itemId: 'i1', qtd: 20, fornecedor: '', previsao: '2026-10-18' }, { itemId: 'i2', qtd: 20, fornecedor: '', previsao: '' }]
    });
    expect(resumoAlteracoes(antes, depois)).toEqual(['previsão de VIÉS: 15/10 → 18/10', 'previsão de ZÍPER: 22/10 → 15/10']);
    const igual = structuredClone(antes);
    igual.itens[0].previsao = '2026-10-15';
    expect(acaoEditarPedido(p, antes, igual)).toBeNull();
    expect(resumoAlteracoes(antes, igual)).toEqual([]);
  });
  it('mensagem de sucesso do dividir por previsão', () => {
    expect(mensagemSucesso({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'v1' }, undefined, { partes: 2 }))
      .toBe('PED-0044 dividido por previsão · 2 partes');
  });
});
