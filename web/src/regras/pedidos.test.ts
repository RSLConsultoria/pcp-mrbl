import { describe, expect, it } from 'vitest';
import type { Acao, Board, DadosPedido, EtapaPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import {
  clientesDasCaixas, erroDadosPedido, erroEdicaoPedido, faltasSemPedido, filtrarPedidos, nomeLocal, opcoesComAtual, quemAoTrocarOrigem, quemDoPedido, resumoAlteracoes, ultimaEtapa, validarEtapas,
  validarGerarPedido, type EstadoEditavel
} from './pedidos';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'b', nome: 'Solicitado', ordem: 2 },
  { id: 'c', nome: 'Entregue', ordem: 3 }
];
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0001', pai: '', etapa: 'a', origem: 'FORNECEDOR', quem: 'ALFA', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: '', finalizado: false, itens: [], ...o
});
const itemPed = (fornecedor: string) => ({ itemId: 'x', dealId: '1', os: '1', nome: 'N', un: 'UN', qtd: 1, fornecedor });

describe('filtrarPedidos', () => {
  const lista = [ped({ id: '1' }), ped({ id: '2', finalizado: true })];
  it('aberto, finalizado, todos', () => {
    expect(filtrarPedidos(lista, 'aberto').map((p) => p.id)).toEqual(['1']);
    expect(filtrarPedidos(lista, 'finalizado').map((p) => p.id)).toEqual(['2']);
    expect(filtrarPedidos(lista, 'todos')).toHaveLength(2);
  });
});

describe('faltasSemPedido', () => {
  it('agrupa itens abertos, editáveis, sem pedido e com resta conhecida por caixa; respeita dealsEditaveis', () => {
    const c1 = caixa({ dealId: '1', itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' }), item({ id: 'c', status: 'RESOLVIDO', resta: 0 }), item({ id: 'd', editavel: false }), item({ id: 'g', resta: null })] });
    const c2 = caixa({ dealId: '2', itens: [item({ id: 'e' })] });
    const c3 = caixa({ dealId: '3', itens: [item({ id: 'f', pedidoId: 'PED-0001' })] });
    const board: Board = { geradoEm: '', avisos: [], usuarios: [], caixas: [c1, c2, c3], dealsEditaveis: ['1', '3'] };
    const r = faltasSemPedido(board);
    expect(r).toHaveLength(1);
    expect(r[0].caixa.dealId).toBe('1');
    expect(r[0].itens.map((i) => i.id)).toEqual(['a']);
  });
});

describe('ultimaEtapa / quemDoPedido', () => {
  it('última pela ordem', () => expect(ultimaEtapa(etapas)?.id).toBe('c'));
  it('quem preenchido vence', () => expect(quemDoPedido(ped({ itens: [itemPed('X'), itemPed('Y')] }))).toBe('ALFA'));
  it('vazio com fornecedores diferentes', () => {
    expect(quemDoPedido(ped({ quem: '', itens: [itemPed('X'), itemPed('Y')] }))).toBe('Vários fornecedores');
  });
  it('vazio com um só fornecedor', () => {
    expect(quemDoPedido(ped({ quem: '', itens: [itemPed('X'), itemPed('X')] }))).toBe('X');
  });
});

describe('resumoAlteracoes', () => {
  const base: EstadoEditavel = {
    etapa: 'a', origem: 'FORNECEDOR', quem: 'ALFA', local: 'BRAGANCA', previsao: '2026-10-09', responsavel: 'Renata',
    itens: [{ itemId: 'i1', nome: 'ZÍPER', un: 'UN', qtd: 10, fornecedor: '', previsao: '' }]
  };
  it('sem mudança: vazio', () => expect(resumoAlteracoes(base, structuredClone(base), etapas)).toEqual([]));
  it('linhas no formato do servidor', () => {
    const depois: EstadoEditavel = {
      ...base, etapa: 'b', previsao: '2026-10-12', responsavel: '',
      itens: [{ itemId: 'i1', nome: 'ZÍPER', un: 'UN', qtd: 8, fornecedor: 'FITAS', previsao: '' }]
    };
    expect(resumoAlteracoes(base, depois, etapas)).toEqual([
      'Etapa: A pedir → Solicitado',
      'Previsão: 09/10 → 12/10',
      'Responsável: Renata → —',
      'qtd de ZÍPER: 10 → 8',
      'fornecedor de ZÍPER: — → FITAS'
    ]);
  });
});

describe('validarEtapas', () => {
  const pedidos = [ped({ etapa: 'b' }), ped({ id: 'PED-0002', etapa: 'c', finalizado: true })];
  it('mínimo de 2', () => expect(validarEtapas([{ nome: 'A' }], [])).toBe('O quadro precisa de pelo menos 2 etapas.'));
  it('nome vazio', () => expect(validarEtapas([{ nome: 'A' }, { nome: ' ' }], [])).toBe('Dê um nome a todas as etapas.'));
  it('nomes repetidos sem acento e caixa', () => {
    expect(validarEtapas([{ nome: 'Em trânsito' }, { nome: 'EM TRANSITO' }], [])).toBe('Já existe uma etapa chamada EM TRANSITO.');
  });
  it('não remove etapa com pedido aberto', () => {
    const novas = [{ id: 'a', nome: 'A pedir' }, { id: 'c', nome: 'Entregue' }];
    expect(validarEtapas(novas, pedidos, etapas)).toBe('A etapa Solicitado tem pedidos abertos.');
  });
  it('remove etapa sem pedido aberto (finalizados não contam)', () => {
    const novas = [{ id: 'a', nome: 'A pedir' }, { id: 'c', nome: 'Entregue' }];
    expect(validarEtapas(novas, [ped({ etapa: 'b', finalizado: true })], etapas)).toBeNull();
  });
  it('a última etapa continua por último (pode ser renomeada)', () => {
    const msg = 'A última etapa (Entregue) precisa continuar por último.';
    expect(validarEtapas([{ id: 'a', nome: 'A pedir' }, { id: 'b', nome: 'Solicitado' }], [], etapas)).toBe(msg);
    expect(validarEtapas([{ id: 'a', nome: 'A pedir' }, { id: 'c', nome: 'Entregue' }, { nome: 'Depois' }], [], etapas)).toBe(msg);
    expect(validarEtapas([{ id: 'a', nome: 'A pedir' }, { nome: 'Nova' }, { id: 'c', nome: 'Resolvido' }], [], etapas)).toBeNull();
  });
});

describe('validarGerarPedido', () => {
  const sel = [{ itemId: 'a', un: 'MT', resta: 20 }, { itemId: 'b', un: 'UN', resta: null }];
  it('mensagens como a baixa', () => {
    expect(validarGerarPedido(sel, { a: '0', b: '1' })).toEqual({
      a: 'Informe uma quantidade maior que zero', b: 'Item sem quantidade faltante registrada.'
    });
    expect(validarGerarPedido(sel, { a: '25,5', b: '' }).a).toBe('Falta só 20 MT');
    expect(validarGerarPedido([sel[0]], { a: '20' })).toEqual({});
  });
});

describe('mensagemSucesso dos pedidos', () => {
  const dados: DadosPedido = { origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '' };
  it('textos', () => {
    const gerar: Acao = { tipo: 'gerar_pedido', ...dados, itens: [
      { itemId: 'a', dealId: '1', qtd: 1, fornecedor: '', previsao: '' }, { itemId: 'b', dealId: '1', qtd: 1, fornecedor: '', previsao: '' }, { itemId: 'c', dealId: '2', qtd: 1, fornecedor: '', previsao: '' }
    ] };
    expect(mensagemSucesso(gerar, undefined, { pedidoId: 'PED-0044' })).toBe('PED-0044 gerado · 3 itens · registrado em 2 OS no Ploomes');
    expect(mensagemSucesso({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: '', etapa: 'b' }, undefined, { etapa: 'Solicitado' })).toBe('PED-0044 movido para Solicitado');
    expect(mensagemSucesso({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: '' })).toBe('Baixa do PED-0044 registrada');
    expect(mensagemSucesso({ tipo: 'enviar_oficina', dealId: '1', versao: '' })).toBe('Caixa enviada à oficina');
    expect(mensagemSucesso({ tipo: 'oficina_recebeu', dealId: '1', versao: '' })).toBe('Recebimento da oficina registrado');
    expect(mensagemSucesso({ tipo: 'salvar_etapas', etapas: [] })).toBe('Etapas do quadro salvas');
  });
});

describe('fornecedor, cliente, responsável e local do pedido', () => {
  it('fornecedor (ou cliente) e responsável obrigatórios', () => {
    expect(erroDadosPedido({ origem: 'FORNECEDOR', quem: '', responsavel: 'Gi' })).toBe('Escolha o fornecedor.');
    expect(erroDadosPedido({ origem: 'CLIENTE', quem: ' ', responsavel: 'Gi' })).toBe('Escolha o cliente.');
    expect(erroDadosPedido({ origem: 'FORNECEDOR', quem: 'BETA', responsavel: '' })).toBe('Escolha o responsável.');
    expect(erroDadosPedido({ origem: 'FORNECEDOR', quem: '', responsavel: '' })).toBe('Escolha o fornecedor e o responsável.');
    expect(erroDadosPedido({ origem: 'CLIENTE', quem: 'ALFA', responsavel: 'Gi' })).toBeNull();
  });
  it('editar: não deixa limpar, mas pedido antigo sem fornecedor/responsável pode seguir assim', () => {
    const a = { origem: 'FORNECEDOR' as const, quem: 'BETA', responsavel: 'Gi' };
    expect(erroEdicaoPedido(a, { ...a, quem: '' })).toBe('Escolha o fornecedor.');
    expect(erroEdicaoPedido(a, { ...a, origem: 'CLIENTE', quem: '' })).toBe('Escolha o cliente.');
    expect(erroEdicaoPedido(a, { ...a, responsavel: '' })).toBe('Escolha o responsável.');
    expect(erroEdicaoPedido(a, a)).toBeNull();
    const antigo = { origem: 'FORNECEDOR' as const, quem: '', responsavel: '' };
    expect(erroEdicaoPedido(antigo, antigo)).toBeNull();
  });
  it('valor que não está mais na lista continua como opção', () => {
    expect(opcoesComAtual(['A', 'B'], 'X')).toEqual(['X', 'A', 'B']);
    expect(opcoesComAtual(['A', 'B'], 'B')).toEqual(['A', 'B']);
    expect(opcoesComAtual(['A', 'B'], '')).toEqual(['A', 'B']);
  });
  it('clientes das OSs: sem repetir, sem vazio, em ordem', () => {
    const cx = [caixa({ dealId: '1', cliente: 'GAMA' }), caixa({ dealId: '2', cliente: 'ALFA' }), caixa({ dealId: '3', cliente: 'GAMA' }), caixa({ dealId: '4', cliente: '' })];
    expect(clientesDasCaixas(cx, ['1', '2', '3', '4'])).toEqual(['ALFA', 'GAMA']);
    expect(clientesDasCaixas(cx, ['3'])).toEqual(['GAMA']);
  });
  it('trocar Solicitar a: mantém o nome se ele está na lista nova; com uma opção só, já escolhe', () => {
    expect(quemAoTrocarOrigem('BETA', ['ALFA', 'BETA'])).toBe('BETA');
    expect(quemAoTrocarOrigem('BETA', ['ALFA', 'GAMA'])).toBe('');
    expect(quemAoTrocarOrigem('BETA', ['ALFA'])).toBe('ALFA');
  });
  it('locais novos: Oficina e Cliente', () => {
    expect(nomeLocal('OFICINA')).toBe('Oficina');
    expect(nomeLocal('CLIENTE')).toBe('Cliente');
  });
});
