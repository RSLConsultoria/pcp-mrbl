// Leitura e gravacao em lote (values:batchGet / values:append /
// values:batchUpdate) do workflow "PCP MRBL - API": src/planilhaLote.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const DOC = 'DOC1';
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/DOC1/values';

test('linhasDaAba: objetos por cabecalho, row_number da planilha, vazio = "", pula linha toda vazia', () => {
  const values = [
    ['id', 'qtd', 'obs', '', 'status'],
    ['a', 10, '', 'sem cabecalho', 'ABERTO'],
    [],
    ['', '', ''],
    ['b', 0],
    ['c', 2.5, 'x', '', false]
  ];
  assert.deepEqual(limpo(ctx.linhasDaAba(values)), [
    { row_number: 2, id: 'a', qtd: 10, obs: '', status: 'ABERTO' },
    { row_number: 5, id: 'b', qtd: 0, obs: '', status: '' },
    { row_number: 6, id: 'c', qtd: 2.5, obs: 'x', status: false }
  ]);
  assert.deepEqual(limpo(ctx.linhasDaAba([])), []);
  assert.deepEqual(limpo(ctx.linhasDaAba(undefined)), []);
  assert.deepEqual(limpo(ctx.linhasDaAba([['id', 'nome']])), []);
});

test('linhasDaAba: linha inicial diferente de 1 (range devolvido) desloca o row_number', () => {
  assert.deepEqual(limpo(ctx.linhasDaAba([['id'], ['a']], 3)), [{ row_number: 4, id: 'a' }]);
});

test('rangeDaAba: sempre entre aspas (abas com espaco), aspas internas dobradas', () => {
  assert.equal(ctx.rangeDaAba('CAIXAS GANHAS'), "'CAIXAS GANHAS'");
  assert.equal(ctx.rangeDaAba('FALTANTES', 'A1'), "'FALTANTES'!A1");
  assert.equal(ctx.rangeDaAba("D'X"), "'D''X'");
});

test('letraDaColuna: 0 = A, 25 = Z, 26 = AA, 701 = ZZ, 702 = AAA', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(ctx.letraDaColuna),
    ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
});

test('urlLeitura: batchGet com todas as abas, UNFORMATTED_VALUE e datas formatadas como o node Sheets', () => {
  const url = ctx.urlLeitura(DOC, ['FALTANTES', 'CAIXAS GANHAS', { aba: 'HISTORICO_APP', soCabecalho: true }]);
  assert.equal(url, BASE + ':batchGet?ranges=' + encodeURIComponent("'FALTANTES'") +
    '&ranges=' + encodeURIComponent("'CAIXAS GANHAS'") +
    '&ranges=' + encodeURIComponent("'HISTORICO_APP'!1:1") +
    '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING');
});

test('leituras do board e da acao', () => {
  assert.deepEqual(limpo(ctx.LEITURAS_BOARD), ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'HISTORICO_APP', 'USUARIOS',
    'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO']);
  assert.deepEqual(limpo(ctx.LEITURAS_ACAO), ['FALTANTES', 'CAIXAS_PCP', 'CAIXAS GANHAS', 'PEDIDOS', 'PEDIDOS_ITENS',
    'ETAPAS_PEDIDO', { aba: 'HISTORICO_APP', soCabecalho: true }]);
});

test('planilhaDoLote: casa valueRanges pela ordem pedida; linhas e cabecalhos por aba', () => {
  const resp = {
    spreadsheetId: DOC,
    valueRanges: [
      { range: "'CAIXAS GANHAS'!A1:Z1000", majorDimension: 'ROWS', values: [['deal_id', 'os'], [600001, '90001']] },
      { range: 'FALTANTES!A1:Z1000', majorDimension: 'ROWS' },
      { range: 'HISTORICO_APP!A1:M1', majorDimension: 'ROWS', values: [['id', 'quando']] }
    ]
  };
  const p = limpo(ctx.planilhaDoLote(resp, ['CAIXAS GANHAS', 'FALTANTES', { aba: 'HISTORICO_APP', soCabecalho: true }]));
  assert.deepEqual(p.linhas, {
    'CAIXAS GANHAS': [{ row_number: 2, deal_id: 600001, os: '90001' }],
    FALTANTES: [],
    HISTORICO_APP: []
  });
  assert.deepEqual(p.cabecalhos, { 'CAIXAS GANHAS': ['deal_id', 'os'], FALTANTES: [], HISTORICO_APP: ['id', 'quando'] });
  assert.deepEqual(p.linhaCabecalho, { 'CAIXAS GANHAS': 1, FALTANTES: 1, HISTORICO_APP: 1 });
});

test('planilhaDoLote: resposta sem a quantidade pedida de ranges falha', () => {
  assert.throws(() => ctx.planilhaDoLote({ valueRanges: [] }, ['FALTANTES']), /Leitura em lote/);
  assert.throws(() => ctx.planilhaDoLote(null, ['FALTANTES']), /Leitura em lote/);
});

// ---------- gravacao ----------

function planilha(abas) {
  const resp = { valueRanges: abas.map((a) => ({ range: a[0] + '!A1:Z9', values: a[1] })) };
  return ctx.planilhaDoLote(resp, abas.map((a) => a[0]));
}

const PLAN = () => planilha([
  ['FALTANTES', [['id', 'os', 'qtd_baixada', 'atualizado_em_app'], ['a', '9', '', ''], ['b', '9', 4, '']]],
  ['CAIXAS_PCP', [['deal_id', 'os', 'responsavel', 'tratativa', 'atualizado_em'], [600001, '9', 'Ana', '', '']]],
  ['PEDIDOS', [['id', 'etapa', 'pai', 'atualizado_em'], ['PED-0001', 'a_pedir', '', '']]],
  ['PEDIDOS_ITENS', [['id', 'pedido_id', 'qtd'], ['PED-0001|a', 'PED-0001', 10]]],
  ['ETAPAS_PEDIDO', [['id', 'nome', 'ordem'], ['a_pedir', 'A pedir', 1], ['entregue', 'Resolvido', 2]]],
  ['HISTORICO_APP', [['id', 'quando', 'texto', 'ploomes_status']]]
]);
const op = (aba, operacao, chave, linha) => ({ aba, operacao, chave, linha });
const req = (operacoes, historicos, p) => limpo(ctx.requisicoesDeEscrita(operacoes, historicos || [], p || PLAN(), DOC));

test('nada a gravar: lista vazia', () => {
  assert.deepEqual(req([], []), []);
});

test('F2 baixa: um batchUpdate so com as colunas da operacao (sem a chave), depois o HISTORICO_APP', () => {
  const r = req([op('FALTANTES', 'update', 'id', { id: 'b', qtd_baixada: 6, atualizado_em_app: 'T' })],
    [{ id: 'h1', quando: 'T', texto: 'Baixa', ploomes_status: 'PENDENTE' }]);
  assert.deepEqual(r, [
    {
      method: 'POST', url: BASE + ':batchUpdate',
      body: { valueInputOption: 'RAW', data: [{ range: "'FALTANTES'!C3:D3", values: [[6, 'T']] }] }
    },
    {
      method: 'POST',
      url: BASE + '/' + encodeURIComponent("'HISTORICO_APP'!A1") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      body: { values: [['h1', 'T', 'Baixa', 'PENDENTE']] }
    }
  ]);
});

// A coluna de casamento nao e regravada (um deal_id numerico nao vira texto).
test('casamento da chave por texto (numero lido x texto da operacao); null vira ""', () => {
  const r = req([op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', { deal_id: '600001', tratativa: null, atualizado_em: 'T' })]);
  assert.deepEqual(r, [{
    method: 'POST', url: BASE + ':batchUpdate',
    body: { valueInputOption: 'RAW', data: [{ range: "'CAIXAS_PCP'!D2:E2", values: [['', 'T']] }] }
  }]);
});

test('appendOrUpdate sem linha vira append (antes do batchUpdate), na ordem do cabecalho', () => {
  const r = req([
    op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 1 }),
    op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', { deal_id: '700', os: '7', atualizado_em: 'T' })
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].url, BASE + '/' + encodeURIComponent("'CAIXAS_PCP'!A1") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS');
  assert.deepEqual(r[0].body, { values: [['700', '7', '', '', 'T']] });
  assert.equal(r[1].url, BASE + ':batchUpdate');
});

test('ordem: PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, CAIXAS_PCP (append) -> batchUpdate -> HISTORICO_APP', () => {
  const r = req([
    op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 1 }),
    op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', { deal_id: '700' }),
    op('ETAPAS_PEDIDO', 'appendOrUpdate', 'id', { id: 'novo', nome: 'Novo', ordem: 3 }),
    op('PEDIDOS_ITENS', 'append', 'id', { id: 'PED-0002|a', pedido_id: 'PED-0002', qtd: 2 }),
    op('PEDIDOS', 'append', 'id', { id: 'PED-0002', etapa: 'a_pedir' }),
    op('PEDIDOS', 'update', 'id', { id: 'PED-0001', etapa: 'entregue' })
  ], [{ id: 'h1' }]);
  const abas = r.map((x) => /values\/([^:]+):append/.exec(x.url) ? decodeURIComponent(/values\/([^:]+):append/.exec(x.url)[1]) : 'batchUpdate');
  assert.deepEqual(abas, ["'PEDIDOS'!A1", "'PEDIDOS_ITENS'!A1", "'ETAPAS_PEDIDO'!A1", "'CAIXAS_PCP'!A1", 'batchUpdate', "'HISTORICO_APP'!A1"]);
  assert.deepEqual(r[4].body.data.map((d) => d.range), ["'FALTANTES'!C2", "'PEDIDOS'!B2"]);
});

test('varias linhas na mesma aba: um append com todas, na ordem das operacoes', () => {
  const r = req([
    op('PEDIDOS_ITENS', 'append', 'id', { id: 'x|a', qtd: 1 }),
    op('PEDIDOS_ITENS', 'append', 'id', { id: 'x|b', qtd: 2 })
  ], [{ id: 'h1' }, { id: 'h2', texto: 'b' }]);
  assert.deepEqual(r[0].body.values, [['x|a', '', 1], ['x|b', '', 2]]);
  assert.deepEqual(r[1].body.values, [['h1', '', '', ''], ['h2', '', 'b', '']]);
});

test('mesma linha em varias operacoes: junta, a ultima vence', () => {
  const r = req([
    op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 1, atualizado_em_app: 'T1' }),
    op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 3 }),
    op('ETAPAS_PEDIDO', 'appendOrUpdate', 'id', { id: 'n', nome: 'N', ordem: 3 }),
    op('ETAPAS_PEDIDO', 'update', 'id', { id: 'n', ordem: 4 }),
    op('PEDIDOS', 'append', 'id', { id: 'PED-0003', etapa: 'a_pedir' }),
    op('PEDIDOS', 'update', 'id', { id: 'PED-0003', etapa: 'solicitado' })
  ]);
  assert.deepEqual(r[0].body.values, [['PED-0003', 'solicitado', '', '']]);
  assert.deepEqual(r[1].body.values, [['n', 'N', 4]]);
  assert.deepEqual(r[2].body.data, [
    { range: "'FALTANTES'!C2:D2", values: [[3, 'T1']] }
  ]);
});

test('campo sem coluna: cabecalho novo na proxima coluna livre, gravado antes de tudo', () => {
  const r = req([
    op('PEDIDOS', 'update', 'id', { id: 'PED-0001', nova: 'x' }),
    op('PEDIDOS', 'append', 'id', { id: 'PED-0009', outra: 'y', nova: 'z' })
  ], [{ id: 'h1', extra: 'e' }]);
  assert.deepEqual(r[0], {
    method: 'POST', url: BASE + ':batchUpdate',
    body: {
      valueInputOption: 'RAW',
      data: [
        { range: "'PEDIDOS'!E1:F1", values: [['nova', 'outra']] },
        { range: "'HISTORICO_APP'!E1", values: [['extra']] }
      ]
    }
  });
  assert.deepEqual(r[1].body.values, [['PED-0009', '', '', '', 'z', 'y']]);
  assert.deepEqual(r[2].body.data, [{ range: "'PEDIDOS'!E2", values: [['x']] }]);
  assert.deepEqual(r[3].body.values, [['h1', '', '', '', 'e']]);
});

test('aba sem cabecalho nenhum: as colunas da operacao viram o cabecalho', () => {
  const p = planilha([['CAIXAS_PCP', []], ['HISTORICO_APP', [['id']]]]);
  const r = req([op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', { deal_id: '1', os: '2' })], [], p);
  assert.deepEqual(r[0].body.data, [{ range: "'CAIXAS_PCP'!A1:B1", values: [['deal_id', 'os']] }]);
  assert.deepEqual(r[1].body.values, [['1', '2']]);
});

test('update sem linha, operacao desconhecida, sem chave ou aba nao lida: falha antes de qualquer requisicao', () => {
  const falha = (ops, re) => assert.throws(() => req(ops, [{ id: 'h' }]), re);
  falha([op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 1 }), op('FALTANTES', 'update', 'id', { id: 'zz', qtd_baixada: 1 })], /não encontrada.*FALTANTES.*zz/);
  falha([op('OUTRA', 'update', 'id', { id: 'a' })], /sem destino/);
  falha([op('PEDIDOS', 'appendOrUpdate', 'id', { id: 'a' })], /sem destino/);
  falha([op('CAIXAS_PCP', 'appendOrUpdate', 'id', { id: 'a' })], /sem destino/);
  falha([op('FALTANTES', 'update', 'id', { qtd_baixada: 1 })], /sem chave/);
  falha([op('PEDIDOS', 'append', 'id', {})], /sem linha/);
  const semHist = planilha([['FALTANTES', [['id'], ['a']]]]);
  assert.throws(() => req([], [{ id: 'h' }], semHist), /não lida.*HISTORICO_APP/);
});

test('acao real: processarAcao (gerar_pedido) -> requisicoes', () => {
  const crypto = require('crypto');
  const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);
  const U = [{ email: 'l@x.com', nome: 'Lucca', perfil: 'adm', senha_hash: ctx.gerarHash(crypto, 'senha-forte-123'), ativo: 'SIM' }];
  const e = {};
  const tok = ctx.processarLogin(crypto, e, { email: 'l@x.com', senha: 'senha-forte-123' }, U, T0).body.token;
  const p = planilha([
    ['FALTANTES', [['id', 'os', 'deal_id', 'ciclo', 'descricao_item', 'unidade', 'qtd_falta', 'qtd_baixada', 'status', 'atualizado_em_app', 'responsavel'],
      ['a', '90001', 600001, 'PEDIDO', 'VIÉS', 'MT', 100, '', 'ABERTO', '', '']]],
    ['CAIXAS_PCP', [['deal_id']]], ['CAIXAS GANHAS', [['deal_id']]],
    ['PEDIDOS', [['id', 'etapa', 'origem', 'quem', 'local', 'previsao', 'responsavel', 'criado_em', 'criado_por', 'baixado_em', 'atualizado_em', 'pai']]],
    ['PEDIDOS_ITENS', [['id', 'pedido_id', 'item_id', 'deal_id', 'os', 'nome', 'un', 'qtd', 'fornecedor', 'previsao']]],
    ['ETAPAS_PEDIDO', [['id', 'nome', 'ordem']]],
    ['HISTORICO_APP', [['id', 'quando', 'usuario', 'email', 'deal_id', 'os', 'item_id', 'acao', 'texto', 'ploomes_status', 'ploomes_id', 'tentativas', 'erro']]]
  ]);
  const linhas = {
    faltantes: p.linhas.FALTANTES, caixasPcp: p.linhas.CAIXAS_PCP, ganhas: p.linhas['CAIXAS GANHAS'],
    pedidos: p.linhas.PEDIDOS, pedidosItens: p.linhas.PEDIDOS_ITENS, etapas: p.linhas.ETAPAS_PEDIDO
  };
  let n = 0;
  const saida = ctx.processarAcao(e, 'Bearer ' + tok, {
    tipo: 'gerar_pedido', itens: [{ itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '' }],
    origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: ''
  }, linhas, T0, () => 'id-' + (++n));
  assert.equal(saida.status, 200, JSON.stringify(saida.body));
  const r = limpo(ctx.requisicoesDeEscrita(saida.operacoes, saida.historicos, p, DOC));
  assert.deepEqual(r.map((x) => decodeURIComponent(x.url.replace(BASE, ''))),
    ["/'PEDIDOS'!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      "/'PEDIDOS_ITENS'!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      "/'HISTORICO_APP'!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"]);
  assert.equal(r[1].body.values[0][7], 20);
  assert.equal(r[2].body.values.length, saida.historicos.length);
});
