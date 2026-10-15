const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

function prod(extra) {
  return Object.assign({
    dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A',
    inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
    pecas: 120, cliente: 'CLIENTE FICTÍCIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1'
  }, extra);
}

test('linhaProducao normaliza o snapshot e usa ALOCAR sem oficina', () => {
  assert.deepEqual(limpo(ctx.linhaProducao(prod({ oficinaId: '', oficina: '', pecas: '120,5' }), '2026-10-13T12:00:00.000Z')), {
    deal_id: '700001', os: '90001', oficina_id: '', oficina_nome: 'ALOCAR',
    inicio_costura: '2026-10-01', data_combinada: '2026-10-20', lead_time: '2026-10-18',
    pecas: 120.5, cliente: 'CLIENTE FICTÍCIO', peca: 'CAMISA TESTE', referencia: 'REF-001',
    em_costura: 'SIM', atualizado_em_ploomes: 'v1', sincronizado_em: '2026-10-13T12:00:00.000Z'
  });
});

test('normalizarDealProducao lê os valores tipados de OtherProperties', () => {
  const deal = {
    Id: 700001,
    Title: 'OS 90001 - CAMISA TESTE',
    ContactName: 'CLIENTE FICTÍCIO',
    LastUpdateDate: '2026-10-14T15:20:00Z',
    OtherProperties: [
      { FieldKey: 'deal_C06992BA-FF1E-47A8-9330-5242026E691E', StringValue: '90001' },
      { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', IntegerValue: 44, ObjectValueName: 'OFICINA FICTÍCIA' },
      { FieldKey: 'deal_92FBE0E7-E136-41BF-AE47-1E427B178727', DateTimeValue: '2026-10-01T03:00:00Z' },
      { FieldKey: 'deal_E53BDEC3-F829-413D-9421-91D5D7411349', DateTimeValue: '2026-10-20T03:00:00Z' },
      { FieldKey: 'deal_1B168E7F-E71D-4895-8A37-D7DB6FD3418D', DateTimeValue: '2026-10-18T03:00:00Z' },
      { FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', DecimalValue: 120 },
      { FieldKey: 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7', StringValue: 'CAMISA TESTE' },
      { FieldKey: 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D', StringValue: 'REF-001' }
    ]
  };
  assert.deepEqual(limpo(ctx.normalizarDealProducao(deal)), {
    dealId: '700001', os: '90001', oficinaId: '44', oficina: 'OFICINA FICTÍCIA',
    inicioCostura: '2026-10-01T03:00:00Z', dataCombinada: '2026-10-20T03:00:00Z',
    leadTime: '2026-10-18T03:00:00Z', pecas: 120, cliente: 'CLIENTE FICTÍCIO',
    peca: 'CAMISA TESTE', referencia: 'REF-001', versao: '2026-10-14T15:20:00Z'
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
  assert.equal(r.peca, 'PEÇA SEM CADASTRO');
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

test('faltas de aviamentos separam COSTURA e ACABAMENTO e trazem somente itens abertos', () => {
  const caixas = [
    { dealId: '700001', os: '90001', tipo: 'COSTURA', itens: [{ id: 'a', nome: 'VIÉS', status: 'ABERTO', resta: 3 }, { id: 'b', status: 'RESOLVIDO', resta: 0 }] },
    { dealId: '700001', os: '90001', tipo: 'ACABAMENTO', itens: [{ id: 'c', status: 'ABERTO', resta: 2 }, { id: 'e', status: 'PARCIAL', resta: 0 }] },
    { dealId: 'outro-deal', os: '90001', tipo: 'ACABAMENTO', itens: [{ id: 'contaminacao', status: 'ABERTO', resta: 9 }] },
    { dealId: '700002', os: '90002', tipo: 'COSTURA', itens: [{ id: 'd', status: 'ABERTO', resta: 5 }] }
  ];
  assert.deepEqual(limpo(ctx.faltasDaCostura(prod({}), caixas)).map((x) => x.id), ['a']);
  assert.deepEqual(limpo(ctx.faltasDoAcabamento(prod({}), caixas)).map((x) => x.id), ['c']);
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

test('modelos de WhatsApp sempre identificam a OS', () => {
  const vencida = prod({ dataCombinada: '2026-10-10' });
  const cobrar = ctx.modeloWhatsapp('COBRANCA_PRAZO', vencida, '2026-10-13');
  const confirmar = ctx.modeloWhatsapp('CONFIRMAR_DATA', prod({}), '2026-10-13');
  const material = ctx.modeloWhatsapp('MATERIAL_ENVIADO', prod({}), '2026-10-13');
  for (const texto of [cobrar, confirmar, material]) assert.match(texto, /^\*OS 90001\*/);
  assert.match(cobrar, /Qual a nova data de entrega\?/);
  assert.match(confirmar, /20\/10/);
  assert.match(material, /material que faltava na caixa de costura foi enviado/i);
});
