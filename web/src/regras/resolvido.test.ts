import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { resumoAlteracoes } from './pedidos';
import {
  acaoEditarPedido, entraNaUltimaEtapa, estadoDoPedido, etapaNoQuadro, partesPorPrevisao, previsaoMaisProxima,
  previsoesDiferentes, resumoDivisaoPorPrevisao, textoConfirmarResolvido, vazioDaEtapa
} from './pedidosQuadro';
import { colunaSaida, colunasSaida, nomeColunaSaida, podeEnviarOficina, saidasComColuna } from './saidas';
import { caixa, item } from './teste-util';

// 08/10/2026: "Resolvido" é a última etapa (mover para ela dá baixa), previsão por item
// e as colunas novas de Saídas (Resolvido / Enviado à oficina / Concluído).
const etapas: EtapaPedido[] = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'entregue', nome: 'Resolvido', ordem: 3 }
];
const ip = (o: Partial<ItemPedido> = {}): ItemPedido => ({
  itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', ...o
});
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '2026-10-15',
  responsavel: '', criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false,
  itens: [ip(), ip({ itemId: 'i2', dealId: '2', os: '90002', nome: 'ZÍPER', un: 'UN', qtd: 5 })], ...o
});

describe('Resolvido = última etapa', () => {
  it('pedido finalizado aparece na última coluna, qualquer que seja a etapa gravada', () => {
    expect(etapaNoQuadro(ped({ etapa: 'a_pedir', finalizado: true, baixadoEm: '2026-10-07' }), etapas)).toBe('entregue');
    expect(etapaNoQuadro(ped(), etapas)).toBe('solicitado');
    expect(etapaNoQuadro(ped({ finalizado: true }), [])).toBe('solicitado');
  });
  it('entrar na última etapa pede confirmação', () => {
    expect(entraNaUltimaEtapa('solicitado', 'entregue', etapas)).toBe(true);
    expect(entraNaUltimaEtapa('entregue', 'entregue', etapas)).toBe(false);
    expect(entraNaUltimaEtapa('a_pedir', 'solicitado', etapas)).toBe(false);
  });
  it('texto da confirmação com itens e OS', () => {
    expect(textoConfirmarResolvido(ped().itens, 'Resolvido'))
      .toBe('Mover para Resolvido dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita.');
    expect(textoConfirmarResolvido([ip()], 'Chegou')).toBe('Mover para Chegou dá baixa de 1 item em 1 OS. A baixa não pode ser desfeita.');
  });
  it('vazio da última coluna explica a baixa', () => {
    expect(vazioDaEtapa('aberto', 2, 3, false)).toBe('Mover um pedido para cá dá baixa nas caixas.');
    expect(vazioDaEtapa('finalizado', 0, 3, false)).toBe('Pedidos finalizados ficam na última etapa.');
  });
  it('mensagem de sucesso do mover para a última e do dividir por previsão', () => {
    expect(mensagemSucesso({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'v1', etapa: 'entregue' }, undefined, { etapa: 'Resolvido', baixa: true }))
      .toBe('PED-0044 movido para Resolvido · baixa registrada nas caixas');
    expect(mensagemSucesso({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'v1' }, undefined, { partes: 2 }))
      .toBe('PED-0044 dividido por previsão · 2 partes');
  });
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
    expect(resumoAlteracoes(antes, depois, etapas)).toEqual(['previsão de VIÉS: 15/10 → 18/10', 'previsão de ZÍPER: 22/10 → 15/10']);
    // mesma previsão efetiva: nada alterado
    const igual = structuredClone(antes);
    igual.itens[0].previsao = '2026-10-15';
    expect(acaoEditarPedido(p, antes, igual)).toBeNull();
    expect(resumoAlteracoes(antes, igual, etapas)).toEqual([]);
  });
});

describe('Saídas: Resolvido, Enviado à oficina e Concluído', () => {
  const ped2 = (id: string, etapa: string): Pedido => ped({ id, etapa, itens: [] });
  const saiu = (o = {}) => caixa({ saiu: true, saiuComFalta: true, saiuEm: '2026-10-01', ...o });
  it('colunas: Sem pedido (opcional), etapas menos a última, Resolvido, Enviado, Concluído', () => {
    expect(colunasSaida(etapas, true).map((c) => c.nome))
      .toEqual(['Sem pedido', 'A pedir', 'Solicitado', 'Resolvido', 'Enviado à oficina', 'Concluído']);
    expect(colunasSaida(etapas, false).map((c) => c.id)).toEqual(['etapa:a_pedir', 'etapa:solicitado', 'resolvido', 'enviado', 'concluido']);
    expect(colunasSaida(etapas, false).find((c) => c.id === 'resolvido')?.cor).toBe('var(--signal)');
    expect(nomeColunaSaida('concluido', etapas)).toBe('Concluído');
    // a coluna Resolvido usa o nome da última etapa
    expect(colunasSaida([{ id: 'x', nome: 'Pedir', ordem: 1 }, { id: 'y', nome: 'Chegou', ordem: 2 }], false).map((c) => c.nome))
      .toEqual(['Pedir', 'Chegou', 'Enviado à oficina', 'Concluído']);
  });
  it('derivação da coluna', () => {
    const tudoBaixado = saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })] });
    expect(colunaSaida(tudoBaixado, [], etapas)).toEqual({ coluna: 'resolvido' });
    expect(colunaSaida({ ...tudoBaixado, tratativa: 'ENVIADO' }, [], etapas)).toEqual({ coluna: 'enviado' });
    expect(colunaSaida({ ...tudoBaixado, tratativa: 'RECEBIDO' }, [], etapas)).toEqual({ coluna: 'concluido' });
    const naUltima = saiu({ itens: [item({ pedidoId: 'PED-0001' })] });
    expect(colunaSaida(naUltima, [ped2('PED-0001', 'entregue')], etapas)).toEqual({ coluna: 'resolvido' });
    expect(colunaSaida(naUltima, [ped2('PED-0001', 'solicitado')], etapas)).toEqual({ coluna: 'etapa:solicitado' });
  });
  it('Enviar à oficina: tudo baixado ou todos os pedidos na última etapa', () => {
    expect(podeEnviarOficina(saiu({ itens: [item({ status: 'RESOLVIDO', resta: 0 })] }), [], [])).toBe(true);
    expect(podeEnviarOficina(saiu({ itens: [item({ pedidoId: 'PED-0001' })] }), [ped2('PED-0001', 'entregue')], etapas)).toBe(true);
    expect(podeEnviarOficina(saiu({ itens: [item({ pedidoId: 'PED-0001' })] }), [ped2('PED-0001', 'solicitado')], etapas)).toBe(false);
    expect(podeEnviarOficina(saiu({ itens: [item()] }), [], etapas)).toBe(false);
  });
  it('Resolvido fica até enviar (se recente, 30 dias); Concluído some 30 dias depois da última ação', () => {
    const hoje = new Date(2026, 9, 8);
    const board = (caixas: Board['caixas']): Board => ({ geradoEm: '', caixas, avisos: [], usuarios: [], etapasPedido: etapas });
    const baixado = { itens: [item({ status: 'RESOLVIDO', resta: 0 })], saiuEm: '2026-08-01' };
    const r = saidasComColuna(board([
      saiu({ id: 'res', ...baixado, itens: [item({ status: 'RESOLVIDO', resta: 0, resolvidoEm: '2026-10-01' })] }),
      saiu({ id: 'antiga', ...baixado }),
      saiu({ id: 'velha', ...baixado, tratativa: 'RECEBIDO', tratativaEm: '2026-08-02' }),
      saiu({ id: 'nova', ...baixado, tratativa: 'RECEBIDO', tratativaEm: '2026-10-05' })
    ]), hoje);
    expect(r.map((x) => [x.caixa.id, x.coluna.coluna])).toEqual([['res', 'resolvido'], ['nova', 'concluido']]);
  });
});
