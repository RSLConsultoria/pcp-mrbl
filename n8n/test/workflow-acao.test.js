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
  const ranges = escritas[0].body.data.map((d) => d.range);
  assert.ok(ranges.every((r) => r.startsWith("'FALTANTES'!") && /3(:|$)/.test(r)), ranges.join());
  assert.deepEqual(escritas[0].body.data.find((d) => d.range.startsWith("'FALTANTES'!H")).values, [[6]]);
  assert.equal(escritas[1].body.values[0][0], proc.historicos[0].id);
});

test('F2 coluna da caixa sem linha em CAIXAS_PCP: append antes do historico', () => {
  const { escritas } = acao({ tipo: 'obs_caixa', dealId: '600001', valor: 'oi', versao: '' });
  assert.deepEqual(escritas.map(alvo), ["'CAIXAS_PCP'!A1", "'HISTORICO_APP'!A1"]);
});

test('F3 gerar_pedido: PEDIDOS, PEDIDOS_ITENS e historico, nessa ordem', () => {
  const { proc, escritas } = acao({
    tipo: 'gerar_pedido',
    itens: [{ itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '' }, { itemId: 'b', dealId: '600001', qtd: 6, fornecedor: 'X' }],
    origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: ''
  });
  assert.equal(proc.status, 200, JSON.stringify(proc.body));
  assert.deepEqual(escritas.map(alvo), ["'PEDIDOS'!A1", "'PEDIDOS_ITENS'!A1", "'HISTORICO_APP'!A1"]);
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
      vr('PEDIDOS', [['id']]), vr('PEDIDOS_ITENS', [['id']]), vr('ETAPAS_PEDIDO', [['id', 'nome', 'ordem']])
    ]
  };
  const [saida] = rodarNode('montar-board', { $: cifrao({ 'Ler Planilha': [leitura] }), $getWorkflowStaticData: () => s.estado });
  assert.equal(saida.json.status, 200);
  assert.deepEqual(saida.json.body.usuarios, ['Lucca']);
  assert.equal(saida.json.body.caixas.length, 1);
  assert.equal(saida.json.body.caixas[0].itens.length, 2);
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
    'Tem Escritas?', 'Loop Escritas', 'Gravar Lote', 'Responder Acao', 'Ler USUARIOS']) {
    assert.ok(nomes.includes(n), n);
  }
  assert.ok(!/Filtrar |Tem PEDIDOS|Incluir |Atualizar |Ler FALTANTES|Ler CAIXAS/.test(sdk));
  assert.equal(blocos(sdk).filter((b) => b.txt.includes("type: 'n8n-nodes-base.googleSheets'")).length, 1);
});

test('pcp-api.sdk.js: HTTP da planilha com credencial googleApi e retry 3x / 3 s', () => {
  const sdk = lerSdk('pcp-api.sdk.js');
  const google = blocos(sdk).filter((b) => /type: 'n8n-nodes-base\.(httpRequest|googleSheets)'/.test(b.txt));
  assert.deepEqual(google.map((b) => b.nome).sort(), ['Gravar Lote', 'Ler Planilha', 'Ler Planilha Acao', 'Ler USUARIOS']);
  google.forEach((b) => {
    assert.ok(/retryOnFail: true,\s+maxTries: 3,\s+waitBetweenTries: 3000,/.test(b.txt), b.nome);
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
