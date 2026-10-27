import { describe, expect, it } from 'vitest';
import type { Board, CardPeca, Pedido, Producao } from '../api/tipos';
import { cardPrincipal, dealDaAnotacao, erroAnotacao, fonteDaAcao, linhaDoTempo, podeAnotar, resumoSituacao, urlHub } from './peca';
import { caixa, item } from './teste-util';

const card = (o: Partial<CardPeca>): CardPeca => ({
  dealId: '1', funilId: 60015827, funil: 'Produção', etapaId: 1, etapa: '17. Costura', etapaOrdem: 6, titulo: '', cliente: '',
  peca: 'CAMISA TESTE', referencia: 'REF-01', os: '90001', atualizadoEm: '2026-10-20T10:00:00.000Z', link: '', ...o
});
const prod = (o: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 10,
  cliente: '', peca: '', referencia: '', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...o
});
const ped = (o: Partial<Pedido>): Pedido => ({
  id: 'PED-0001', pai: '', etapa: 'sol', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '', criadoEm: '',
  baixadoEm: '', versao: 'v1', finalizado: false,
  itens: [{ itemId: 'i1', dealId: '600001', os: '90001', nome: 'ZIPER', un: 'UN', qtd: 1, fornecedor: '' }], ...o
});
const quadro = (o: Partial<Board> = {}): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas: [], ...o });

describe('fonteDaAcao', () => {
  it('separa almoxarifado, compras, produção, WhatsApp e anotação', () => {
    expect(fonteDaAcao('baixa', 'PRODUCAO')).toBe('ALMOXARIFADO');
    expect(fonteDaAcao('obs_caixa', 'PRODUCAO')).toBe('ALMOXARIFADO');
    expect(fonteDaAcao('gerar_pedido', 'ALMOXARIFADO')).toBe('COMPRAS');
    expect(fonteDaAcao('nova_demanda', 'ALMOXARIFADO')).toBe('COMPRAS');
    expect(fonteDaAcao('PRODUCAO_ALTERAR_COMBINADO', 'ALMOXARIFADO')).toBe('PRODUCAO');
    expect(fonteDaAcao('WHATSAPP_SUGESTAO_ACEITA', 'ALMOXARIFADO')).toBe('PRODUCAO');
    expect(fonteDaAcao('WHATSAPP_ASSOCIAR', 'ALMOXARIFADO')).toBe('WHATSAPP');
    expect(fonteDaAcao('WHATSAPP_ENFILEIRAR', 'PRODUCAO')).toBeNull();
    expect(fonteDaAcao('WHATSAPP_REENFILEIRAR', 'PRODUCAO')).toBeNull();
    expect(fonteDaAcao('ANOTACAO', 'ALMOXARIFADO')).toBe('ANOTACAO');
    expect(fonteDaAcao(undefined, 'ALMOXARIFADO')).toBe('ALMOXARIFADO');
  });
});

describe('linhaDoTempo', () => {
  const board = quadro({
    caixas: [
      caixa({ dealId: '600001', os: '90001', historico: [
        { id: 'H1', acao: 'baixa', quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' },
        { id: 'H2', acao: 'gerar_pedido', quando: '2026-10-21T12:00:00.000Z', usuario: 'Ana', texto: 'Ana gerou PED-0001', ploomes: 'PENDENTE' },
        { id: 'H9', acao: 'ANOTACAO', quando: '2026-10-22T12:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "x"', ploomes: 'ENVIADO' }
      ] }),
      caixa({ dealId: '600009', os: '90009', historico: [{ id: 'X', acao: 'baixa', quando: '2026-10-23T00:00:00.000Z', usuario: 'Ana', texto: 'outra OS', ploomes: 'ENVIADO' }] })
    ],
    producao: [prod({
      historico: [
        { id: 'P1', acao: 'PRODUCAO_ALTERAR_COMBINADO', quando: '2026-10-19T12:00:00.000Z', usuario: 'Ana', texto: 'Ana alterou o combinado', ploomes: 'ENVIADO' },
        { id: 'P2', acao: 'WHATSAPP_ENFILEIRAR', quando: '2026-10-19T13:00:00.000Z', usuario: 'Ana', texto: 'Ana colocou mensagem na fila', ploomes: 'ENVIADO' },
        { id: 'P3', acao: 'WHATSAPP_SUGESTAO_ACEITA', quando: '2026-10-19T14:00:00.000Z', usuario: 'Ana', texto: 'Ana aceitou a sugestão', ploomes: 'ENVIADO' }
      ],
      mensagens: [{ id: 'M1', quando: '2026-10-19T13:00:00.000Z', participanteNome: '', direcao: 'ENVIADA', texto: 'Olá', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' }]
    })],
    anotacoes: [
      { id: 'H9', quando: '2026-10-22T12:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "x"', ploomes: 'ENVIADO', dealId: '600001', os: '90001' },
      { id: 'H10', quando: '2026-10-23T12:00:00.000Z', usuario: 'Bia', texto: 'outra OS', ploomes: 'ENVIADO', dealId: '600009', os: '90009' }
    ]
  });
  const ploomes = { eventos: [
    { quando: '2026-10-21T12:00:00.000Z', fonte: 'PLOOMES' as const, texto: 'Registro do comercial', autor: 'Pessoa Comercial', dealId: '1' },
    { quando: '2026-10-21T12:00:00.000Z', fonte: 'ETAPA' as const, texto: 'Produção: 16 → 17', autor: '', dealId: '1', desfeita: true }
  ] };

  it('junta todas as fontes da OS, do mais novo para o mais antigo; empate: Etapa, Ploomes, app', () => {
    const ev = linhaDoTempo(board, ploomes, '90001');
    expect(ev.map((e) => [e.fonte, e.texto])).toEqual([
      ['ANOTACAO', 'Bia anotou: "x"'],
      ['ETAPA', 'Produção: 16 → 17'],
      ['PLOOMES', 'Registro do comercial'],
      ['COMPRAS', 'Ana gerou PED-0001'],
      ['ALMOXARIFADO', 'Ana deu baixa'],
      ['PRODUCAO', 'Ana aceitou a sugestão'],
      ['WHATSAPP', 'Olá'],
      ['PRODUCAO', 'Ana alterou o combinado']
    ]);
    expect(ev[0]).toMatchObject({ autor: 'Bia', enviadoPloomes: true });
    expect(ev[1].desfeita).toBe(true);
    expect(ev[3].enviadoPloomes).toBe(false);
    expect(ev[6]).toMatchObject({ autor: 'PCP', enviadoPloomes: false });
    expect(new Set(ev.map((e) => e.chave)).size).toBe(ev.length);
  });

  it('sem Ploomes e com API antiga (sem id e acao): fonte pela origem e sem repetir', () => {
    const antigo = quadro({
      caixas: [caixa({ os: '90001', historico: [
        { quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' },
        { quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' }
      ] })],
      producao: [prod({ historico: [{ quando: '2026-10-19T12:00:00.000Z', usuario: 'Ana', texto: 'combinado', ploomes: 'PENDENTE' }] })]
    });
    expect(linhaDoTempo(antigo, null, '90001').map((e) => e.fonte)).toEqual(['ALMOXARIFADO', 'PRODUCAO']);
    expect(linhaDoTempo(quadro(), null, '90001')).toEqual([]);
  });
});

describe('resumoSituacao', () => {
  it('caixas e itens em aberto, pedidos abertos com a etapa e a última mensagem', () => {
    const board = quadro({
      etapasPedido: [{ id: 'sol', nome: 'Solicitado', ordem: 2 }],
      caixas: [
        caixa({ os: '90001', itens: [item(), item({ id: 'i2', status: 'RESOLVIDO', resta: 0, baixada: 52 })] }),
        caixa({ dealId: '600002', os: '90001', tipo: 'ACABAMENTO', itens: [item({ id: 'i3', status: 'RESOLVIDO', resta: 0, baixada: 52 })] })
      ],
      pedidos: [ped({}), ped({ id: 'PED-0002', finalizado: true }), ped({ id: 'PED-0003', itens: [] })],
      producao: [prod({ mensagens: [
        { id: 'M1', quando: '2026-10-19T13:00:00.000Z', participanteNome: '', direcao: 'ENVIADA', texto: 'Olá', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' },
        { id: 'M2', quando: '2026-10-20T13:00:00.000Z', participanteNome: 'Oficina', direcao: 'RECEBIDA', texto: '', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'NAO_TEXTUAL' }
      ] })]
    });
    expect(resumoSituacao(board, '90001')).toEqual({
      caixas: 2, caixasComFalta: 1, itensAbertos: 1,
      pedidosAbertos: [{ id: 'PED-0001', etapa: 'Solicitado' }],
      ultimaMensagem: { quando: '2026-10-20T13:00:00.000Z', texto: 'Conteúdo não textual', direcao: 'RECEBIDA' },
      temDados: true
    });
    expect(resumoSituacao(board, '99999')).toEqual({ caixas: 0, caixasComFalta: 0, itensAbertos: 0, pedidosAbertos: [], ultimaMensagem: null, temDados: false });
  });
});

describe('cardPrincipal, dealDaAnotacao e podeAnotar', () => {
  it('card principal: Produção, senão PCP, senão o mais recente', () => {
    const pcp = card({ dealId: 'P', funilId: 60011710, atualizadoEm: '2026-10-25T00:00:00.000Z' });
    const producao = card({ dealId: 'R', atualizadoEm: '2026-10-01T00:00:00.000Z' });
    const outroVelho = card({ dealId: 'A', funilId: 1, atualizadoEm: '2026-10-01T00:00:00.000Z' });
    const outroNovo = card({ dealId: 'B', funilId: 1, atualizadoEm: '2026-10-02T00:00:00.000Z' });
    expect(cardPrincipal([pcp, producao])?.dealId).toBe('R');
    expect(cardPrincipal([outroNovo, pcp])?.dealId).toBe('P');
    expect(cardPrincipal([outroVelho, outroNovo])?.dealId).toBe('B');
    expect(cardPrincipal([])).toBeNull();
  });

  it('deal da anotação: card de Produção, senão o primeiro; sem Ploomes, o do board', () => {
    const board = quadro({ caixas: [caixa({ dealId: '600001', os: '90001' })], producao: [prod()] });
    expect(dealDaAnotacao([card({ dealId: 'P', funilId: 60011710 }), card({ dealId: 'R' })], board, '90001')).toBe('R');
    expect(dealDaAnotacao([card({ dealId: 'P', funilId: 60011710 }), card({ dealId: 'Q', funilId: 1 })], board, '90001')).toBe('P');
    expect(dealDaAnotacao([], board, '90001')).toBe('700001');
    expect(dealDaAnotacao([], quadro({ caixas: [caixa({ dealId: '600001', os: '90001' })] }), '90001')).toBe('600001');
    expect(dealDaAnotacao([], quadro(), '90001')).toBe('');
  });

  it('anotar só nos deals liberados (lista vazia = todos)', () => {
    expect(podeAnotar(quadro(), '1')).toBe(true);
    expect(podeAnotar(quadro(), '')).toBe(false);
    const restrito = quadro({ dealsEditaveis: ['607479158'], dealsProducaoEditaveis: ['607612577'] });
    expect(podeAnotar(restrito, '607612577')).toBe(true);
    expect(podeAnotar(restrito, '607479158')).toBe(true);
    expect(podeAnotar(restrito, '600000001')).toBe(false);
    expect(podeAnotar(quadro({ dealsEditaveis: [], dealsProducaoEditaveis: ['607612577'] }), '600000001')).toBe(true);
  });
});

describe('erroAnotacao e urlHub', () => {
  it('valida a anotação como o servidor', () => {
    expect(erroAnotacao('  ')).toBe('Escreva a anotação.');
    expect(erroAnotacao('a\n\nb')).toBe('A anotação não pode ter linha em branco.');
    expect(erroAnotacao('a'.repeat(501))).toBe('Anotação com no máximo 500 caracteres.');
    expect(erroAnotacao('a\nb')).toBe('');
  });
  it('link do HUB de Peças pela referência', () => {
    expect(urlHub(' REF 01/A ')).toBe('https://rslconsultoria.github.io/hub-pecas-catalogo/#REF%2001%2FA');
  });
});
