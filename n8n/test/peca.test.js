// F5a · Visão da peça: busca dos cards da OS no Ploomes (lógica pura).
// Dados fictícios; os ids reais são só os do card de teste da homologação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_REF = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';
const CAMPO_PECA = 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7';

function deal(id, os, ref, extra) {
  return Object.assign({
    Id: id, Title: 'CARD ' + id, ContactName: 'CLIENTE FICTICIO', PipelineId: 60015827, StageId: 60105, StatusId: 1,
    LastUpdateDate: '2026-10-27T10:00:00-03:00', CreateDate: '2026-10-01T10:00:00-03:00',
    Stage: { Id: 60105, Name: '17. Costura' },
    OtherProperties: [
      { FieldKey: CAMPO_OS, StringValue: os },
      { FieldKey: CAMPO_REF, StringValue: ref },
      { FieldKey: CAMPO_PECA, StringValue: 'CAMISA TESTE' }
    ]
  }, extra || {});
}
const ok = (value) => ({ statusCode: 200, body: { value } });

test('busca: OS numérica, referência e entrada inválida', () => {
  assert.deepEqual(limpo(ctx.normalizarBuscaPeca(' 123456 ')), { ok: true, q: '123456', chave: '123456', numerica: true });
  assert.deepEqual(limpo(ctx.normalizarBuscaPeca('ref-01  a')), { ok: true, q: 'ref-01 a', chave: 'REF-01 A', numerica: false });
  for (const ruim of ['', '   ', "x' or 1 eq 1", 'a'.repeat(61), null, undefined]) {
    assert.deepEqual(limpo(ctx.normalizarBuscaPeca(ruim)), { ok: false, status: 400, erro: 'Informe a OS ou a referência.' });
  }
});

test('URL dos cards: OS só por StringValue e sem "or" no filtro; referência à parte', () => {
  const crua = ctx.urlCardsPeca(ctx.normalizarBuscaPeca('123456'));
  assert.ok(!/ /.test(crua), 'sem espaço cru na URL');
  const url = decodeURIComponent(crua);
  assert.ok(url.startsWith("https://public-api2.ploomes.com/Deals?$filter=OtherProperties/any(o: o/FieldKey eq '" + CAMPO_OS + "' and o/StringValue eq '123456')&"), url);
  const filtro = /\$filter=([^&]*)&/.exec(url)[1];
  assert.ok(!/ or /.test(filtro) && !/IntegerValue/.test(filtro), filtro);
  assert.ok(url.includes("$expand=OtherProperties($filter=FieldKey eq '" + CAMPO_OS + "' or FieldKey eq '" + CAMPO_REF + "' or FieldKey eq '" + CAMPO_PECA + "'),Stage($select=Id,Name)"), url);
  assert.ok(url.includes('$select=Id,Title,ContactName,PipelineId,StageId,StatusId,LastUpdateDate,CreateDate'), url);
  assert.ok(url.includes('$orderby=LastUpdateDate desc') && url.endsWith('$top=50'), url);
  const ref = decodeURIComponent(ctx.urlCardsPeca(ctx.normalizarBuscaPeca('REF 01/A')));
  assert.ok(!ref.includes(CAMPO_OS + "' and"), ref);
  assert.ok(ref.includes("$filter=OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REF + "' and o/StringValue eq 'REF 01/A')&"), ref);
  // Número que não é OS: a segunda leitura procura como referência.
  const porRef = decodeURIComponent(ctx.urlReferenciaPeca(ctx.normalizarBuscaPeca('2024')));
  assert.ok(porRef.includes("$filter=OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REF + "' and o/StringValue eq '2024')&"), porRef);
  assert.equal(ctx.urlReferenciaPeca(ctx.normalizarBuscaPeca('REF 01/A')), ctx.urlCardsPeca(ctx.normalizarBuscaPeca('REF 01/A')));
});

test('literal OData: acento, barra e aspas codificados na URL', () => {
  assert.equal(ctx.literalODataPeca("CAMISÃ/A'B"), "'CAMIS%C3%83%2FA''B'");
  const crua = ctx.urlCardsPeca(ctx.normalizarBuscaPeca('REF Ç/01'));
  assert.ok(crua.includes("StringValue%20eq%20'REF%20%C3%87%2F01'"), crua);
  assert.ok(!/[ ÇÃ]/.test(crua), crua);
  assert.ok(decodeURIComponent(crua).includes("o/StringValue eq 'REF Ç/01')"), crua);
});

test('card normalizado; OS em IntegerValue também vale na leitura', () => {
  assert.deepEqual(limpo(ctx.cardPecaDoDeal(deal(607600001, '123456', 'REF-01'))), {
    dealId: '607600001', funilId: 60015827, funil: 'Produção', etapaId: 60105, etapa: '17. Costura', etapaOrdem: null,
    titulo: 'CARD 607600001', cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-01', os: '123456',
    atualizadoEm: '2026-10-27T10:00:00-03:00', link: 'https://app10.ploomes.com/deal/607600001'
  });
  const inteiro = deal(2, '', '', { PipelineId: 60011710, OtherProperties: [{ FieldKey: CAMPO_OS, IntegerValue: 123456 }] });
  const c = limpo(ctx.cardPecaDoDeal(inteiro));
  assert.equal(c.os, '123456');
  assert.equal(c.funil, 'PCP');
  assert.equal(c.peca, 'CARD 2');
  assert.equal(limpo(ctx.cardPecaDoDeal(deal(3, '1', '', { PipelineId: 1 }))).funil, 'Funil 1');
});

test('resolução por OS: até 5 cards, os mais recentes; outra OS fica de fora', () => {
  const busca = ctx.normalizarBuscaPeca('123456');
  const deals = [1, 2, 3, 4, 5, 6].map((n) => deal(607600000 + n, '123456', 'REF-01', { LastUpdateDate: '2026-10-2' + n + 'T10:00:00-03:00' }));
  deals.push(deal(607699999, '999', 'REF-01', { LastUpdateDate: '2026-10-29T10:00:00-03:00' }));
  const r = limpo(ctx.resolverCardsPeca(busca, ok(deals)));
  assert.equal(r.ok, true);
  assert.equal(r.os, '123456');
  assert.equal(r.candidatos, undefined);
  assert.deepEqual(r.cards.map((c) => c.dealId), ['607600006', '607600005', '607600004', '607600003', '607600002']);
});

test('referência: uma linha por OS; número que não é OS cai na referência; nada; Ploomes fora', () => {
  const r = limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('ref-01'), ok([
    deal(1, '111', 'REF-01'),
    deal(2, '222', 'REF-01', { PipelineId: 60011710, Stage: { Id: 7, Name: 'Concluído' } }),
    deal(3, '111', 'REF-01'),
    deal(4, '', 'REF-01'),
    deal(5, '333', 'OUTRA')
  ])));
  assert.deepEqual(r, { ok: true, os: '', cards: [], candidatos: [
    { os: '111', peca: 'CAMISA TESTE', etapa: '17. Costura', funil: 'Produção', dealId: '1' },
    { os: '222', peca: 'CAMISA TESTE', etapa: 'Concluído', funil: 'PCP', dealId: '2' }
  ] });
  const numero = limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('2024'), ok([deal(9, '555', '2024')])));
  assert.deepEqual(numero.candidatos.map((c) => c.os), ['555']);
  assert.deepEqual(limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('nada'), ok([]))), { ok: false, status: 404, erro: 'Nenhuma OS encontrada no Ploomes.' });
  for (const ruim of [{ statusCode: 500, body: {} }, { error: { message: 'timeout' } }, null, { statusCode: 200, body: {} }]) {
    assert.deepEqual(limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('123456'), ruim)), { ok: false, status: 502, erro: 'Não foi possível ler o Ploomes agora.' });
  }
});

test('URLs de registros, trocas (com UpdateDate) e etapas (Deals@Stages) dos cards da OS', () => {
  const cards = [{ dealId: '607612577', funilId: 60015827 }, { dealId: '607600001', funilId: 60011710 }, { dealId: '607600002', funilId: 60015827 }];
  const u = limpo(ctx.urlsDetalhesPeca(cards));
  Object.keys(u).forEach((k) => assert.ok(!/ /.test(u[k]), k));
  const d = (x) => decodeURIComponent(x);
  assert.equal(d(u.registros), 'https://public-api2.ploomes.com/InteractionRecords?$filter=(DealId eq 607612577 or DealId eq 607600001 or DealId eq 607600002)&$expand=Creator($select=Name)&$select=Id,DealId,Date,CreateDate,Content,TypeId&$orderby=Date desc&$top=200');
  assert.equal(d(u.trocas), 'https://public-api2.ploomes.com/DealsStagesHistory?$filter=(DealId eq 607612577 or DealId eq 607600001 or DealId eq 607600002)&$select=Id,DealId,StageId,NewStageId,CreateDate,UpdateDate,CreatorId,Undone,Days&$orderby=CreateDate desc&$top=200');
  assert.equal(d(u.etapas), 'https://public-api2.ploomes.com/Deals@Stages?$filter=(PipelineId eq 60015827 or PipelineId eq 60011710)&$select=Id,Name,Ordination,PipelineId&$top=300');
  // Um card só: o mesmo filtro simples conferido no Ploomes real, sem "or".
  const um = limpo(ctx.urlsDetalhesPeca([{ dealId: '607612577', funilId: 60015827 }]));
  assert.ok(d(um.trocas).includes('$filter=DealId eq 607612577&'), d(um.trocas));
  assert.ok(d(um.etapas).startsWith('https://public-api2.ploomes.com/Deals@Stages?$filter=PipelineId eq 60015827&'), d(um.etapas));
});
