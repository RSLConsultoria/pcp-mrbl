const test = require('node:test');
const assert = require('node:assert');
const { carregar, limpo } = require('./carregar');

const c = carregar();
const L = (id, quando, extra) => Object.assign({
  id, quando, deal_id: '9001', os: '90001', texto: 'Baixa de 20 UN',
  ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '',
}, extra || {});

test('selecionarPendentes: so PENDENTE com menos de 5 tentativas, mais antiga primeiro', () => {
  const linhas = [
    { id: 'inicio', quando: '2026-01-01T00:00:00Z', ploomes_status: 'ENVIADO' },
    L('c', '2026-10-07T12:03:00Z'),
    L('a', '2026-10-07T12:01:00Z', { tentativas: '2' }),
    L('b', '2026-10-07T12:02:00Z', { ploomes_status: 'ERRO' }),
    L('d', '2026-10-07T12:00:00Z', { tentativas: 5 }),
    L('e', '2026-10-07T12:00:30Z', { tentativas: '' }),
  ];
  assert.deepStrictEqual(limpo(c.selecionarPendentes(linhas)).map((x) => x.id), ['e', 'a', 'c']);
  assert.deepStrictEqual(limpo(c.selecionarPendentes(linhas, 2)).map((x) => x.id), ['e', 'a']);
  assert.strictEqual(c.MAX_TENTATIVAS_PLOOMES, 5);
});

test('montarRegistro', () => {
  const l = L('a', '2026-10-07T12:01:00Z');
  assert.deepStrictEqual(limpo(c.montarRegistro(l, 77)), {
    DealId: 9001, ContactId: 77, Content: '[PCP · OS 90001] Baixa de 20 UN', Date: '2026-10-07T12:01:00Z',
  });
  for (const vazio of [null, undefined, '', 0]) {
    assert.ok(!('ContactId' in limpo(c.montarRegistro(l, vazio))));
  }
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

test('selecionarPendentes ignora deal_id invalido; linhasInvalidas as marca ERRO', () => {
  const linhas = [
    L('ok', '2026-10-07T12:00:00Z'),
    L('v', '2026-10-07T12:01:00Z', { deal_id: '' }),
    L('x', '2026-10-07T12:02:00Z', { deal_id: 'abc', tentativas: 2 }),
    L('z', '2026-10-07T12:03:00Z', { deal_id: '0' }),
    L('e', '2026-10-07T12:04:00Z', { deal_id: '', ploomes_status: 'ENVIADO' }),
  ];
  assert.deepStrictEqual(limpo(c.selecionarPendentes(linhas)).map((x) => x.id), ['ok']);
  assert.deepStrictEqual(limpo(c.linhasInvalidas(linhas)), [
    { id: 'v', ploomes_status: 'ERRO', tentativas: 0, erro: 'deal_id inválido' },
    { id: 'x', ploomes_status: 'ERRO', tentativas: 2, erro: 'deal_id inválido' },
    { id: 'z', ploomes_status: 'ERRO', tentativas: 0, erro: 'deal_id inválido' },
  ]);
});

test('montarRegistro: ContactId so quando numerico positivo', () => {
  const l = L('a', 'q');
  assert.strictEqual(limpo(c.montarRegistro(l, '12')).ContactId, 12);
  for (const ruim of ['abc', -3, NaN]) assert.ok(!('ContactId' in limpo(c.montarRegistro(l, ruim))));
});

test('respostaOk: so 2xx', () => {
  for (const s of [200, 201, 299, '204']) assert.ok(c.respostaOk(s));
  for (const s of [199, 300, 404, 429, 500, undefined, null]) assert.ok(!c.respostaOk(s));
});

test('resultadoEnvio: 429 so sinaliza a propria linha; as outras seguem', () => {
  const l = L('a', 'q');
  assert.deepStrictEqual(limpo(c.resultadoEnvio(l, { status: 429, body: {} })), { parar: true });
  assert.strictEqual(limpo(c.resultadoEnvio(l, { status: 201, body: { Id: 1 } })).ploomes_status, 'ENVIADO');
});

test('decidirContato: pula so em 429/5xx; outros nao-2xx seguem sem ContactId', () => {
  for (const s of [429, 500, 503, '502']) assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: s })), { pular: true, contactId: null });
  assert.deepStrictEqual(limpo(c.decidirContato(undefined)), { pular: true, contactId: null });
  for (const s of [404, 400, 401]) assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: s })), { pular: false, contactId: null });
  assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: 200, body: { value: [{ ContactId: 12 }] } })), { pular: false, contactId: 12 });
  assert.deepStrictEqual(limpo(c.decidirContato({ statusCode: 200, body: { value: [] } })), { pular: false, contactId: null });
});
