// F5a · Visão da peça: eventos do Ploomes, trilha de etapas, cache e resposta do pcp-peca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const TOKEN = 'a'.repeat(64);
const CAB = 'Bearer ' + TOKEN;
const novaSessao = () => ({ sessoes: { [TOKEN]: { email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'PCP', expira: T0 + 3600e3 } }, tentativas: {} });
const ok = (value) => ({ statusCode: 200, body: { value } });
const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_REF = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';

// Ordination do Ploomes é 0-based.
const etapas = [
  { Id: 60104, Name: '16. 1ª Peça', Ordination: 5, PipelineId: 60015827 },
  { Id: 60105, Name: '17. Costura', Ordination: 6, PipelineId: 60015827 },
  { Id: 60103, Name: '15. Preparação 1', Ordination: 4, PipelineId: 60015827 },
  { Id: 60200, Name: 'Concluído', Ordination: 9, PipelineId: 60011710 }
];
const card = (o) => Object.assign({ dealId: '607612577', funilId: 60015827, funil: 'Produção', etapaId: 60105, etapa: '17. Costura', etapaOrdem: null,
  titulo: 'CARD', cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-01', os: '123456', atualizadoEm: '2026-10-26T10:00:00-03:00',
  link: 'https://app10.ploomes.com/deal/607612577' }, o);
const cards = [card({}), card({ dealId: '607600001', funilId: 60011710, funil: 'PCP', etapaId: 60200, etapa: 'Concluído', atualizadoEm: '2026-10-27T10:00:00-03:00' })];
const registros = [
  { Id: 1, DealId: 607612577, Date: '2026-10-20T10:00:00-03:00', Content: 'Cliente pediu ajuste na gola.', Creator: { Name: 'Pessoa Comercial' } },
  { Id: 2, DealId: 607612577, Date: '2026-10-21T10:00:00-03:00', Content: '[PCP · OS 123456] Atualizações do app PCP\n• 10:00 x', Creator: { Name: 'Integração' } },
  { Id: 3, DealId: 607612577, Date: '2026-10-22T10:00:00-03:00', Content: '   ', Creator: null }
];
// Cada linha é a passagem por uma etapa: CreateDate = entrada na origem; UpdateDate = hora da troca.
const trocas = [
  { Id: 10, DealId: 607612577, StageId: 60104, NewStageId: 60105, CreateDate: '2026-10-18T10:00:00-03:00', UpdateDate: '2026-10-20T10:00:00-03:00', Undone: false },
  { Id: 11, DealId: 607612577, StageId: 60103, NewStageId: 60104, CreateDate: '2026-10-10T10:00:00-03:00', UpdateDate: '2026-10-18T10:00:00-03:00', Undone: true },
  { Id: 12, DealId: 607612577, StageId: 60105, NewStageId: null, CreateDate: '2026-10-20T10:00:00-03:00', UpdateDate: '2026-10-25T10:00:00-03:00' }
];

test('card principal: Produção, senão PCP, senão o mais recente', () => {
  assert.equal(ctx.cardPrincipalPeca(cards).dealId, '607612577');
  assert.equal(ctx.cardPrincipalPeca([cards[1], card({ dealId: '9', funilId: 1, atualizadoEm: '2026-10-28T10:00:00-03:00' })]).dealId, '607600001');
  assert.equal(ctx.cardPrincipalPeca([card({ dealId: '8', funilId: 1, atualizadoEm: '2026-10-01T10:00:00-03:00' }), card({ dealId: '9', funilId: 2 })]).dealId, '9');
  assert.equal(ctx.cardPrincipalPeca([]), null);
});

test('eventos: sem os registros do app, trocas na hora da troca (UpdateDate) com "desfeita", mais novo primeiro, empate Etapa antes de Ploomes', () => {
  assert.deepEqual(limpo(ctx.eventosPloomesPeca(registros, trocas, etapas, cards)), [
    { quando: '2026-10-20T10:00:00-03:00', fonte: 'ETAPA', texto: 'Produção: 16. 1ª Peça → 17. Costura', autor: '', dealId: '607612577' },
    { quando: '2026-10-20T10:00:00-03:00', fonte: 'PLOOMES', texto: 'Cliente pediu ajuste na gola.', autor: 'Pessoa Comercial', dealId: '607612577' },
    { quando: '2026-10-18T10:00:00-03:00', fonte: 'ETAPA', texto: 'Produção: 15. Preparação 1 → 16. 1ª Peça', autor: '', dealId: '607612577', desfeita: true }
  ]);
  // Sem nome da etapa: "Etapa <id>"; sem UpdateDate: CreateDate.
  const sem = limpo(ctx.eventosPloomesPeca([], [{ DealId: 5, StageId: 1, NewStageId: 2, CreateDate: '2026-10-01T00:00:00Z' }], [], []));
  assert.deepEqual(sem, [{ quando: '2026-10-01T00:00:00Z', fonte: 'ETAPA', texto: 'Etapa 1 → Etapa 2', autor: '', dealId: '5' }]);
});

test('eventos: no máximo 200, os mais recentes', () => {
  const muitos = [];
  for (let i = 0; i < 250; i++) muitos.push({ DealId: 1, Date: new Date(T0 - i * 60000).toISOString(), Content: 'r' + i });
  const ev = limpo(ctx.eventosPloomesPeca(muitos, [], [], []));
  assert.equal(ev.length, 200);
  assert.equal(ev[0].texto, 'r0');
  assert.equal(ev[199].texto, 'r199');
});

test('trilha: etapas do funil do card principal em ordem, com a atual', () => {
  assert.deepEqual(limpo(ctx.trilhaPeca(cards, etapas)), {
    funil: 'Produção', dealId: '607612577', atualId: '60105',
    etapas: [{ id: '60103', nome: '15. Preparação 1', ordem: 4 }, { id: '60104', nome: '16. 1ª Peça', ordem: 5 }, { id: '60105', nome: '17. Costura', ordem: 6 }]
  });
  assert.equal(ctx.trilhaPeca([], etapas), null);
});

test('validar: sem sessão 401, busca ruim 400, senão a URL dos cards', () => {
  const estado = novaSessao();
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, 'Bearer x', { q: '123456' }, T0)), { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } });
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, {}, T0)), { pronto: true, status: 400, body: { erro: 'Informe a OS ou a referência.' } });
  const v = limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0));
  assert.equal(v.pronto, false);
  assert.deepEqual(v.busca, { ok: true, q: '123456', chave: '123456', numerica: true });
  assert.equal(v.url, ctx.urlCardsPeca(v.busca));
});

test('fluxo completo: cards → detalhes → resposta, cache de 60 s, erro do Ploomes fora do cache', () => {
  const estado = novaSessao();
  const v = limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0));
  const deal = { Id: 607612577, Title: 'CARD', ContactName: 'CLIENTE FICTICIO', PipelineId: 60015827, StageId: 60105,
    LastUpdateDate: '2026-10-26T10:00:00-03:00', Stage: { Id: 60105, Name: '17. Costura' }, OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '123456' }] };
  const l = limpo(ctx.prepararLeiturasPeca(v.busca, ok([deal]), T0, estado));
  assert.equal(l.pronto, false);
  assert.equal(l.buscarReferencia, false);
  assert.equal(l.os, '123456');
  assert.deepEqual(l.cards.map((c) => c.dealId), ['607612577']);
  assert.deepEqual(Object.keys(l.urls).sort(), ['etapas', 'registros', 'trocas']);
  const erro = limpo(ctx.finalizarPeca(l, { registros: { statusCode: 429, body: {} }, trocas: ok([]), etapas: ok([]) }, T0, estado));
  assert.deepEqual(erro, { status: 502, body: { erro: 'Não foi possível ler o Ploomes agora.' } });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0)).pronto, false, 'erro não vai ao cache');
  const m = limpo(ctx.finalizarPeca(l, { registros: ok(registros), trocas: ok(trocas), etapas: ok(etapas) }, T0, estado));
  assert.equal(m.status, 200);
  assert.equal(m.body.geradoEm, '2026-10-27T12:00:00.000Z');
  assert.equal(m.body.os, '123456');
  assert.equal(m.body.cards[0].etapaOrdem, 6);
  assert.equal(m.body.trilha.atualId, '60105');
  assert.equal(m.body.eventos.length, 3);
  assert.equal(m.body.candidatos, undefined);
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, { q: ' 123456 ' }, T0 + 59999)), { pronto: true, status: 200, body: m.body });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0 + 60000)).pronto, false);
});

const dealRef = (id, os, ref) => ({ Id: id, PipelineId: 60015827, Stage: { Name: '17. Costura' }, LastUpdateDate: '2026-10-26T10:00:00-03:00',
  OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: os }, { FieldKey: CAMPO_REF, StringValue: ref }] });

test('referência com várias OS: resposta pronta com a lista (e no cache); nada: 404 fora do cache', () => {
  const estado = novaSessao();
  const busca = ctx.normalizarBuscaPeca('ref-01');
  const r = limpo(ctx.prepararLeiturasPeca(busca, ok([dealRef(1, '111', 'REF-01'), dealRef(2, '222', 'REF-01')]), T0, estado));
  assert.equal(r.pronto, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.candidatos.map((c) => c.os), ['111', '222']);
  assert.deepEqual([r.body.os, r.body.cards, r.body.trilha, r.body.eventos], ['', [], null, []]);
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, { q: 'REF-01' }, T0 + 1000)).body, r.body);
  const nada = limpo(ctx.prepararLeiturasPeca(ctx.normalizarBuscaPeca('XYZ'), ok([]), T0, estado));
  assert.deepEqual(nada, { pronto: true, status: 404, body: { erro: 'Nenhuma OS encontrada no Ploomes.' } });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: 'XYZ' }, T0)).pronto, false);
});

test('número sem card com essa OS: pede a segunda leitura pela referência; ela fecha a resposta', () => {
  const estado = novaSessao();
  const busca = ctx.normalizarBuscaPeca('2024');
  const l = limpo(ctx.prepararLeiturasPeca(busca, ok([]), T0, estado));
  assert.deepEqual(l, { pronto: false, buscarReferencia: true, busca: limpo(busca), url: ctx.urlReferenciaPeca(busca) });
  // Erro do Ploomes na primeira leitura não vira busca por referência.
  assert.deepEqual(limpo(ctx.prepararLeiturasPeca(busca, { statusCode: 500, body: {} }, T0, estado)),
    { pronto: true, status: 502, body: { erro: 'Não foi possível ler o Ploomes agora.' } });
  const r = limpo(ctx.prepararReferenciaPeca(busca, ok([dealRef(9, '555', '2024')]), T0, estado));
  assert.equal(r.pronto, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.candidatos, [{ os: '555', peca: '', etapa: '17. Costura', funil: 'Produção', dealId: '9' }]);
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, { q: '2024' }, T0 + 1000)).body, r.body);
  // Nada pela referência: 404; Ploomes fora: 502 (nenhum dos dois vai ao cache).
  assert.deepEqual(limpo(ctx.prepararReferenciaPeca(busca, ok([]), T0, estado)), { pronto: true, status: 404, body: { erro: 'Nenhuma OS encontrada no Ploomes.' } });
  assert.deepEqual(limpo(ctx.prepararReferenciaPeca(busca, null, T0, estado)), { pronto: true, status: 502, body: { erro: 'Não foi possível ler o Ploomes agora.' } });
});

test('cache guarda no máximo 50 buscas e descarta as vencidas', () => {
  const estado = {};
  for (let i = 0; i < 60; i++) ctx.guardarPecaNoCache(estado, 'K' + i, { i }, T0 + i);
  assert.equal(Object.keys(estado.pecas).length, 50);
  assert.equal(ctx.pecaDoCache(estado, 'K0', T0 + 100), null);
  assert.deepEqual(limpo(ctx.pecaDoCache(estado, 'K59', T0 + 100)), { i: 59 });
  ctx.guardarPecaNoCache(estado, 'NOVA', { x: 1 }, T0 + 70000);
  assert.deepEqual(Object.keys(estado.pecas), ['NOVA']);
});
