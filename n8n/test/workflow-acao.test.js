// Ramos board e acao do workflow "PCP MRBL - API" com leitura/gravacao em
// lote: roda o texto dos Code nodes (src/ + adaptador, como o build monta)
// num vm com um $ falso, e confere o SDK gerado.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ARQUIVOS, limpo } = require('./carregar');

const RAIZ = path.join(__dirname, '..');

// Executa o Code node "arq" (todos os src/ + adaptadores/<arq>.js) com os globais dados.
function rodarNode(arq, globais) {
  const ctx = vm.createContext(Object.assign({ require }, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  ctx.DEALS_EDITAVEIS = [];
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

// $ falso: cada nome devolve os itens dados.
function cifrao(nodes) {
  return (nome) => {
    if (!(nome in nodes)) throw new Error('node inesperado: ' + nome);
    const itens = nodes[nome].map((json) => ({ json }));
    return { first: () => itens[0], all: () => itens };
  };
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
const CAB_FALT = ['id', 'os', 'deal_id', 'ciclo', 'descricao_item', 'unidade', 'qtd_falta', 'qtd_baixada', 'status', 'atualizado_em_app', 'responsavel'];
const FALT = [CAB_FALT,
  ['a', '90001', 600001, 'PEDIDO', 'VIÉS', 'MT', 100, '', 'ABERTO', '', ''],
  ['b', '90001', 600001, 'PEDIDO', 'ZÍPER', 'UN', 10, 4, 'ABERTO', '', '']];
const CAB_HIST = ['id', 'quando', 'usuario', 'email', 'deal_id', 'os', 'item_id', 'acao', 'texto', 'ploomes_status', 'ploomes_id', 'tentativas', 'erro'];
const LEITURA_ACAO = {
  spreadsheetId: 'x',
  valueRanges: [
    vr('FALTANTES', FALT),
    vr('CAIXAS_PCP', [['deal_id', 'os', 'responsavel', 'previsao', 'observacao', 'atualizado_em', 'tratativa', 'tratativa_em']]),
    vr('CAIXAS GANHAS', [['deal_id', 'os']]),
    vr('PEDIDOS', [['id', 'etapa', 'origem', 'quem', 'local', 'previsao', 'responsavel', 'criado_em', 'criado_por', 'baixado_em', 'atualizado_em', 'pai']]),
    vr('PEDIDOS_ITENS', [['id', 'pedido_id', 'item_id', 'deal_id', 'os', 'nome', 'un', 'qtd', 'fornecedor', 'previsao']]),
    vr('ETAPAS_PEDIDO', [['id', 'nome', 'ordem']]),
    vr('PRODUCAO', [
      ['deal_id', 'os', 'oficina_id', 'oficina_nome', 'data_combinada', 'atualizado_em_ploomes'],
      ['600001', '90001', '', 'ALOCAR', '2026-10-18', '']
    ]),
    vr('OFICINAS', [['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em']]),
    vr('WHATSAPP_MENSAGENS', [['id', 'evolution_id', 'deal_id', 'oficina_id']]),
    vr('WHATSAPP_SUGESTOES', [['id', 'mensagem_id', 'deal_id', 'os', 'tipo', 'valor', 'resumo', 'status', 'versao']]),
    { range: "'HISTORICO_APP'!A1:M1", majorDimension: 'ROWS', values: [CAB_HIST] }
  ]
};

const T0 = Date.now();
function sessao() {
  const estado = {};
  const ctx = vm.createContext({});
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx);
  const U = [{ email: 'l@x.com', nome: 'Lucca', perfil: 'adm', senha_hash: ctx.gerarHash(crypto, 'senha-forte-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'l@x.com', senha: 'senha-forte-123' }, U, T0);
  return { estado, cab: 'Bearer ' + r.body.token };
}

function acao(corpo) {
  const s = sessao();
  const $ = cifrao({ Acao: [{ headers: { authorization: s.cab }, body: corpo }], 'Ler Planilha Acao': [LEITURA_ACAO] });
  const [proc] = rodarNode('processar-acao', { $, $getWorkflowStaticData: () => s.estado });
  const escritas = rodarNode('montar-escritas', {
    $: cifrao({ 'Processar Acao': [proc.json], 'Ler Planilha Acao': [LEITURA_ACAO] })
  });
  return { proc: proc.json, escritas: escritas.map((i) => i.json) };
}

const URL_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww/values';
const alvo = (e) => (e.url.endsWith(':batchUpdate') ? 'batchUpdate' : decodeURIComponent(/values\/([^:]+):append/.exec(e.url)[1]));

test('F2 baixa: Processar Acao le do lote; Montar Escritas = batchUpdate em FALTANTES + append no historico', () => {
  const { proc, escritas } = acao({ tipo: 'baixa', dealId: '600001', itemId: 'b', valor: 2, versao: '' });
  assert.equal(proc.status, 200, JSON.stringify(proc.body));
  assert.deepEqual(escritas.map(alvo), ['batchUpdate', "'HISTORICO_APP'!A1"]);
  assert.ok(escritas.every((e) => e.method === 'POST' && e.url.startsWith(URL_BASE) && e.vazio === false));
  assert.deepEqual(escritas.map((e) => [e.passo, e.de]), [[1, 2], [2, 2]]);
  // so o batchUpdate (idempotente) pode ser repetido; append repetido duplicaria linhas
  assert.deepEqual(escritas.map((e) => e.repetir), [true, false]);
  const ranges = escritas[0].body.data.map((d) => d.range);
  assert.ok(ranges.every((r) => r.startsWith("'FALTANTES'!") && /3(:|$)/.test(r)), ranges.join());
  assert.deepEqual(escritas[0].body.data.find((d) => d.range.startsWith("'FALTANTES'!H")).values, [[6]]);
  assert.equal(escritas[1].body.values[0][0], proc.historicos[0].id);
  // HISTORICO_APP lido so pelo cabecalho: INSERT_ROWS (nunca sobrescreve linha depois de um buraco)
  assert.ok(escritas[1].url.endsWith('insertDataOption=INSERT_ROWS'), escritas[1].url);
});

test('F2 coluna da caixa sem linha em CAIXAS_PCP: append antes do historico', () => {
  const { escritas } = acao({ tipo: 'obs_caixa', dealId: '600001', valor: 'oi', versao: '' });
  assert.deepEqual(escritas.map(alvo), ["'CAIXAS_PCP'!A2", "'HISTORICO_APP'!A1"]);
});

test('F3 gerar_pedido: PEDIDOS, PEDIDOS_ITENS e historico, nessa ordem', () => {
  const { proc, escritas } = acao({
    tipo: 'gerar_pedido',
    itens: [{ itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '' }, { itemId: 'b', dealId: '600001', qtd: 6, fornecedor: 'X' }],
    origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: 'Gi'
  });
  assert.equal(proc.status, 200, JSON.stringify(proc.body));
  assert.deepEqual(escritas.map(alvo), ["'PEDIDOS'!A2", "'PEDIDOS_ITENS'!A2", "'HISTORICO_APP'!A1"]);
  assert.equal(escritas[1].body.values.length, 2);
});

test('acao recusada ou sem nada a gravar: um item { vazio: true }', () => {
  const { proc, escritas } = acao({ tipo: 'baixa', dealId: '600001', itemId: 'zz', valor: 2, versao: '' });
  assert.equal(proc.status, 404);
  assert.deepEqual(escritas, [{ vazio: true }]);
  const nada = rodarNode('montar-escritas', {
    $: cifrao({ 'Processar Acao': [{ status: 200, operacoes: [], historicos: [] }], 'Ler Planilha Acao': [LEITURA_ACAO] })
  });
  assert.deepEqual(nada, [{ json: { vazio: true } }]);
});

test('alteracao de data monta PATCH do campo de data do Ploomes antes das escritas', () => {
  const { proc } = acao({ tipo: 'alterar_producao', dealId: '600001', dataCombinada: '2026-10-22', oficinaId: '', motivo: 'Prazo confirmado', versao: '' });
  const [patch] = rodarNode('montar-alteracao-ploomes', { $: cifrao({ 'Processar Acao': [proc] }) });
  assert.equal(patch.json.gravar, true);
  assert.equal(patch.json.url, 'https://public-api2.ploomes.com/Deals(600001)');
  assert.deepEqual(patch.json.registro, { OtherProperties: [{
    FieldKey: 'deal_E53BDEC3-F829-413D-9421-91D5D7411349',
    DateTimeValue: '2026-10-22T00:00:00-03:00'
  }] });
});

test('oficina é gravada no Ploomes no campo de usuário (UserValueId)', () => {
  const [patch] = rodarNode('montar-alteracao-ploomes', { $: cifrao({ 'Processar Acao': [{
    status: 200,
    ploomes: { dealId: '600001', campos: { 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4': '44' } }
  }] }) });
  assert.deepEqual(patch.json.registro, { OtherProperties: [{
    FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4',
    UserValueId: 44
  }] });
  const [alocar] = rodarNode('montar-alteracao-ploomes', { $: cifrao({ 'Processar Acao': [{
    status: 200,
    ploomes: { dealId: '600001', campos: { 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4': '' } }
  }] }) });
  assert.deepEqual(alocar.json.registro.OtherProperties, [{ FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', UserValueId: null }]);
});

test('acao sem alteracao no Ploomes pula o PATCH', () => {
  const [patch] = rodarNode('montar-alteracao-ploomes', {
    $: cifrao({ 'Processar Acao': [{ status: 200, ploomes: null }] })
  });
  assert.deepEqual(patch, { json: { gravar: false } });
});

test('limpar data combinada monta DateTimeValue nulo no mesmo campo do Ploomes', () => {
  const [patch] = rodarNode('montar-alteracao-ploomes', { $: cifrao({ 'Processar Acao': [{
    status: 200,
    ploomes: { dealId: '600001', campos: { 'deal_E53BDEC3-F829-413D-9421-91D5D7411349': '' } }
  }] }) });
  assert.deepEqual(patch.json.registro, { OtherProperties: [{
    FieldKey: 'deal_E53BDEC3-F829-413D-9421-91D5D7411349',
    DateTimeValue: null
  }] });
});

test('validacao do PATCH so libera a planilha para resposta 2xx', () => {
  const executar = (statusCode) => rodarNode('validar-alteracao-ploomes', { $input: { first: () => ({ json: { statusCode } }) } })[0].json;
  assert.equal(executar(204).ok, true);
  assert.equal(executar(400).ok, false);
  assert.match(executar(400).erro, /planilha nao foi alterada/);
  assert.equal(executar(undefined).ok, false);
});

test('Montar Escritas: update sem linha derruba o node antes de gravar', () => {
  assert.throws(() => rodarNode('montar-escritas', {
    $: cifrao({
      'Processar Acao': [{ status: 200, operacoes: [{ aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'zz', qtd_baixada: 1 } }], historicos: [] }],
      'Ler Planilha Acao': [LEITURA_ACAO]
    })
  }), /não encontrada/);
});

test('Montar Board: monta o board a partir do lote (mesmas linhas do node Sheets)', () => {
  const s = sessao();
  const leitura = {
    valueRanges: [
      vr('FALTANTES', FALT), vr('CAIXAS GANHAS', [['deal_id', 'os']]), vr('CAIXAS_PCP', []), vr('HISTORICO_APP', [CAB_HIST]),
      vr('USUARIOS', [['email', 'nome', 'perfil', 'senha_hash', 'ativo'], ['l@x.com', 'Lucca', 'ADM', 'h', 'SIM'], ['b@x.com', 'Bia', 'PCP', 'h', 'NAO']]),
      vr('PEDIDOS', [['id']]), vr('PEDIDOS_ITENS', [['id']]), vr('ETAPAS_PEDIDO', [['id', 'nome', 'ordem']]),
      vr('FORNECEDORES', [['id', 'nome', 'ativo'], ['f1', 'TECIDOS BETA', ''], ['f2', 'ANTIGO', 'NAO']]),
      { range: "'RESPONSAVEIS'!A1:Z1000", majorDimension: 'ROWS' }, // aba vazia: a API nao manda values
      vr('PRODUCAO', [['deal_id', 'em_costura']]), vr('OFICINAS', [['ploomes_id', 'nome']]),
      vr('WHATSAPP_MENSAGENS', [['id']]), vr('WHATSAPP_SUGESTOES', [['id']])
    ]
  };
  const [saida] = rodarNode('montar-board', { $: cifrao({ 'Ler Planilha': [leitura] }), $getWorkflowStaticData: () => s.estado });
  assert.equal(saida.json.status, 200);
  assert.deepEqual(saida.json.body.usuarios, ['Lucca']);
  assert.deepEqual(saida.json.body.fornecedores, ['TECIDOS BETA']);
  assert.deepEqual(saida.json.body.responsaveis, []);
  assert.equal(saida.json.body.caixas.length, 1);
  assert.equal(saida.json.body.caixas[0].itens.length, 2);
});

test('Limpar Cache: no fim das gravacoes apaga o cache do board (um board lido durante as gravacoes nao fica 55 s)', () => {
  const estado = { board: { corpo: { caixas: [] }, guardadoEm: T0 }, sessoes: {} };
  const saida = rodarNode('limpar-cache', { $getWorkflowStaticData: () => estado });
  assert.equal(estado.board, undefined);
  assert.deepEqual(saida, [{ json: { ok: true } }]);
});

test('Montar Erro: linha best-effort no ERROS_APP (sem retry) e a resposta 500 para o site; apaga o cache', () => {
  const s = sessao();
  s.estado.board = { corpo: {}, guardadoEm: T0 };
  const corpo = { tipo: 'baixa', dealId: '600001', itemId: 'b', valor: 2, versao: '' };
  const lote = { vazio: false, passo: 2, de: 3, method: 'POST', url: URL_BASE + ':batchUpdate', body: {}, repetir: true };
  const [saida] = rodarNode('montar-erro', {
    $: cifrao({ Acao: [{ headers: { authorization: s.cab }, body: corpo }], 'Processar Acao': [{ status: 200, historicos: [{ deal_id: '600001' }, { deal_id: '600001' }] }], 'Loop Escritas': [lote] }),
    $input: { first: () => ({ json: { error: { message: 'Quota exceeded for quota metric' } } }) },
    $getWorkflowStaticData: () => s.estado
  });
  const j = saida.json;
  assert.equal(j.method, 'POST');
  assert.equal(decodeURIComponent(j.url.replace(URL_BASE, '')), "/'ERROS_APP'!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
  assert.equal(j.body.values.length, 1);
  const [quando, usuario, tipo, deal, passo, url, erro] = j.body.values[0];
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(quando));
  assert.deepEqual([usuario, tipo, deal, passo, url, erro], ['Lucca', 'baixa', '600001', '2/3', URL_BASE + ':batchUpdate', 'Quota exceeded for quota metric']);
  assert.deepEqual(j.resposta, { erro: 'Falha ao gravar na planilha. Avise o PCP antes de tentar de novo.' });
  assert.equal(s.estado.board, undefined);
  // nunca grava senha nem o corpo da acao
  assert.ok(!JSON.stringify(j.body).includes('senha'));
});

test('Montar Erro: sem nada para ler (best-effort) ainda devolve a linha e a resposta, sem derrubar o node', () => {
  const [saida] = rodarNode('montar-erro', {
    $: () => { throw new Error('node nao executado'); },
    $input: { first: () => { throw new Error('sem entrada'); } },
    $getWorkflowStaticData: () => ({})
  });
  assert.equal(saida.json.body.values[0].length, 7);
  assert.equal(saida.json.resposta.erro, 'Falha ao gravar na planilha. Avise o PCP antes de tentar de novo.');
});

// ---------- SDK gerado ----------

function lerSdk(nome) {
  return fs.readFileSync(path.join(RAIZ, 'workflows', nome), 'utf8');
}
function blocos(sdk) {
  return sdk.split(/\nconst \w+ = /).slice(1).map((b) => ({ nome: (/name: '([^']+)'/.exec(b) || [])[1], txt: b }));
}

test('pcp-api.sdk.js: nodes do lote, sem Filtrar/Tem/Gravar por aba', () => {
  const sdk = lerSdk('pcp-api.sdk.js');
  const nomes = blocos(sdk).map((b) => b.nome);
  for (const n of ['Ler Planilha', 'Montar Board', 'Ler Planilha Acao', 'Processar Acao', 'Montar Escritas',
    'Montar Alteracao Ploomes', 'Tem Alteracao Ploomes?', 'Gravar Alteracao Ploomes', 'Validar Alteracao Ploomes',
    'Alteracao Ploomes OK?', 'Responder Falha Ploomes', 'Tem Escritas?', 'Loop Escritas', 'Gravar Lote', 'Responder Acao', 'Ler USUARIOS']) {
    assert.ok(nomes.includes(n), n);
  }
  assert.ok(!/Filtrar |Tem PEDIDOS|Incluir |Atualizar |Ler FALTANTES|Ler CAIXAS/.test(sdk));
  assert.equal(blocos(sdk).filter((b) => b.txt.includes("type: 'n8n-nodes-base.googleSheets'")).length, 1);
});

test('pcp-api.sdk.js: HTTP da planilha com credencial googleApi; retry 3x / 3 s so onde repetir nao duplica', () => {
  const sdk = lerSdk('pcp-api.sdk.js');
  const google = blocos(sdk).filter((b) => /type: 'n8n-nodes-base\.(httpRequest|googleSheets)'/.test(b.txt));
  assert.deepEqual(google.map((b) => b.nome).sort(), ['Gravar Alteracao Ploomes', 'Gravar Anexo', 'Gravar Erro', 'Gravar Lote', 'Ler Planilha', 'Ler Planilha Acao', 'Ler USUARIOS']);
  const COM_RETRY = ['Gravar Lote', 'Ler Planilha', 'Ler Planilha Acao', 'Ler USUARIOS'];
  google.forEach((b) => {
    assert.equal(/retryOnFail: true,\s+maxTries: 3,\s+waitBetweenTries: 3000,/.test(b.txt), COM_RETRY.includes(b.nome), b.nome);
    if (b.nome === 'Gravar Alteracao Ploomes') {
      assert.ok(b.txt.includes("httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' }"), b.nome);
      assert.ok(b.txt.includes("method: 'PATCH'") && b.txt.includes("url: expr('{{ $json.url }}')"), b.nome);
      return;
    }
    assert.ok(b.txt.includes("googleApi: { id: '72hvCT9jkADwOOo1', name: 'Google Sheets - MRBL' }"), b.nome);
    if (b.nome !== 'Ler USUARIOS') {
      assert.ok(b.txt.includes("authentication: 'predefinedCredentialType'") && b.txt.includes("nodeCredentialType: 'googleApi'"), b.nome);
    }
  });
  const ler = blocos(sdk).find((b) => b.nome === 'Ler Planilha').txt;
  assert.ok(ler.includes('valueRenderOption=UNFORMATTED_VALUE') && ler.includes('executeOnce: true'));
  const gravar = blocos(sdk).find((b) => b.nome === 'Gravar Lote').txt;
  assert.ok(gravar.includes("method: 'POST'") && gravar.includes("url: expr('{{ $json.url }}')"));
  assert.ok(gravar.includes("jsonBody: expr('{{ JSON.stringify($json.body) }}')"));
  const resp = blocos(sdk).find((b) => b.nome === 'Responder Acao').txt;
  assert.ok(resp.includes('executeOnce: true') && resp.includes("$('Processar Acao').first().json.body"));
  // falha de gravacao: saida de erro (sem salvar execucao com erro: o login traz a senha)
  const node = (n) => blocos(sdk).find((b) => b.nome === n).txt;
  assert.ok(node('Gravar Lote').includes("onError: 'continueErrorOutput'"));
  assert.ok(node('Gravar Anexo').includes("onError: 'continueErrorOutput'"));
  assert.ok(node('Gravar Erro').includes("onError: 'continueRegularOutput'"));
  assert.ok(sdk.indexOf("name: 'Gravar Alteracao Ploomes'") < sdk.indexOf("name: 'Montar Escritas'"));
  const rerr = node('Responder Erro');
  assert.ok(rerr.includes('executeOnce: true') && rerr.includes("$('Montar Erro').first().json.resposta") && rerr.includes('500'));
  assert.ok(sdk.includes("saveDataErrorExecution: 'none'"));
});

test('pcp-api-homolog.sdk.js: igual ao de producao, so nome, id e caminhos dos webhooks mudam', () => {
  const prod = lerSdk('pcp-api.sdk.js');
  const hom = lerSdk('pcp-api-homolog.sdk.js');
  assert.ok(hom.includes("workflow('pcp-mrbl-api-homolog', 'PCP MRBL - API (homolog)'"));
  for (const p of ['pcp-login', 'pcp-board', 'pcp-acao']) {
    assert.ok(prod.includes("path: '" + p + "'"));
    assert.ok(hom.includes("path: '" + p + "-h'"));
  }
  const normal = hom
    .replace("workflow('pcp-mrbl-api-homolog', 'PCP MRBL - API (homolog)'", "workflow('pcp-mrbl-api', 'PCP MRBL - API'")
    .replace(/path: '(pcp-\w+)-h'/g, "path: '$1'");
  assert.equal(normal, prod);
});

test('pcp-envio.sdk.js: sem retry (como antes)', () => {
  assert.ok(!lerSdk('pcp-envio.sdk.js').includes('retryOnFail'));
});
