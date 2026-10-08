const test = require('node:test');
const assert = require('node:assert');
const { carregar, limpo } = require('./carregar');

const c = carregar();
const L = (id, quando, extra) => Object.assign({
  id, quando, deal_id: '9001', os: '90001', texto: 'Baixa de 20 UN',
  ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '',
}, extra || {});

const AGORA = Date.parse('2026-10-07T13:00:00Z');
const ids = (grupos) => limpo(grupos).map((g) => [g.deal_id, g.linhas.map((x) => x.id)]);

test('selecionarGrupos: so PENDENTE com menos de 5 tentativas e deal valido, por deal, mais antiga primeiro', () => {
  const linhas = [
    { id: 'inicio', quando: '2026-01-01T00:00:00Z', ploomes_status: 'ENVIADO' },
    L('c', '2026-10-07T12:03:00Z'),
    L('a', '2026-10-07T12:01:00Z', { tentativas: '2' }),
    L('b', '2026-10-07T12:02:00Z', { ploomes_status: 'ERRO' }),
    L('d', '2026-10-07T12:00:00Z', { tentativas: 5 }),
    L('e', '2026-10-07T12:00:30Z', { tentativas: '' }),
    L('x', '2026-10-07T11:00:00Z', { deal_id: '9002', os: '90002' }),
    L('v', '2026-10-07T11:00:00Z', { deal_id: '' }),
  ];
  const g = limpo(c.selecionarGrupos(linhas, AGORA));
  assert.deepStrictEqual(ids(g), [['9002', ['x']], ['9001', ['e', 'a', 'c']]]);
  assert.strictEqual(g[1].os, '90001');
  assert.strictEqual(c.MAX_TENTATIVAS_PLOOMES, 5);
});

test('selecionarGrupos: o grupo so sai quando a linha mais nova tem 10 minutos ou mais', () => {
  const linhas = [L('a', '2026-10-07T12:40:00Z'), L('b', '2026-10-07T12:50:00Z'), L('c', '2026-10-07T12:30:00Z', { deal_id: '9002' })];
  assert.deepStrictEqual(ids(c.selecionarGrupos(linhas, AGORA)), [['9002', ['c']], ['9001', ['a', 'b']]]);
  assert.deepStrictEqual(ids(c.selecionarGrupos(linhas, AGORA - 1)), [['9002', ['c']]]);
  assert.deepStrictEqual(ids(c.selecionarGrupos(linhas, AGORA - 1, { esperaMs: 0 })), [['9002', ['c']], ['9001', ['a', 'b']]]);
});

test('selecionarGrupos: ate 30 linhas por grupo (as mais antigas) e 20 grupos por rodada', () => {
  const muitas = [];
  for (let i = 0; i < 35; i++) muitas.push(L('l' + String(i).padStart(2, '0'), '2026-10-07T11:' + String(i).padStart(2, '0') + ':00Z'));
  const g = limpo(c.selecionarGrupos(muitas.reverse(), AGORA));
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].linhas.length, 30);
  assert.strictEqual(g[0].linhas[0].id, 'l00');
  assert.strictEqual(g[0].linhas[29].id, 'l29');
  const deals = [];
  for (let i = 0; i < 25; i++) deals.push(L('d' + i, '2026-10-07T11:' + String(10 + i) + ':00Z', { deal_id: String(100 + i) }));
  const gd = limpo(c.selecionarGrupos(deals, AGORA));
  assert.strictEqual(gd.length, 20);
  assert.strictEqual(gd[0].deal_id, '100');
  const pouco = limpo(c.selecionarGrupos(deals.concat([L('d0b', '2026-10-07T11:09:00Z', { deal_id: '100' })]), AGORA, { maxGrupos: 2, maxLinhas: 1 }));
  assert.deepStrictEqual(ids(pouco), [['100', ['d0b']], ['101', ['d1']]]);
});

test('montarRegistroCompilado: um registro por grupo, hora de Sao Paulo, sem o prefixo repetido', () => {
  const grupo = c.selecionarGrupos([
    L('a', '2026-10-07T17:44:00.000Z', { texto: 'Lucca moveu PED-0001 para Solicitado' }),
    L('b', '2026-10-07T17:46:10.000Z', { texto: '[PCP · OS 90001] Lucca dividiu PED-0001' }),
  ], Date.parse('2026-10-07T18:00:00Z'))[0];
  assert.deepStrictEqual(limpo(c.montarRegistroCompilado(grupo, 77)), {
    DealId: 9001, ContactId: 77,
    Content: '[PCP · OS 90001] Atualizações do app PCP\n• 14:44 Lucca moveu PED-0001 para Solicitado\n• 14:46 Lucca dividiu PED-0001',
    Date: '2026-10-07T17:46:10.000Z',
  });
  for (const ruim of [null, undefined, '', 0, 'abc', -3, NaN]) {
    assert.ok(!('ContactId' in limpo(c.montarRegistroCompilado(grupo, ruim))));
  }
  assert.strictEqual(limpo(c.montarRegistroCompilado(grupo, '12')).ContactId, 12);
});

test('montarRegistroCompilado: quando invalido sai sem hora', () => {
  const r = limpo(c.montarRegistroCompilado({ deal_id: '9001', os: '90001', linhas: [L('a', 'x', { texto: 'oi' })] }, null));
  assert.strictEqual(r.Content, '[PCP · OS 90001] Atualizações do app PCP\n• oi');
  assert.strictEqual(r.Date, 'x');
});

test('resultadoGrupo: todas as linhas do grupo recebem o mesmo resultado; 429 nao grava nada', () => {
  const grupo = { deal_id: '9001', os: '90001', linhas: [L('a', 'q', { tentativas: 1 }), L('b', 'q')] };
  assert.deepStrictEqual(limpo(c.resultadoGrupo(grupo, { status: 201, body: { Id: 555 } })), [
    { id: 'a', ploomes_status: 'ENVIADO', ploomes_id: '555', tentativas: 1, erro: '' },
    { id: 'b', ploomes_status: 'ENVIADO', ploomes_id: '555', tentativas: 0, erro: '' },
  ]);
  assert.deepStrictEqual(limpo(c.resultadoGrupo(grupo, { status: 429, body: {} })), []);
  assert.deepStrictEqual(limpo(c.resultadoGrupo(grupo, { status: 400, body: { error: { message: 'ruim' } } })), [
    { id: 'a', ploomes_status: 'PENDENTE', tentativas: 2, erro: 'ruim' },
    { id: 'b', ploomes_status: 'PENDENTE', tentativas: 1, erro: 'ruim' },
  ]);
});

test('resultadoEnvio: sucesso com Id em body.Id ou body.value[0].Id', () => {
  const l = L('a', 'q', { tentativas: '1' });
  assert.deepStrictEqual(limpo(c.resultadoEnvio(l, { status: 201, body: { Id: 555 } })),
    { id: 'a', ploomes_status: 'ENVIADO', ploomes_id: '555', tentativas: 1, erro: '' });
  assert.strictEqual(limpo(c.resultadoEnvio(l, { status: 200, body: { value: [{ Id: 9 }] } })).ploomes_id, '9');
});

test('resultadoEnvio: 429 para a rodada', () => {
  assert.deepStrictEqual(limpo(c.resultadoEnvio(L('a', 'q'), { status: 429, body: {} })), { parar: true });
});

test('resultadoEnvio: erro soma tentativa e vira ERRO na quinta', () => {
  const r1 = limpo(c.resultadoEnvio(L('a', 'q', { tentativas: 1 }), { status: 400, body: { error: { message: 'ruim' } } }));
  assert.deepStrictEqual(r1, { id: 'a', ploomes_status: 'PENDENTE', tentativas: 2, erro: 'ruim' });
  const r5 = limpo(c.resultadoEnvio(L('a', 'q', { tentativas: '4' }), { status: 500, body: { message: 'x'.repeat(400) } }));
  assert.strictEqual(r5.ploomes_status, 'ERRO');
  assert.strictEqual(r5.tentativas, 5);
  assert.strictEqual(r5.erro.length, 300);
  const r0 = limpo(c.resultadoEnvio(L('a', 'q', { tentativas: '' }), { status: 502, body: null, statusText: 'Bad Gateway' }));
  assert.strictEqual(r0.tentativas, 1);
  assert.strictEqual(r0.erro, 'Bad Gateway');
});

test('linhasInvalidas marca ERRO as PENDENTE com deal_id invalido (e elas nao entram nos grupos)', () => {
  const linhas = [
    L('ok', '2026-10-07T12:00:00Z'),
    L('v', '2026-10-07T12:01:00Z', { deal_id: '' }),
    L('x', '2026-10-07T12:02:00Z', { deal_id: 'abc', tentativas: 2 }),
    L('z', '2026-10-07T12:03:00Z', { deal_id: '0' }),
    L('e', '2026-10-07T12:04:00Z', { deal_id: '', ploomes_status: 'ENVIADO' }),
  ];
  assert.deepStrictEqual(ids(c.selecionarGrupos(linhas, AGORA)), [['9001', ['ok']]]);
  assert.deepStrictEqual(limpo(c.linhasInvalidas(linhas)), [
    { id: 'v', ploomes_status: 'ERRO', tentativas: 0, erro: 'deal_id inválido' },
    { id: 'x', ploomes_status: 'ERRO', tentativas: 2, erro: 'deal_id inválido' },
    { id: 'z', ploomes_status: 'ERRO', tentativas: 0, erro: 'deal_id inválido' },
  ]);
});

test('respostaOk: so 2xx', () => {
  for (const s of [200, 201, 299, '204']) assert.ok(c.respostaOk(s));
  for (const s of [199, 300, 404, 429, 500, undefined, null]) assert.ok(!c.respostaOk(s));
});

test('decidirContato: pula so em 429/5xx; outros nao-2xx seguem sem ContactId', () => {
  for (const s of [429, 500, 503, '502']) assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: s })), { pular: true, contactId: null });
  assert.deepStrictEqual(limpo(c.decidirContato(undefined)), { pular: true, contactId: null });
  for (const s of [404, 400, 401]) assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: s })), { pular: false, contactId: null });
  assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: 200, body: { value: [{ ContactId: 12 }] } })), { pular: false, contactId: 12 });
  assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: 200, body: { value: [] } })), { pular: false, contactId: null });
});
