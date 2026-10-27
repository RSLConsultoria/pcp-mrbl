// F5c · E-mails do PCP: board (emailsPcp) e ação decidir_email_pcp. Dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const ISO = '2026-10-27T12:00:00.000Z';

function contexto() {
  const ctx = carregar();
  const estado = {};
  const U = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'PCP', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-123' }, U, T0);
  return { ctx, estado, cab: 'Bearer ' + r.body.token };
}

const falta = (id, dealId, nome, o) => Object.assign({ row_number: 2, id, deal_id: dealId, os: '90001', ciclo: 'PEDIDO', secao: dealId === '700011' ? 'ACABAMENTO' : 'COSTURA',
  descricao_item: nome, cor: '', unidade: 'UN', qtd_necessaria: 40, qtd_separada: 0, qtd_falta: 40, qtd_baixada: 0, status: 'ABERTO',
  previsao: '', atualizado_em_app: 'v-' + id, registrado_em: '2026-10-20' }, o);
const FALTANTES = [
  falta('F-1', '700001', 'ZIPER METAL 18CM'),
  falta('F-2', '700001', 'BOTAO MADREPEROLA', { row_number: 3, status: 'RESOLVIDO', qtd_baixada: 40 }),
  falta('F-3', '700011', 'LINHA 120', { row_number: 4 }),
  falta('F-9', '700002', 'OUTRA OS', { row_number: 5, os: '90002' })
];
const email = (o) => Object.assign({ row_number: 2, id: 'G1', thread_id: 'T1', quando: '2026-10-27T10:00:00.000Z', de_nome: 'Pessoa Um',
  assunto: 'RE: Caixa separada - OS:90001', os: '90001', modelo: 'CAIXA_SEPARADA', texto: 'O zíper chega dia 30/10.', tipo: 'PREVISAO',
  valor: '2026-10-30', itens: 'F-1', resumo: 'Zíper chega 30/10', evidencia: 'chega dia 30/10', confianca: 0.9, status: 'PENDENTE',
  tentativas: 1, decidido_em: '', decidido_por: '' }, o);
const linhas = (emails, extra) => Object.assign({ faltantes: FALTANTES, ganhas: [], caixasPcp: [], emailsPcp: emails }, extra);
const corpo = (o) => Object.assign({ tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }, o);
const hist = (id, dealId, texto) => ({ id, quando: ISO, usuario: 'Pessoa PCP', email: 'pcp@teste.local', deal_id: dealId, os: '90001', item_id: '',
  acao: 'EMAIL_PCP_ACEITA', texto, ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '' });
const marca = (status) => ({ aba: 'EMAILS_PCP', operacao: 'update', chave: 'id', linha: { id: 'G1', status, decidido_em: ISO, decidido_por: 'Pessoa PCP' } });

test('board: emailsPcp com as pendentes e as decididas nos últimos 7 dias, mais novas primeiro', () => {
  const { ctx } = contexto();
  const rows = [
    email({ id: 'A', quando: '2026-10-26T10:00:00.000Z' }),
    email({ id: 'B', quando: '2026-10-27T09:00:00.000Z', status: 'ACEITA', decidido_em: '2026-10-21T12:00:00.000Z' }),
    email({ id: 'C', status: 'IGNORADA', decidido_em: '2026-10-19T12:00:00.000Z' }),
    email({ id: 'D', status: 'ERRO' }),
    email({ id: 'E', quando: '2026-09-20T10:00:00.000Z' }),
    email({ id: 'A', status: 'IGNORADA' })
  ];
  const b = limpo(ctx.emailsPcpBoard(rows, T0));
  assert.deepEqual(b.map((e) => e.id), ['B', 'A']);
  assert.deepEqual(b[1], { id: 'A', quando: '2026-10-26T10:00:00.000Z', de: 'Pessoa Um', assunto: 'RE: Caixa separada - OS:90001', os: '90001',
    modelo: 'CAIXA_SEPARADA', texto: 'O zíper chega dia 30/10.', tipo: 'PREVISAO', valor: '2026-10-30', itens: ['F-1'], resumo: 'Zíper chega 30/10',
    evidencia: 'chega dia 30/10', confianca: 0.9, status: 'PENDENTE' });
  const board = limpo(ctx.montarRespostaBoard({}, FALTANTES, [], T0, { emailsPcp: rows }).body);
  assert.deepEqual(board.emailsPcp.map((e) => e.id), ['B', 'A']);
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [], [], T0, {}).body.emailsPcp), []);
});

test('caixas da sugestão: os deals dos itens; sem itens, as caixas da OS com falta; sem falta, todas', () => {
  const { ctx } = contexto();
  const caixas = [
    { dealId: '700001', os: '90001', itens: [{ id: 'F-1', status: 'ABERTO', resta: 4 }] },
    { dealId: '700011', os: '90001', itens: [{ id: 'F-3', status: 'RESOLVIDO', resta: 0 }] },
    { dealId: '700002', os: '90002', itens: [] }
  ];
  assert.deepEqual(limpo(ctx.dealsAlvoEmailPcp({ os: '90001', itens: ['F-3'] }, caixas)), ['700011']);
  assert.deepEqual(limpo(ctx.dealsAlvoEmailPcp({ os: '90001', itens: [] }, caixas)), ['700001']);
  assert.deepEqual(limpo(ctx.dealsAlvoEmailPcp({ os: '90002', itens: [] }, caixas)), ['700002']);
  assert.deepEqual(limpo(ctx.dealsAlvoEmailPcp({ os: '90003', itens: [] }, caixas)), []);
});

test('aceitar PREVISAO com item: grava a previsão no item pela regra da ação de previsão e anota no histórico', () => {
  const { ctx, estado, cab } = contexto();
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo(), T0)), { ok: true });
  const r = limpo(ctx.processarAcao(estado, cab, corpo({ versao: 'qualquer' }), linhas([email()]), T0, () => 'H-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'F-1', previsao: '2026-10-30', atualizado_em_app: ISO } },
    marca('ACEITA')
  ]);
  assert.deepEqual(r.historicos, [hist('H-1', '700001', 'Pessoa PCP aceitou sugestão do e-mail: previsão 30/10 para ZIPER METAL 18CM')]);
  assert.equal(r.body.emailId, 'G1');
  assert.equal(r.ploomes, null);
  assert.equal(r.gravacao, null);
});

test('aceitar PREVISAO sem item: previsão geral de cada caixa da OS com falta', () => {
  const { ctx, estado, cab } = contexto();
  const cp = [{ row_number: 2, deal_id: '700011', os: '90001', responsavel: 'Pessoa Dois', previsao: '', observacao: '', atualizado_em: 'v-cp' }];
  let n = 0;
  const r = limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ itens: '' })], { caixasPcp: cp }), T0, () => 'H-' + ++n));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [
    { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id', linha: { deal_id: '700001', os: '90001', responsavel: '', previsao: '2026-10-30', atualizado_em: ISO } },
    { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id', linha: { deal_id: '700011', os: '90001', previsao: '2026-10-30', atualizado_em: ISO } },
    marca('ACEITA')
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['700001', 'Pessoa PCP aceitou sugestão do e-mail: previsão 30/10 para a caixa'],
    ['700011', 'Pessoa PCP aceitou sugestão do e-mail: previsão 30/10 para a caixa']
  ]);
});

test('aceitar QUANTIDADE, CHAMADO e OBSERVACAO: só anotação no histórico da caixa', () => {
  const { ctx, estado, cab } = contexto();
  const casos = [
    [email({ tipo: 'QUANTIDADE', valor: '38', itens: 'F-1' }), [['700001', 'Pessoa PCP aceitou sugestão do e-mail: quantidade conferida de ZIPER METAL 18CM: 38 UN']]],
    [email({ tipo: 'CHAMADO', valor: '1234567', itens: '' }), [['700001', 'Pessoa PCP aceitou sugestão do e-mail: chamado #1234567'], ['700011', 'Pessoa PCP aceitou sugestão do e-mail: chamado #1234567']]],
    [email({ tipo: 'OBSERVACAO', valor: '', itens: '', resumo: 'Pediram para conferir a quantidade' }), [['700001', 'Pessoa PCP aceitou sugestão do e-mail: Pediram para conferir a quantidade'], ['700011', 'Pessoa PCP aceitou sugestão do e-mail: Pediram para conferir a quantidade']]]
  ];
  for (const [e, esperado] of casos) {
    const r = limpo(ctx.processarAcao(estado, cab, corpo(), linhas([e]), T0, () => 'H'));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.operacoes, [marca('ACEITA')], e.tipo);
    assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), esperado, e.tipo);
    assert.ok(r.historicos.every((h) => h.acao === 'EMAIL_PCP_ACEITA'));
  }
});

test('ignorar só marca IGNORADA; mesma decisão de novo não grava; decisão contrária dá 409', () => {
  const { ctx, estado, cab } = contexto();
  const r = limpo(ctx.processarAcao(estado, cab, corpo({ decisao: 'IGNORAR' }), linhas([email()]), T0, () => 'H'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [marca('IGNORADA')]);
  assert.deepEqual(r.historicos, []);
  const de_novo = limpo(ctx.processarAcao(estado, cab, corpo({ decisao: 'IGNORAR' }), linhas([email({ status: 'IGNORADA' })]), T0, () => 'H'));
  assert.equal(de_novo.status, 200);
  assert.deepEqual(de_novo.operacoes, []);
  assert.deepEqual(de_novo.historicos, []);
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ status: 'IGNORADA' })]), T0, () => 'H')),
    { status: 409, body: { erro: 'Esta sugestão já foi decidida.' } });
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ status: 'ERRO' })]), T0, () => 'H')),
    { status: 409, body: { erro: 'Esta sugestão já foi decidida.' } });
});

test('validações, sessão e itens que sumiram', () => {
  const { ctx, estado, cab } = contexto();
  for (const [c, erro] of [[corpo({ decisao: 'TALVEZ' }), 'Decisão inválida.'], [corpo({ id: '' }), 'Sugestão não informada.']]) {
    assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, c, T0)), { ok: false, status: 400, body: { erro } });
    assert.deepEqual(limpo(ctx.processarAcao(estado, cab, c, linhas([email()]), T0, () => 'H')), { status: 400, body: { erro } });
  }
  assert.equal(ctx.preValidarAcao(estado, 'Bearer x', corpo(), T0).status, 401);
  assert.equal(ctx.processarAcao(estado, 'Bearer x', corpo(), linhas([email()]), T0, () => 'H').status, 401);
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ id: 'NADA' }), linhas([email()]), T0, () => 'H')),
    { status: 404, body: { erro: 'Sugestão não encontrada.' } });
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ itens: 'F-SUMIU' })]), T0, () => 'H')),
    { status: 409, body: { erro: 'Os itens da sugestão não estão mais na caixa. Atualize a página.' } });
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ os: '90009', itens: '' })]), T0, () => 'H')),
    { status: 404, body: { erro: 'Nenhuma caixa desta OS no app.' } });
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ valor: '30/10' })]), T0, () => 'H')),
    { status: 400, body: { erro: 'Data da sugestão inválida.' } });
});

test('allowlist: só caixas de DEALS_EDITAVEIS até o go-live (lista vazia = todas)', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_EDITAVEIS = ['700001'];
  assert.equal(ctx.processarAcao(estado, cab, corpo(), linhas([email()]), T0, () => 'H').status, 200);
  // Sem itens a sugestão vale para 700001 e 700011: uma fora da lista recusa tudo.
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo(), linhas([email({ tipo: 'CHAMADO', valor: '123', itens: '' })]), T0, () => 'H')),
    { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
  assert.equal(ctx.processarAcao(estado, cab, corpo({ decisao: 'IGNORAR' }), linhas([email({ itens: 'F-3' })]), T0, () => 'H').status, 403);
  // OS sem caixa: ignorar só com a lista vazia.
  assert.equal(ctx.processarAcao(estado, cab, corpo({ decisao: 'IGNORAR' }), linhas([email({ os: '90009', itens: '' })]), T0, () => 'H').status, 403);
  ctx.DEALS_EDITAVEIS = [];
  assert.equal(ctx.processarAcao(estado, cab, corpo({ decisao: 'IGNORAR' }), linhas([email({ os: '90009', itens: '' })]), T0, () => 'H').status, 200);
  const real = carregar({ real: true });
  assert.ok(real.DEALS_EDITAVEIS.length > 0, 'até o go-live a lista real não é vazia');
});

test('planilha: a ação lê EMAILS_PCP e grava o status por id', () => {
  const { ctx } = contexto();
  assert.ok(ctx.LEITURAS_BOARD.includes('EMAILS_PCP'));
  assert.ok(ctx.LEITURAS_ACAO.includes('EMAILS_PCP'));
  assert.ok(ctx.DESTINOS_ESCRITA.some((d) => d.aba === 'EMAILS_PCP' && d.operacao === 'update' && d.chave === 'id'));
});

test('Montar Escritas: o aceite vira um batchUpdate (FALTANTES e EMAILS_PCP) e o append do histórico', () => {
  const { ctx, estado, cab } = contexto();
  const r = ctx.processarAcao(estado, cab, corpo(), linhas([email()]), T0, () => 'H-1');
  const planilha = {
    linhas: { FALTANTES: FALTANTES, EMAILS_PCP: [email()] },
    cabecalhos: { FALTANTES: Object.keys(FALTANTES[0]).filter((k) => k !== 'row_number'), EMAILS_PCP: limpo(ctx.COLUNAS_EMAILS_PCP),
      HISTORICO_APP: ['id', 'quando', 'usuario', 'email', 'deal_id', 'os', 'item_id', 'acao', 'texto', 'ploomes_status', 'ploomes_id', 'tentativas', 'erro'] },
    linhaCabecalho: { FALTANTES: 1, EMAILS_PCP: 1, HISTORICO_APP: 1 },
    ultimaLinha: { FALTANTES: 5, EMAILS_PCP: 2, HISTORICO_APP: null }
  };
  const reqs = limpo(ctx.requisicoesDeEscrita(r.operacoes, r.historicos, planilha, 'PLANILHA'));
  assert.equal(reqs.length, 2);
  assert.match(reqs[0].url, /values:batchUpdate$/);
  assert.deepEqual(reqs[0].body.data.map((d) => d.range), ["'FALTANTES'!N2:O2", "'EMAILS_PCP'!O2", "'EMAILS_PCP'!Q2:R2"]);
  assert.match(reqs[1].url, /HISTORICO_APP'!A1:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/);
});
