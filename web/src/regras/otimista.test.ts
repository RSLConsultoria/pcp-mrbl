import { describe, expect, it } from 'vitest';
import type { Acao, Board, EtapaPedido, ItemPedido, Pedido, Producao } from '../api/tipos';
import { aplicarOtimista, aplicarPendentes, pendentesVivos, versaoNoBoard, type Pendente } from './otimista';
import { faltasSemPedido } from './pedidos';
import { textoPedidoDoItem } from './saidas';
import { caixa, item } from './teste-util';

const ctx = { hoje: '2026-10-08', n: 7 };
const etapas: EtapaPedido[] = [
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ent', nome: 'Enviado ao destino final', ordem: 3 },
  { id: 'fim', nome: 'Concluído', ordem: 4 }
];
const pi = (o: Partial<ItemPedido> = {}): ItemPedido => ({
  itemId: 'i1', dealId: '600001', os: '90001', nome: 'ZIPER METAL', un: 'UN', qtd: 52, fornecedor: '', previsao: '', ...o
});
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0002', pai: '', etapa: 'sol', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [pi()], ...o
});
// Caixa 600001 com o item i1 (falta 52) e o i2 (falta 10), os dois no PED-0002.
function quadro(o: Partial<Board> = {}): Board {
  return {
    geradoEm: '', avisos: [], usuarios: [], etapasPedido: etapas,
    caixas: [caixa({ versao: 'c1', itens: [item({ versao: 'v-i1', pedidoId: 'PED-0002' }), item({ id: 'i2', nome: 'VIES', un: 'MT', falta: 10, resta: 10, pedidoId: 'PED-0002' })] })],
    pedidos: [ped({ itens: [pi(), pi({ itemId: 'i2', nome: 'VIES', un: 'MT', qtd: 10 })] })],
    ...o
  };
}
const aplicar = (b: Board, a: Acao) => aplicarOtimista(b, a, ctx);
const itemDe = (b: Board, id: string) => b.caixas[0].itens.find((i) => i.id === id)!;
const pedidoDe = (b: Board, id: string) => (b.pedidos ?? []).find((p) => p.id === id);

const prod = (): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A', inicioCostura: '2026-10-01',
  dataCombinada: '2026-10-18', leadTime: '2026-10-20', pecas: 100, cliente: 'CLIENTE TESTE', peca: 'PECA TESTE',
  referencia: 'REF', versao: 'v1', faltasCostura: [], mensagens: [],
  sugestoes: [{ id: 'SUG-1', mensagemId: 'MSG-1', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-22', resumo: 'Nova data', evidencia: 'dia 22', confianca: .9, status: 'PENDENTE', criadoEm: '', versao: 'v1' }],
  historico: []
});

describe('aplicarOtimista: producao e sugestoes', () => {
  it('altera oficina/data e decide sugestao sem criar mensagem', () => {
    let b = quadro({ producao: [prod()], oficinas: [{ ploomesId: 'of-2', nome: 'OFICINA B', grupoConfigurado: true, grupoNome: 'GRUPO B' }] });
    b = aplicar(b, { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-21', motivo: 'Combinado' });
    expect(b.producao?.[0]).toMatchObject({ oficinaId: 'of-2', oficina: 'OFICINA B', dataCombinada: '2026-10-21' });
    b = aplicar(b, { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Confirmado' });
    expect(b.producao?.[0]).toMatchObject({ dataCombinada: '2026-10-22' });
    expect(b.producao?.[0].sugestoes[0].status).toBe('ACEITA');
    expect(b.producao?.[0].mensagens).toEqual([]);
  });

  it('ignora sem alterar a data', () => {
    const b = aplicar(quadro({ producao: [prod()] }), { tipo: 'ignorar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1' });
    expect(b.producao?.[0].dataCombinada).toBe('2026-10-18');
    expect(b.producao?.[0].sugestoes[0].status).toBe('IGNORADA');
  });

  it('mostra imediatamente a mensagem enfileirada como pendente', () => {
    const b = aplicar(quadro({ producao: [prod()] }), {
      tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: '*OS 90001*\nQual a previsão?'
    });
    expect(b.producao?.[0].mensagens[0]).toMatchObject({ id: 'novo:whatsapp:7', direcao: 'ENVIADA', texto: '*OS 90001*\nQual a previsão?', statusEnvio: 'PENDENTE' });
  });

  it('associa mensagem pendente e a move para a conversa da OS', () => {
    const mensagem = { id: 'MSG-2', quando: '2026-10-08T10:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA' as const,
      texto: 'As duas ficam prontas amanhã.', associacao: 'SEM_ASSOCIACAO' as const, statusEnvio: '' as const, tipoConteudo: 'TEXTO' as const,
      oficinaId: 'of-1', oficina: 'OFICINA A', grupoNome: 'GRUPO A' };
    const b = aplicar(quadro({ producao: [prod()], mensagensWhatsappSemAssociacao: [mensagem] }),
      { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-2', versao: 'v1' });
    expect(b.mensagensWhatsappSemAssociacao).toEqual([]);
    expect(b.producao?.[0].mensagens[0]).toMatchObject({ id: 'MSG-2', associacao: 'MANUAL' });
  });

  it('mostra o reenvio como nova tentativa pendente e mantém a tentativa com erro', () => {
    const p = prod();
    p.mensagens = [{ id: 'MSG-ERRO', quando: '', participanteNome: 'PCP', direcao: 'ENVIADA', texto: '*OS 90001* teste', associacao: 'MANUAL', statusEnvio: 'ERRO', tipoConteudo: 'TEXTO' }];
    const b = aplicar(quadro({ producao: [p] }),
      { tipo: 'reenviar_whatsapp', dealId: '700001', mensagemId: 'MSG-ERRO', versao: 'v1', confirmou: true });
    expect(b.producao?.[0].mensagens).toHaveLength(2);
    expect(b.producao?.[0].mensagens[0]).toMatchObject({ statusEnvio: 'PENDENTE', texto: '*OS 90001* teste' });
    expect(b.producao?.[0].mensagens[1].statusEnvio).toBe('ERRO');
  });
});

describe('aplicarOtimista: campos da F2', () => {
  it('baixa soma na baixada e refaz o resta', () => {
    const b = aplicar(quadro(), { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 20, versao: 'v-i1' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 20, resta: 32 });
  });
  it('baixa do resto tira o item das faltas; restaG acompanha', () => {
    const b0 = quadro({ caixas: [caixa({ itens: [item({ un: 'cones', falta: 4, resta: 4, faltaG: 200, restaG: 200 })] })] });
    const b = aplicar(b0, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 1, versao: '' });
    expect(itemDe(b, 'i1')).toMatchObject({ resta: 3, restaG: 150 });
    const fim = aplicar(b, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 3, versao: '' });
    expect(itemDe(fim, 'i1').resta).toBe(0);
    expect(faltasSemPedido(fim)).toEqual([]);
  });
  it('previsão e observação do item, responsável, previsão e observação da caixa', () => {
    let b = aplicar(quadro(), { tipo: 'previsao_item', dealId: '600001', itemId: 'i1', valor: '2026-10-20', versao: '' });
    b = aplicar(b, { tipo: 'obs_item', dealId: '600001', itemId: 'i1', valor: '  linha 1\nlinha 2 ', versao: '' });
    b = aplicar(b, { tipo: 'responsavel', dealId: '600001', valor: 'Renata', versao: '' });
    b = aplicar(b, { tipo: 'previsao_caixa', dealId: '600001', valor: '2026-10-21', versao: '' });
    b = aplicar(b, { tipo: 'obs_caixa', dealId: '600001', valor: 'urgente', versao: '' });
    expect(itemDe(b, 'i1')).toMatchObject({ previsao: '2026-10-20', obsPcp: 'linha 1 linha 2' });
    expect(b.caixas[0]).toMatchObject({ responsavel: 'Renata', previsao: '2026-10-21', observacao: 'urgente' });
  });
  it('não altera o board de entrada nem as versões', () => {
    const b0 = quadro();
    const copia = structuredClone(b0);
    const b = aplicar(b0, { tipo: 'baixa', dealId: '600001', itemId: 'i1', valor: 5, versao: 'v-i1' });
    expect(b0).toEqual(copia);
    expect(itemDe(b, 'i1').versao).toBe('v-i1');
  });
  it('caixa ou item que não existe: board igual', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'obs_caixa', dealId: 'x', valor: 'a', versao: '' })).toBe(b0);
  });
});

describe('aplicarOtimista: pedidos', () => {
  it('mover_pedido troca a etapa', () => {
    const b = aplicar(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'a', finalizado: false, versao: 'v1' });
  });
  it('mover para a etapa da baixa dá a baixa e solta o item, mas o pedido continua aberto', () => {
    const b = aplicar(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent', confirmouBaixa: true });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'ent', finalizado: false, baixadoEm: '2026-10-08' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0, pedidoIds: [], pedidoId: '' });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0 });
  });
  it('etapa final: só com a baixa; grava concluidoEm e finaliza; com baixa não muda de outro jeito', () => {
    const b0 = quadro({ pedidos: [ped({ etapa: 'ent', baixadoEm: '2026-10-07' })] });
    const b = aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'fim' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'fim', finalizado: true, concluidoEm: '2026-10-08' });
    const sem = quadro();
    expect(aplicar(sem, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'fim' })).toBe(sem);
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' })).toBe(b0);
    expect(aplicar(b0, { tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: { quem: 'X' } })).toBe(b0);
  });
  it('entrar na etapa da baixa sem confirmouBaixa (site antigo): o servidor recusa, board igual', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent' })).toBe(b0);
    const b1 = quadro({ pedidos: [ped({ etapa: 'ent' })] });
    expect(aplicar(b1, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1' })).toBe(b1);
  });
  it('baixa do pedido não passa do que falta', () => {
    const b0 = quadro();
    b0.pedidos![0].itens[0].qtd = 80;
    const b = aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent', confirmouBaixa: true });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0 });
  });
  it('pedido finalizado ou sumido: board igual', () => {
    const b0 = quadro({ pedidos: [ped({ finalizado: true })] });
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' })).toBe(b0);
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-9', versao: 'v1', etapa: 'a' })).toBe(b0);
  });
  it('baixar_pedido só na etapa da baixa; dá a baixa sem finalizar', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1', confirmouBaixa: true })).toBe(b0);
    const b1 = quadro({ pedidos: [ped({ etapa: 'ent' })] });
    expect(pedidoDe(aplicar(b1, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1', confirmouBaixa: true }), 'PED-0002'))
      .toMatchObject({ baixadoEm: '2026-10-08', finalizado: false });
  });
  it('editar_pedido: campos, itens e a previsão herdada acompanha a do pedido', () => {
    const b0 = quadro({ pedidos: [ped({ previsao: '2026-10-10', itens: [pi({ previsao: '2026-10-10' }), pi({ itemId: 'i2', previsao: '2026-10-15' })] })] });
    const b = aplicar(b0, {
      tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: { previsao: '2026-10-12', quem: 'TECIDOS BETA' },
      itens: [{ itemId: 'i1', qtd: 40, fornecedor: 'GAMA' }]
    });
    const p = pedidoDe(b, 'PED-0002')!;
    expect(p).toMatchObject({ previsao: '2026-10-12', quem: 'TECIDOS BETA', previsaoMaisProxima: '2026-10-12', previsoesDiferentes: true });
    expect(p.itens[0]).toMatchObject({ qtd: 40, fornecedor: 'GAMA', previsao: '2026-10-12' });
    expect(p.itens[1].previsao).toBe('2026-10-15');
  });
  it('editar_pedido: previsão própria vazia volta a ser a do pedido', () => {
    const b0 = quadro({ pedidos: [ped({ previsao: '2026-10-10', itens: [pi({ previsao: '2026-10-15' })] })] });
    const b = aplicar(b0, { tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: {}, itens: [{ itemId: 'i1', qtd: 52, fornecedor: '', previsao: '' }] });
    expect(pedidoDe(b, 'PED-0002')!.itens[0].previsao).toBe('2026-10-10');
  });
  it('dividir_pedido: parte provisória na etapa da baixa, com a baixa, e o resto no original', () => {
    const b = aplicar(quadro(), { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [{ itemId: 'i1', qtd: 20 }, { itemId: 'i2', qtd: 10 }] });
    expect(pedidoDe(b, 'PED-0002')!.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 32]]);
    const parte = pedidoDe(b, 'PED-0002.1')!;
    expect(parte).toMatchObject({ pai: 'PED-0002', etapa: 'ent', provisorio: true, finalizado: false, baixadoEm: '2026-10-08', criadoEm: '2026-10-08' });
    expect(parte.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 20], ['i2', 10]]);
    // a parte já deu a baixa; o i2 foi todo e saiu do PED-0002
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 20, resta: 32, pedidoIds: ['PED-0002'] });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0, pedidoIds: [] });
  });
  it('dividir_pedido fora da etapa antes da baixa: board igual (o servidor recusa)', () => {
    const b0 = quadro({ pedidos: [ped({ etapa: 'a' })] });
    expect(aplicar(b0, { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [{ itemId: 'i1', qtd: 20 }] })).toBe(b0);
  });
  it('dividir_por_previsao: uma parte por data, a mais próxima fica', () => {
    const b0 = quadro({ pedidos: [ped({ itens: [pi({ previsao: '2026-10-10' }), pi({ itemId: 'i2', previsao: '2026-10-20' })] })] });
    const b = aplicar(b0, { tipo: 'dividir_por_previsao', pedidoId: 'PED-0002', versao: 'v1' });
    expect(pedidoDe(b, 'PED-0002')!.itens.map((i) => i.itemId)).toEqual(['i1']);
    expect(pedidoDe(b, 'PED-0002.1')).toMatchObject({ previsao: '2026-10-20', etapa: 'sol', provisorio: true, previsoesDiferentes: false });
    expect(itemDe(b, 'i2').pedidoIds).toEqual(['PED-0002.1']);
  });
  it('gerar_pedido: pedido provisório na primeira etapa e os itens saem das faltas', () => {
    const b0 = quadro({ pedidos: [], caixas: [caixa({ itens: [item(), item({ id: 'i2', nome: 'VIES', un: 'MT' })] })] });
    expect(faltasSemPedido(b0)[0].itens).toHaveLength(2);
    const b = aplicar(b0, {
      tipo: 'gerar_pedido', origem: 'CLIENTE', quem: 'ALFA', local: 'SAO_PAULO', previsao: '2026-10-20', responsavel: 'Maria',
      itens: [{ itemId: 'i1', dealId: '600001', qtd: 10, fornecedor: '', previsao: '' }, { itemId: 'i2', dealId: '600001', qtd: 5, fornecedor: 'X', previsao: '2026-10-25' }]
    });
    const novo = pedidoDe(b, 'novo:7')!;
    expect(novo).toMatchObject({ etapa: 'a', origem: 'CLIENTE', provisorio: true, previsaoMaisProxima: '2026-10-20', previsoesDiferentes: true });
    expect(novo.itens.map((i) => [i.nome, i.os, i.qtd, i.previsao])).toEqual([['ZIPER METAL', '90001', 10, '2026-10-20'], ['VIES', '90001', 5, '2026-10-25']]);
    expect(faltasSemPedido(b)).toEqual([]);
    expect(textoPedidoDoItem(itemDe(b, 'i1'), b.pedidos!, etapas)).toBe('Novo pedido · A pedir');
  });
  it('salvar_etapas: nomes, ordem e id provisório para a etapa nova', () => {
    const b = aplicar(quadro(), { tipo: 'salvar_etapas', etapas: [{ id: 'a', nome: 'Compras' }, { nome: 'Em trânsito ' }, { id: 'ent', nome: 'Enviado ao destino final' }] });
    expect(b.etapasPedido).toEqual([
      { id: 'a', nome: 'Compras', ordem: 1 }, { id: 'novo:7.1', nome: 'Em trânsito', ordem: 2 }, { id: 'ent', nome: 'Enviado ao destino final', ordem: 3 }
    ]);
  });
});

const pend = (id: number, acao: Acao, o: Partial<Pendente> = {}): Pendente => ({ id, acao, estado: 'fila', confirmadaEm: 0, ...o });
const obs = (valor: string, versao = 'v-i1'): Acao => ({ tipo: 'obs_item', dealId: '600001', itemId: 'i1', valor, versao });

describe('pendentesVivos', () => {
  it('as não confirmadas ficam sempre', () => {
    const ps = [pend(1, obs('a'), { estado: 'enviando' }), pend(2, obs('b'))];
    expect(pendentesVivos(ps, quadro(), 99)).toEqual(ps);
  });
  it('confirmada continua enquanto o board (mesmo pedido depois da confirmação, vindo do cache velho) não mostra a ação', () => {
    const p = pend(1, obs('a'), { estado: 'confirmada', confirmadaEm: 3, versaoNova: 'v2', versoesAntigas: ['v-i1'] });
    expect(pendentesVivos([p], quadro(), 2)).toEqual([p]);
    expect(pendentesVivos([p], quadro(), 3)).toEqual([p]);
    expect(pendentesVivos([p], quadro(), 9)).toEqual([p]);
  });
  it('confirmada sai quando o alvo tem a versão devolvida ou outra mais nova (nenhuma das de antes da ação)', () => {
    const p = pend(1, obs('a'), { estado: 'confirmada', confirmadaEm: 3, versaoNova: 'v2', versoesAntigas: ['v0', 'v-i1'] });
    const comV = (v: string) => { const q = quadro(); q.caixas[0].itens[0].versao = v; return q; };
    expect(pendentesVivos([p], comV('v2'), 0)).toEqual([]);
    expect(pendentesVivos([p], comV('v9'), 3)).toEqual([]);
    expect(pendentesVivos([p], comV('v0'), 3)).toEqual([p]);
    // alvo sumido do board: só o limite tira
    expect(pendentesVivos([p], quadro({ caixas: [] }), 3)).toEqual([p]);
  });
  it('sem versão: gerar_pedido e dividir saem quando o pedido devolvido aparece no board', () => {
    const gerar: Acao = { tipo: 'gerar_pedido', origem: 'FORNECEDOR', quem: 'X', local: 'BRAGANCA', previsao: '', responsavel: 'Gi',
      itens: [{ itemId: 'i1', dealId: '600001', qtd: 1, fornecedor: '', previsao: '' }] };
    const g = pend(1, gerar, { estado: 'confirmada', confirmadaEm: 1, versaoNova: 't', resposta: { pedidoId: 'PED-0009' } });
    expect(pendentesVivos([g], quadro(), 5)).toEqual([g]);
    expect(pendentesVivos([g], quadro({ pedidos: [ped({ id: 'PED-0009' })] }), 5)).toEqual([]);
    const d = pend(2, { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [{ itemId: 'i1', qtd: 1 }] },
      { estado: 'confirmada', confirmadaEm: 1, versaoNova: 'v5', versoesAntigas: ['v1'], resposta: { pedidoId: 'PED-0002.1' } });
    expect(pendentesVivos([d], quadro(), 5)).toEqual([d]);
    expect(pendentesVivos([d], quadro({ pedidos: [ped(), ped({ id: 'PED-0002.1' })] }), 5)).toEqual([]);
    const pp = pend(3, { tipo: 'dividir_por_previsao', pedidoId: 'PED-0002', versao: 'v1' },
      { estado: 'confirmada', confirmadaEm: 1, versaoNova: 'v5', versoesAntigas: ['v1'], resposta: { pedidoId: 'PED-0002.1', partes: ['PED-0002.1', 'PED-0002.2'] } });
    expect(pendentesVivos([pp], quadro({ pedidos: [ped(), ped({ id: 'PED-0002.1' })] }), 5)).toEqual([pp]);
    expect(pendentesVivos([pp], quadro({ pedidos: [ped(), ped({ id: 'PED-0002.1' }), ped({ id: 'PED-0002.2' })] }), 5)).toEqual([]);
  });
  it('sem versão: nova_demanda sai quando os itens devolvidos aparecem; salvar_etapas quando as etapas batem', () => {
    const nd = pend(1, { tipo: 'nova_demanda', os: '90001', caixa: 'COSTURA', itens: [{ nome: 'BOTÃO', cor: '', qtd: 2, un: 'UN' }] },
      { estado: 'confirmada', confirmadaEm: 1, versaoNova: 't', resposta: { itemIds: ['600001|POS_SAIDA|u1'] } });
    expect(pendentesVivos([nd], quadro(), 5)).toEqual([nd]);
    expect(pendentesVivos([nd], quadro({ caixas: [caixa({ itens: [item({ id: '600001|POS_SAIDA|u1' })] })] }), 5)).toEqual([]);
    const se = pend(2, { tipo: 'salvar_etapas', etapas: [{ id: 'a', nome: ' Compras' }, { nome: 'Nova' }, { id: 'ent', nome: 'Enviado' }, { id: 'fim', nome: 'Fim' }] },
      { estado: 'confirmada', confirmadaEm: 1, versaoNova: 't' });
    expect(pendentesVivos([se], quadro(), 5)).toEqual([se]);
    const novas: EtapaPedido[] = [{ id: 'a', nome: 'Compras', ordem: 1 }, { id: 'nova', nome: 'Nova', ordem: 2 }, { id: 'ent', nome: 'Enviado', ordem: 3 }, { id: 'fim', nome: 'Fim', ordem: 4 }];
    expect(pendentesVivos([se], quadro({ etapasPedido: novas }), 5)).toEqual([]);
  });
  it('limite: sai depois de 3 recargas sem a ação ou de 2 minutos da confirmação', () => {
    const base = { estado: 'confirmada' as const, confirmadaEm: 1, versaoNova: 'v2', versoesAntigas: ['v-i1'], confirmadaAs: 1_000 };
    const p = pend(1, obs('a'), { ...base, recargasDepois: 2 });
    expect(pendentesVivos([p], quadro(), 5, 2_000)).toEqual([p]);
    expect(pendentesVivos([pend(1, obs('a'), { ...base, recargasDepois: 3 })], quadro(), 5, 2_000)).toEqual([]);
    expect(pendentesVivos([p], quadro(), 5, 1_000 + 120_000)).toEqual([]);
  });
  it('confirmada sai quando o alvo já tem a versão nova; as anteriores do mesmo alvo também', () => {
    const a = pend(1, obs('a'), { estado: 'confirmada', confirmadaEm: 5, versaoNova: 'v2', versoesAntigas: ['v1'] });
    const b = pend(2, obs('b', 'v1'), { estado: 'confirmada', confirmadaEm: 6, versaoNova: 'v3', versoesAntigas: ['v1', 'v2'] });
    const c = pend(3, obs('c', 'v3'), { estado: 'enviando' });
    const outro = pend(4, { tipo: 'obs_caixa', dealId: '600001', valor: 'x', versao: 'c1' }, { estado: 'confirmada', confirmadaEm: 4, versaoNova: 'c2', versoesAntigas: ['c1'] });
    const comV = (v: string) => { const q = quadro(); q.caixas[0].itens[0].versao = v; return q; };
    expect(pendentesVivos([outro, a, b, c], comV('v2'), 0)).toEqual([outro, b, c]);
    expect(pendentesVivos([outro, a, b, c], comV('v3'), 0)).toEqual([outro, c]);
  });
  it('versaoNoBoard acha item, pedido e caixa', () => {
    expect(versaoNoBoard(quadro(), obs('a'))).toBe('v-i1');
    expect(versaoNoBoard(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: '', etapa: 'a' })).toBe('v1');
    expect(versaoNoBoard(quadro(), { tipo: 'obs_caixa', dealId: '600001', valor: '', versao: '' })).toBe('c1');
    expect(versaoNoBoard(quadro(), { tipo: 'salvar_etapas', etapas: [] })).toBeUndefined();
  });
});

describe('aplicarPendentes', () => {
  it('aplica na ordem da fila: a última observação vence', () => {
    const b = aplicarPendentes(quadro(), [pend(1, obs('a')), pend(2, obs('b'))], '2026-10-08');
    expect(itemDe(b, 'i1').obsPcp).toBe('b');
  });
  it('dois pedidos gerados na fila têm ids provisórios diferentes', () => {
    const gerar = (itemId: string): Acao => ({
      tipo: 'gerar_pedido', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
      itens: [{ itemId, dealId: '600001', qtd: 1, fornecedor: '', previsao: '' }]
    });
    const b0 = quadro({ pedidos: [], caixas: [caixa({ itens: [item(), item({ id: 'i2' })] })] });
    const b = aplicarPendentes(b0, [pend(1, gerar('i1')), pend(2, gerar('i2'))], '2026-10-08');
    expect(b.pedidos!.map((p) => p.id)).toEqual(['novo:1', 'novo:2']);
  });
});
