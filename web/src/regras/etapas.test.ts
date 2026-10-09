import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { etapaDaBaixa, etapaFinal, validarEtapas } from './pedidos';
import {
  entraNaEtapaDaBaixa, etapaNoQuadro, motivoMoverPedido, motivoTravaEtapa, pedidoArrastavel, pedidoEditavel, textoConfirmarBaixa, vazioDaEtapa
} from './pedidosQuadro';

// 09/10/2026: A pedir · Solicitado · Aguardando entrega · Enviado ao destino final (dá a baixa) ·
// Concluído (o destino confirmou; finaliza o pedido). As duas últimas ficam fixas.
const etapas: EtapaPedido[] = [
  { id: 'concluido', nome: 'Concluído', ordem: 5 }, { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 }, { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 }
];
const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
const ip = (o: Partial<ItemPedido> = {}): ItemPedido => ({ itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', ...o });
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [ip(), ip({ itemId: 'i2', dealId: '2', os: '90002' })], ...o
});
const livre: Pick<Board, 'dealsEditaveis'> = { dealsEditaveis: [] };

describe('etapas fixas no fim', () => {
  it('a penúltima dá a baixa e a última finaliza, pela ordem', () => {
    expect(etapaDaBaixa(etapas)?.id).toBe('entregue');
    expect(etapaFinal(etapas)?.id).toBe('concluido');
    expect(etapaDaBaixa([etapas[0]])).toBeUndefined();
    expect(etapaFinal([])).toBeUndefined();
  });
  it('coluna no quadro: concluído na final, com baixa na da baixa, senão a etapa gravada', () => {
    expect(etapaNoQuadro(ped(), etapas)).toBe('aguardando');
    expect(etapaNoQuadro(ped({ baixadoEm: '2026-10-07' }), etapas)).toBe('entregue');
    expect(etapaNoQuadro(ped({ etapa: 'entregue', baixadoEm: '2026-10-07', finalizado: true }), etapas)).toBe('concluido');
  });
  it('confirmação só ao entrar na etapa da baixa', () => {
    expect(entraNaEtapaDaBaixa('aguardando', 'entregue', etapas)).toBe(true);
    expect(entraNaEtapaDaBaixa('entregue', 'concluido', etapas)).toBe(false);
    expect(entraNaEtapaDaBaixa('a_pedir', 'solicitado', etapas)).toBe(false);
    expect(textoConfirmarBaixa(ped().itens, 'Enviado ao destino final'))
      .toBe('Mover para Enviado ao destino final dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita.');
  });
  it('com a baixa, só vai para a final; a final só aceita pedido com baixa', () => {
    expect(motivoMoverPedido(ped(), 'solicitado', etapas)).toBeNull();
    expect(motivoMoverPedido(ped(), 'entregue', etapas)).toBeNull();
    expect(motivoMoverPedido(ped(), 'concluido', etapas)).toBe('Mova o pedido primeiro para Enviado ao destino final.');
    const comBaixa = ped({ etapa: 'entregue', baixadoEm: '2026-10-07' });
    expect(motivoMoverPedido(comBaixa, 'concluido', etapas)).toBeNull();
    expect(motivoMoverPedido(comBaixa, 'aguardando', etapas)).toBe('Pedido com baixa só pode ir para Concluído.');
  });
  it('pedido com baixa arrasta mas não edita; finalizado nem arrasta', () => {
    const comBaixa = ped({ baixadoEm: '2026-10-07' });
    expect(pedidoArrastavel(livre, comBaixa)).toBe(true);
    expect(pedidoEditavel(livre, comBaixa)).toBe(false);
    expect(pedidoEditavel(livre, ped())).toBe(true);
    expect(pedidoArrastavel(livre, ped({ finalizado: true }))).toBe(false);
    expect(pedidoArrastavel({ dealsEditaveis: ['1'] }, ped())).toBe(false);
  });
  it('vazio das colunas', () => {
    expect(vazioDaEtapa('aberto', 0, 5, false)).toBe('Pedidos gerados a partir das faltas entram aqui.');
    expect(vazioDaEtapa('aberto', 2, 5, false)).toBe('Arraste um pedido para esta etapa.');
    expect(vazioDaEtapa('aberto', 3, 5, false)).toBe('Mover um pedido para cá dá baixa nas caixas.');
    expect(vazioDaEtapa('aberto', 4, 5, false)).toBe('O destino confirmou o recebimento: o pedido termina aqui.');
    expect(vazioDaEtapa('finalizado', 4, 5, false)).toBe('Nenhum pedido finalizado ainda.');
  });
  it('mensagem do mover para a etapa da baixa', () => {
    expect(mensagemSucesso({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'v1', etapa: 'entregue' }, undefined, { etapa: 'Enviado ao destino final', baixa: true }))
      .toBe('PED-0044 movido para Enviado ao destino final · baixa registrada nas caixas');
  });
});

describe('validarEtapas e motivoTravaEtapa', () => {
  const FIM = [{ id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }];
  it('mínimo de 3', () => {
    expect(validarEtapas(FIM, [], ordenadas)).toBe('O quadro precisa de pelo menos 3 etapas.');
    expect(motivoTravaEtapa(undefined, 3, [])).toBe('O quadro precisa de pelo menos 3 etapas');
    expect(motivoTravaEtapa(undefined, 4, [])).toBeNull();
  });
  it('as duas últimas continuam no fim, nessa ordem (podem ser renomeadas)', () => {
    const msg = 'As etapas Enviado ao destino final e Concluído precisam continuar no fim, nessa ordem.';
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, FIM[1], FIM[0]], [], ordenadas)).toBe(msg);
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, ...FIM, { nome: 'Depois' }], [], ordenadas)).toBe(msg);
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Nova' }, { id: 'entregue', nome: 'Enviado' }, { id: 'concluido', nome: 'Recebido' }], [], ordenadas)).toBeNull();
  });
  it('etapa com pedido não concluído não sai', () => {
    const novas = [{ id: 'a_pedir', nome: 'A pedir' }, ...FIM];
    expect(validarEtapas(novas, [ped({ etapa: 'solicitado' })], ordenadas)).toBe('A etapa Solicitado tem pedidos abertos.');
    expect(validarEtapas(novas, [ped({ etapa: 'solicitado', finalizado: true })], ordenadas)).toBeNull();
  });
});
