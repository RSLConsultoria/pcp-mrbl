const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

function prod(extra) {
  return Object.assign({
    dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A',
    inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
    pecas: 120, valorCorte: 12345.67, cliente: 'CLIENTE FICTÍCIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1'
  }, extra);
}

test('linhaProducao normaliza o snapshot e usa ALOCAR sem oficina', () => {
  assert.deepEqual(limpo(ctx.linhaProducao(prod({ oficinaId: '', oficina: '', pecas: '120,5' }), '2026-10-13T12:00:00.000Z')), {
    deal_id: '700001', os: '90001', oficina_id: '', oficina_nome: 'ALOCAR',
    inicio_costura: '2026-10-01', data_combinada: '2026-10-20', lead_time: '2026-10-18',
    pecas: 120.5, cliente: 'CLIENTE FICTÍCIO', peca: 'CAMISA TESTE', referencia: 'REF-001',
    em_costura: 'SIM', atualizado_em_ploomes: 'v1', sincronizado_em: '2026-10-13T12:00:00.000Z',
    valor_corte: 12345.67,
    etapa_ordem: 17, etapa_nome: '17. Costura', etapa_inicio: '', prevista: 'NAO',
    inicio_costura_previsto: '', fim_costura_previsto: ''
  });
  assert.equal(ctx.linhaProducao(prod({ valorCorte: null }), '2026-10-13T12:00:00.000Z').valor_corte, '');
  // As colunas novas ficam no fim do contrato da aba PRODUCAO, nesta ordem.
  assert.deepEqual(Object.keys(ctx.linhaProducao(prod(), '2026-10-13T12:00:00.000Z')).slice(-7),
    ['valor_corte', 'etapa_ordem', 'etapa_nome', 'etapa_inicio', 'prevista', 'inicio_costura_previsto', 'fim_costura_previsto']);
});

test('normalizarDealProducao lê os valores tipados de OtherProperties', () => {
  const deal = {
    Id: 700001,
    Title: 'OS 90001 - CAMISA TESTE',
    ContactName: 'CLIENTE FICTÍCIO',
    LastUpdateDate: '2026-10-14T15:20:00Z',
    OtherProperties: [
      { FieldKey: 'deal_C06992BA-FF1E-47A8-9330-5242026E691E', StringValue: '90001' },
      { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', IntegerValue: 44, UserValueId: 44, UserValueName: 'OFICINA FICTÍCIA' },
      { FieldKey: 'deal_92FBE0E7-E136-41BF-AE47-1E427B178727', DateTimeValue: '2026-10-01T03:00:00Z' },
      { FieldKey: 'deal_E53BDEC3-F829-413D-9421-91D5D7411349', DateTimeValue: '2026-10-20T03:00:00Z' },
      { FieldKey: 'deal_1B168E7F-E71D-4895-8A37-D7DB6FD3418D', DateTimeValue: '2026-10-18T03:00:00Z' },
      { FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', DecimalValue: 120 },
      { FieldKey: 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7', StringValue: 'CAMISA TESTE' },
      { FieldKey: 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D', StringValue: 'REF-001' },
      { FieldKey: 'deal_A974EF64-47C5-4E6A-B7BD-30B7B15A437C', DecimalValue: 12345.67 }
    ]
  };
  assert.deepEqual(limpo(ctx.normalizarDealProducao(deal)), {
    dealId: '700001', os: '90001', oficinaId: '44', oficina: 'OFICINA FICTÍCIA',
    inicioCostura: '2026-10-01T03:00:00Z', dataCombinada: '2026-10-20T03:00:00Z',
    leadTime: '2026-10-18T03:00:00Z', pecas: 120, cliente: 'CLIENTE FICTÍCIO',
    peca: 'CAMISA TESTE', referencia: 'REF-001', versao: '2026-10-14T15:20:00Z', valorCorte: 12345.67
  });
});

test('normalizarDealProducao tolera oficina e campos ausentes sem inventar dados', () => {
  const deal = {
    Id: '700002', Title: 'PEÇA SEM CADASTRO', OtherProperties: [
      { FieldKey: 'deal_C06992BA-FF1E-47A8-9330-5242026E691E', IntegerValue: 90002 },
      { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', ObjectValueId: 'of-2', ObjectValueName: 'OFICINA B' }
    ]
  };
  const r = limpo(ctx.normalizarDealProducao(deal));
  assert.equal(r.dealId, '700002');
  assert.equal(r.os, '90002');
  assert.equal(r.oficinaId, 'of-2');
  assert.equal(r.oficina, 'OFICINA B');
  assert.equal(r.pecas, '');
  assert.equal(r.valorCorte, null);
  assert.equal(r.peca, 'PEÇA SEM CADASTRO');
});

// "Será produzido por" é campo de usuário no Ploomes (conferido na foto de 16/10).
test('normalizarDealProducao lê a oficina do campo de usuário, inclusive o usuário ALOCAR', () => {
  const deal = (id, nome) => ({ Id: '700009', Title: 'PEÇA', OtherProperties: [
    { FieldKey: 'deal_C06992BA-FF1E-47A8-9330-5242026E691E', StringValue: '90009' },
    { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', IntegerValue: id, UserValueId: id, UserValueName: nome }
  ] });
  const r = limpo(ctx.normalizarDealProducao(deal(51, 'OFICINA USUARIO')));
  assert.equal(r.oficinaId, '51');
  assert.equal(r.oficina, 'OFICINA USUARIO');
  const alocar = limpo(ctx.normalizarDealProducao(deal(52, 'ALOCAR')));
  assert.equal(alocar.oficinaId, '52');
  assert.equal(alocar.oficina, 'ALOCAR');
});

test('paginação do Ploomes avança página cheia e para na página vazia', () => {
  const cheia = ctx.avaliarPaginaProducao({ statusCode: 200, body: { value: [prod({ dealId: '1' }), prod({ dealId: '2' })] } }, 3, 2);
  assert.equal(cheia.ok, true);
  assert.equal(cheia.proximaPagina, 4);
  assert.deepEqual(limpo(cheia.itens).map((x) => x.dealId), ['1', '2']);
  assert.deepEqual(limpo(ctx.avaliarPaginaProducao({ statusCode: 200, body: { value: [] } }, 4, 2)), {
    ok: true, itens: [], proximaPagina: null
  });
});

test('paginação do Ploomes respeita rate limit sem produzir itens', () => {
  assert.deepEqual(limpo(ctx.avaliarPaginaProducao({ statusCode: 429, headers: { 'retry-after': '12' } }, 1, 100)), {
    ok: false, repetir: true, esperaSegundos: 12, erro: 'Ploomes limitou a consulta. Tentar novamente.'
  });
  assert.equal(ctx.avaliarPaginaProducao({ statusCode: 500 }, 1, 100).repetir, true);
  assert.equal(ctx.avaliarPaginaProducao({ statusCode: 400 }, 1, 100).repetir, false);
});

test('paginação rejeita resposta 200 sem a lista de negócios para não encerrar a produção', () => {
  const r = limpo(ctx.avaliarPaginaProducao({ statusCode: 200, body: { mensagem: 'formato inesperado' } }, 1, 100));
  assert.deepEqual(r, {
    ok: false,
    repetir: false,
    esperaSegundos: 0,
    erro: 'Resposta inválida do Ploomes: lista de negócios ausente.'
  });
});

test('sincronização faz upsert, encerra ausentes e preserva campos humanos das oficinas', () => {
  const cards = [prod({ dealId: '700001', oficinaId: 'of-1', oficina: 'OFICINA RENOMEADA' }), prod({ dealId: '700003', os: '90003', oficinaId: 'of-3', oficina: 'OFICINA NOVA' })];
  const atuais = [
    { deal_id: '700001', em_costura: 'SIM' },
    { deal_id: '700002', em_costura: 'SIM' },
    { deal_id: '700004', em_costura: 'NAO' }
  ];
  const oficinas = [{ ploomes_id: 'of-1', nome: 'OFICINA ANTIGA', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO FICTÍCIO', ativo: 'NAO' }];
  const r = limpo(ctx.montarSincronizacaoProducao(cards, atuais, oficinas, '2026-10-14T12:00:00.000Z'));
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'PRODUCAO').map((o) => [o.operacao, o.linha.deal_id, o.linha.em_costura]), [
    ['appendOrUpdate', '700001', 'SIM'], ['appendOrUpdate', '700003', 'SIM'], ['update', '700002', 'NAO']
  ]);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'OFICINAS').map((o) => o.linha), [
    { ploomes_id: 'of-1', nome: 'OFICINA RENOMEADA' },
    { ploomes_id: 'of-3', nome: 'OFICINA NOVA', grupo_jid: '', grupo_nome: '', ativo: 'SIM' }
  ]);
  assert.equal(JSON.stringify(r), JSON.stringify(limpo(ctx.montarSincronizacaoProducao(cards, atuais, oficinas, '2026-10-14T12:00:00.000Z'))));
});

test('prazo efetivo prefere a combinada e cai no lead time', () => {
  assert.deepEqual(limpo(ctx.prazoDaProducao(prod({}))), { data: '2026-10-20', origem: 'COMBINADA' });
  assert.deepEqual(limpo(ctx.prazoDaProducao(prod({ dataCombinada: '' }))), { data: '2026-10-18', origem: 'LEAD_TIME' });
  assert.deepEqual(limpo(ctx.prazoDaProducao(prod({ dataCombinada: '', leadTime: '' }))), { data: '', origem: 'SEM_PRAZO' });
});

test('status do prazo: atrasado, hoje, proximo, no prazo e sem prazo', () => {
  const hoje = '2026-10-13';
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: '2026-10-12' }), hoje).status, 'ATRASADO');
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: hoje }), hoje).status, 'HOJE');
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: '2026-10-16' }), hoje).status, 'PROXIMO');
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: '2026-10-17' }), hoje).status, 'NO_PRAZO');
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: '', leadTime: '' }), hoje).status, 'SEM_PRAZO');
  assert.equal(ctx.statusPrazo(prod({ dataCombinada: '2026-10-10' }), hoje).dias, -3);
});

test('ordenacao coloca ALOCAR primeiro e usa o prazo mais urgente', () => {
  const itens = [
    prod({ dealId: '3', oficina: 'BETA', dataCombinada: '' }),
    prod({ dealId: '2', oficina: 'ALFA', dataCombinada: '2026-10-20' }),
    prod({ dealId: '1', oficina: 'ALOCAR', oficinaId: '', dataCombinada: '2026-10-30' }),
    prod({ dealId: '4', oficina: 'ALFA', dataCombinada: '2026-10-15' })
  ];
  assert.deepEqual(limpo(ctx.ordenarProducoes(itens)).map((x) => x.dealId), ['1', '4', '2', '3']);
});

// No Ploomes o card do funil Produção é outro negócio: cada caixa do
// Almoxarifado (Costura e Acabamento) tem o próprio card. A ligação é pela OS.
test('faltas de aviamentos vêm das caixas da mesma OS, separadas em COSTURA e ACABAMENTO, só itens abertos', () => {
  const caixas = [
    { dealId: '800001', os: '90001', tipo: 'COSTURA', itens: [{ id: 'a', nome: 'VIÉS', status: 'ABERTO', resta: 3 }, { id: 'b', status: 'RESOLVIDO', resta: 0 }] },
    { dealId: '800002', os: '90001', tipo: 'ACABAMENTO', itens: [{ id: 'c', status: 'ABERTO', resta: 2 }, { id: 'e', status: 'PARCIAL', resta: 0 }] },
    { dealId: '800003', os: '90002', tipo: 'COSTURA', itens: [{ id: 'd', status: 'ABERTO', resta: 5 }] },
    { dealId: '800004', os: '', tipo: 'COSTURA', itens: [{ id: 'sem-os', status: 'ABERTO', resta: 1 }] }
  ];
  assert.deepEqual(limpo(ctx.faltasDaCostura(prod({}), caixas)).map((x) => x.id), ['a']);
  assert.deepEqual(limpo(ctx.faltasDoAcabamento(prod({}), caixas)).map((x) => x.id), ['c']);
  assert.deepEqual(limpo(ctx.faltasDaCostura(prod({ os: '' }), caixas)).map((x) => x.id), []);
  assert.deepEqual(limpo(ctx.faltasDaCostura(prod({ os: ' 90001 ' }), caixas)).map((x) => x.id), ['a']);
});

test('validarAlteracaoProducao exige motivo ao mudar data e respeita allowlist/versao', () => {
  const atual = prod({});
  assert.deepEqual(limpo(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-22', motivo: '' }, atual, ['700001'])),
    { ok: false, status: 400, erro: 'Informe o motivo da alteração da data combinada.' });
  assert.deepEqual(limpo(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'velha', oficinaId: 'of-1', dataCombinada: '2026-10-20', motivo: '' }, atual, ['700001'])),
    { ok: false, status: 409, erro: 'Esta OS mudou. Atualize a página e tente de novo.' });
  assert.equal(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-20', motivo: '' }, atual, ['700001']).ok, true);
  assert.deepEqual(limpo(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'v1', oficinaId: 'of-1', dataCombinada: '2026-10-20', motivo: '' }, atual, ['outro'])),
    { ok: false, status: 403, erro: 'Edição liberada em breve para esta OS.' });
});

test('validarAlteracaoProducao recusa data impossível e formulário sem mudança', () => {
  const atual = prod({});
  assert.deepEqual(limpo(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'v1', oficinaId: 'of-1', dataCombinada: '2026-02-30', motivo: 'Ajuste' }, atual, [])),
    { ok: false, status: 400, erro: 'Data combinada inválida.' });
  assert.deepEqual(limpo(ctx.validarAlteracaoProducao({ dealId: '700001', versao: 'v1', oficinaId: 'of-1', dataCombinada: '2026-10-20', motivo: '' }, atual, [])),
    { ok: false, status: 400, erro: 'Nada alterado.' });
});

test('modelos de WhatsApp citam a peça em negrito, sem o número da OS', () => {
  const p = prod({ peca: 'PECA TESTE B', pecas: 160, dataCombinada: '2026-10-20' });
  assert.equal(ctx.modeloWhatsapp('COBRANCA_PRAZO', p, '2026-10-13'),
    'Olá. A entrega de *PECA TESTE B*, 160 peças, está prevista para 20/10. Segue dentro do prazo?');
  assert.equal(ctx.modeloWhatsapp('COBRANCA_PRAZO', p, '2026-10-21'),
    'Olá. A entrega de *PECA TESTE B*, 160 peças, estava prevista para 20/10. Qual a nova data de entrega?');
  assert.equal(ctx.modeloWhatsapp('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: 160, dataCombinada: '', leadTime: '' }), '2026-10-13'),
    'Olá. Qual a previsão de entrega de *PECA TESTE B*, 160 peças?');
  assert.equal(ctx.modeloWhatsapp('CONFIRMAR_DATA', p, '2026-10-13'),
    'Olá. Confirmando a entrega de *PECA TESTE B*, 160 peças, para 20/10. Segue combinado?');
  // Sem quantidade, sem vírgulas soltas; 1 peça no singular; milhar no formato brasileiro.
  assert.equal(ctx.modeloWhatsapp('COBRANCA_PRAZO', prod({ peca: 'PECA TESTE B', pecas: '', dataCombinada: '2026-10-20' }), '2026-10-13'),
    'Olá. A entrega de *PECA TESTE B* está prevista para 20/10. Segue dentro do prazo?');
  assert.match(ctx.modeloWhatsapp('CONFIRMAR_DATA', prod({ pecas: 1 }), '2026-10-13'), /\*CAMISA TESTE\*, 1 peça, para/);
  assert.match(ctx.modeloWhatsapp('CONFIRMAR_DATA', prod({ pecas: 1600 }), '2026-10-13'), /1\.600 peças/);
  for (const tipo of ['COBRANCA_PRAZO', 'CONFIRMAR_DATA']) assert.doesNotMatch(ctx.modeloWhatsapp(tipo, p, '2026-10-13'), /90001|OS /);
});

// ---------- OS previstas (19/10) ----------

const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_PECAS = 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD';
const CAMPO_OFICINA = 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4';
function dealPrevisto(id, etapa, extra) {
  return Object.assign({
    Id: id, Title: 'PEÇA PREVISTA', ContactName: 'CLIENTE FICTÍCIO', LastUpdateDate: 'v-' + id,
    Stage: { Id: 1, Name: etapa },
    OtherProperties: [
      { FieldKey: CAMPO_OS, StringValue: String(id).slice(-5) },
      { FieldKey: CAMPO_PECAS, IntegerValue: 100 },
      { FieldKey: CAMPO_OFICINA, UserValueId: 501, UserValueName: 'OFICINA FICTÍCIA' }
    ]
  }, extra);
}

test('separarPrevistas: etapas 12 a 16, 12 e 13 só com PCP completo, sem repetir a Costura', () => {
  const c = carregar();
  c.CAMPO_PCP_COMPLETO = 'deal_PCP_COMPLETO_FICTICIO';
  const pcp = (sim) => ({ FieldKey: 'deal_PCP_COMPLETO_FICTICIO', BoolValue: sim });
  const comPcp = (d, sim) => { d.OtherProperties.push(pcp(sim)); return d; };
  const deals = [
    comPcp(dealPrevisto(710012, '12. Encaixe'), true),
    comPcp(dealPrevisto(710013, '13. Estratégico 2'), false),
    dealPrevisto(710015, '15. Preparação 1'),
    dealPrevisto(710016, '16. Primeira Peça'),
    dealPrevisto(710017, '17. Costura'),
    dealPrevisto(710011, '11. Ficha técnica'),
    dealPrevisto(710099, '14. Corte'),
    Object.assign(dealPrevisto(710014, '14. Corte'), { OtherProperties: [] })
  ];
  const r = limpo(c.separarPrevistas(deals, ['710099']));
  assert.deepEqual(r.cards.map((x) => [x.dealId, x.etapaOrdem]), [['710012', 12], ['710015', 15], ['710016', 16]]);
  assert.deepEqual(r.dealsMantidos, ['710014']);
  // Sem a FieldKey configurada, nada nas etapas 12 e 13 entra.
  assert.deepEqual(limpo(ctx.separarPrevistas(deals, [])).cards.map((x) => x.dealId), ['710015', '710016', '710099']);
});

test('linhaPrevista: em_costura NAO, prevista SIM e datas projetadas; sem peças fica sem datas', () => {
  const card = ctx.normalizarDealPrevisto(dealPrevisto(710015, '15. Preparação 1'));
  const linha = limpo(ctx.linhaPrevista(card, ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  assert.equal(linha.em_costura, 'NAO');
  assert.equal(linha.prevista, 'SIM');
  assert.equal(linha.etapa_ordem, 15);
  assert.equal(linha.etapa_nome, '15. Preparação 1');
  assert.equal(linha.oficina_id, '501');
  // Sem médias (fallback do BI): FimBase = 19 + 1 = 20/10; Início(17) = 20 + 0 = 20/10; Fim = 21/10.
  assert.equal(linha.inicio_costura_previsto, '2026-10-20');
  assert.equal(linha.fim_costura_previsto, '2026-10-21');
  const semPecas = ctx.normalizarDealPrevisto(Object.assign(dealPrevisto(710016, '16. Primeira Peça'), {
    OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '10016' }]
  }));
  const vazia = limpo(ctx.linhaPrevista(semPecas, ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  assert.equal(vazia.pecas, '');
  assert.equal(vazia.inicio_costura_previsto, '');
  assert.equal(vazia.fim_costura_previsto, '');
});

test('sincronização com previstas: upsert das previstas e encerramento nas duas colunas', () => {
  const cards = [prod({ dealId: '700001' })];
  const prevista = limpo(ctx.linhaPrevista(ctx.normalizarDealPrevisto(dealPrevisto(710015, '15. Preparação 1')), ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  const atuais = [
    { deal_id: '700001', em_costura: 'SIM', prevista: 'NAO' },
    { deal_id: '710016', em_costura: 'NAO', prevista: 'SIM' },
    { deal_id: '710099', em_costura: 'NAO', prevista: 'NAO' }
  ];
  const r = limpo(ctx.montarSincronizacaoProducao(cards, atuais, [], 'T1', [], [prevista]));
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'PRODUCAO').map((o) => [o.operacao, o.linha.deal_id, o.linha.em_costura, o.linha.prevista]), [
    ['appendOrUpdate', '700001', 'SIM', 'NAO'],
    ['appendOrUpdate', '710015', 'NAO', 'SIM'],
    ['update', '710016', 'NAO', 'NAO']
  ]);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'OFICINAS').map((o) => o.linha.ploomes_id), ['of-1', '501']);
});

test('board: IA_DUVIDA aparece como perguntado; NAO_OS fica fora; IA leva o motivo', () => {
  const ctx = carregar();
  const msgs = [
    { id: 'A', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', deal_id: '', oficina_id: 'of-1', quando: '2026-10-22T10:00:00.000Z', texto: 'x' },
    { id: 'B', direcao: 'RECEBIDA', associacao: 'NAO_OS', deal_id: '', oficina_id: 'of-1', quando: '2026-10-22T10:00:00.000Z', texto: 'bom dia' }
  ];
  const lista = limpo(ctx.mensagensSemAssociacaoProducaoBoard(msgs, []));
  assert.deepEqual(lista.map((m) => [m.id, m.perguntado]), [['A', true]]);
  const base = limpo(ctx.mensagemProducaoBoard({ id: 'C', associacao: 'IA', associacao_motivo: 'fala da blusa', direcao: 'RECEBIDA' }));
  assert.equal(base.associacaoMotivo, 'fala da blusa');
  const pergunta = limpo(ctx.mensagemProducaoBoard({ id: 'P', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', associacao: 'MANUAL' }));
  assert.equal(pergunta.pergunta, true);
});
