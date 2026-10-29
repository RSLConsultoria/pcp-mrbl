// F5c · workflows "PCP MRBL - Ler E-mails do PCP" e "PCP MRBL - Intérprete E-mail do PCP (Groq)":
// estrutura, ligações, Gmail só leitura e os adaptadores rodando com dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, carregar, limpo } = require('./carregar');
const { IDS_SUBWORKFLOWS, idSubworkflowValido } = require('../scripts/ids-subworkflows');
const { ID_CREDENCIAL_GROQ, ID_CREDENCIAL_GMAIL, idCredencialValido } = require('../scripts/credenciais');

const RAIZ = path.join(__dirname, '..');
const ler = () => converter(path.join(RAIZ, 'workflows', 'pcp-emails.sdk.js'));
const interprete = () => converter(path.join(RAIZ, 'workflows', 'pcp-interprete-email.sdk.js'));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);
const DOMINIO = 'confeccao-exemplo.com.br';

function rodarAdaptador(arq, entrada, nodes) {
  const ctx = vm.createContext({ require, $input: { first: () => ({ json: entrada }), all: () => [{ json: entrada }] },
    $: (nome) => { if (!nodes || !(nome in nodes)) throw new Error('node inesperado: ' + nome); const itens = nodes[nome].map((json) => ({ json })); return { first: () => itens[0], all: () => itens }; } });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
const lote = carregar();
const CAB = lote.COLUNAS_EMAILS_PCP.slice();
const leitura = (linhasEmail) => ({ valueRanges: [
  vr('EMAILS_PCP', [CAB, ...(linhasEmail || [])]),
  vr('FALTANTES', [['id', 'deal_id', 'os', 'ciclo', 'secao', 'descricao_item', 'unidade', 'qtd_falta', 'qtd_baixada', 'status'],
    ['F-1', '700001', '90001', 'PEDIDO', 'COSTURA', 'ZIPER METAL 18CM', 'UN', 40, 0, 'ABERTO']]),
  vr('CAIXAS GANHAS', [['deal_id', 'os']])
] });
const b64 = (t) => Buffer.from(t, 'utf8').toString('base64url');
// Mensagem fictícia no formato bruto da Gmail API (users.messages.get?format=full).
const gmail = { id: 'G1', threadId: 'T1', internalDate: '1793100000000', payload: { mimeType: 'multipart/alternative',
  headers: [{ name: 'From', value: 'Pessoa Um <pessoa.um@' + DOMINIO + '>' }, { name: 'Subject', value: 'RE: Caixa separada - OS:90001' },
    { name: 'Date', value: 'Tue, 27 Oct 2026 09:30:00 -0300' }],
  parts: [{ mimeType: 'text/plain', body: { data: b64('O zíper chega dia 30/10.\nAtenciosamente,\nPessoa Um') } }] } };
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

test('Ler E-mails do PCP: agendado a cada 10 min, Config com o marcador do domínio e a ordem dos nós', () => {
  const w = ler();
  assert.equal(w.name, 'PCP MRBL - Ler E-mails do PCP');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.equal(w.settings.saveDataErrorExecution, 'none');
  assert.deepEqual(no(w, 'A cada 10 minutos').parameters.rule.interval, [{ field: 'minutes', minutesInterval: 10 }]);
  assert.deepEqual(no(w, 'Config').parameters.assignments.assignments, [{ id: 'dominio', name: 'dominio', value: 'CONFIGURAR_DOMINIO', type: 'string' }]);
  const cadeia = ['A cada 10 minutos', 'Config', 'Montar Busca', 'Buscar E-mails', 'Separar E-mails', 'Tem E-mails?', 'Ler E-mail', 'Ler Planilha E-mails', 'Selecionar E-mails', 'Gravar Reservas',
    'Montar Pedidos de Interpretação', 'Interpretar E-mail', 'Reler E-mails', 'Finalizar E-mails', 'Gravar Interpretações'];
  // Interpretar E-mail também alimenta o aviso de limite do Groq (groq-limite.test.js).
  const seguintes = (n) => destinos(w, n).filter((d) => d !== 'Montar Aviso Limite Groq');
  for (let i = 0; i < cadeia.length - 1; i++) assert.deepEqual(seguintes(cadeia[i]), [cadeia[i + 1]], cadeia[i]);
  // Sem e-mail novo (falso) segue direto para a planilha: as linhas ERRO ainda voltam ao intérprete.
  assert.deepEqual(destinos(w, 'Tem E-mails?', 1), ['Ler Planilha E-mails']);
  for (const n of ['Buscar E-mails', 'Ler E-mail', 'Ler Planilha E-mails', 'Selecionar E-mails', 'Gravar Reservas', 'Montar Pedidos de Interpretação', 'Reler E-mails', 'Finalizar E-mails', 'Gravar Interpretações']) {
    assert.deepEqual(destinos(w, n, 1), ['Montar Erro E-mails'], n);
  }
  assert.deepEqual(destinos(w, 'Montar Erro E-mails'), ['Registrar Erro E-mails']);
  assert.equal(no(w, 'Ler Planilha E-mails').parameters.url, lote.urlLeitura(lote.PLANILHA_ID, ['EMAILS_PCP', 'FALTANTES', 'CAIXAS GANHAS']));
  assert.equal(no(w, 'Reler E-mails').parameters.url, lote.urlLeitura(lote.PLANILHA_ID, ['EMAILS_PCP']));
  // Reserva (append) sem retry; o batchUpdate das interpretações pode repetir.
  assert.equal(no(w, 'Gravar Reservas').retryOnFail, undefined);
  assert.equal(no(w, 'Gravar Interpretações').retryOnFail, true);
});

test('Ler E-mails do PCP: Gmail só leitura pela API (GET em messages e messages/{id}) com OAuth2 genérica gmail.readonly', () => {
  const w = ler();
  // Nenhum nó nativo do Gmail (a credencial gmailOAuth2 vem com escopos de envio e modificação).
  assert.deepEqual(w.nodes.filter((n) => /gmail/i.test(n.type)), []);
  const tipos = w.nodes.map((n) => n.type);
  for (const proibido of ['emailSend', 'gmail', 'microsoftOutlook', 'emailReadImap', 'evolution']) {
    assert.ok(!tipos.some((t) => t.toLowerCase().includes(proibido.toLowerCase())), proibido);
  }
  const buscar = no(w, 'Buscar E-mails');
  const lerUm = no(w, 'Ler E-mail');
  for (const g of [buscar, lerUm]) {
    assert.equal(g.type, 'n8n-nodes-base.httpRequest', g.name);
    assert.equal(g.parameters.method, 'GET', g.name);
    assert.equal(g.parameters.authentication, 'predefinedCredentialType', g.name);
    assert.equal(g.parameters.nodeCredentialType, 'oAuth2Api', g.name);
    assert.deepEqual(Object.keys(g.credentials), ['oAuth2Api'], g.name);
    assert.equal(g.credentials.oAuth2Api.id, ID_CREDENCIAL_GMAIL, g.name);
    assert.ok(!g.parameters.sendBody, g.name);
  }
  assert.ok(idCredencialValido(ID_CREDENCIAL_GMAIL));
  assert.equal(buscar.parameters.url, GMAIL_API);
  assert.equal(buscar.executeOnce, true);
  assert.deepEqual(buscar.parameters.queryParameters.parameters, [{ name: 'q', value: '={{ $json.q }}' }, { name: 'maxResults', value: '50' }]);
  assert.equal(lerUm.parameters.url, '=' + GMAIL_API + '/{{ $json.id }}');
  assert.deepEqual(lerUm.parameters.queryParameters.parameters, [{ name: 'format', value: 'full' }]);
  // Tudo que fala com o Gmail: só GET, só nos caminhos messages e messages/{id}; o resto é a planilha.
  const http = w.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
  for (const n of http) {
    const p = JSON.stringify(n.parameters);
    if (/gmail/i.test(p)) {
      assert.ok([buscar.name, lerUm.name].includes(n.name), n.name);
      assert.ok([GMAIL_API, '=' + GMAIL_API + '/{{ $json.id }}'].includes(n.parameters.url), n.name);
      assert.ok(!/send|trash|modify|delete|batch|import|insert|drafts|labels|watch|stop/i.test(n.parameters.url), n.name);
    } else {
      assert.equal(n.parameters.nodeCredentialType, 'googleApi', n.name);
      assert.match(n.parameters.url, /sheets\.googleapis\.com|\$json\.url/, n.name);
    }
  }
  const disparo = no(w, 'Interpretar E-mail');
  assert.equal(disparo.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(disparo.parameters.workflowId.value, IDS_SUBWORKFLOWS.INTERPRETE_EMAIL);
  assert.ok(idSubworkflowValido(disparo.parameters.workflowId.value));
  assert.equal(disparo.parameters.mode, 'each');
  assert.equal(disparo.onError, 'continueRegularOutput');
});

test('Separar E-mails: um item por id; lista vazia segue sem e-mail', () => {
  assert.deepEqual(rodarAdaptador('separar-emails-pcp', { messages: [{ id: 'G1', threadId: 'T1' }, { id: 'G2', threadId: 'T1' }] }),
    [{ json: { id: 'G1' } }, { json: { id: 'G2' } }]);
  assert.deepEqual(rodarAdaptador('separar-emails-pcp', { resultSizeEstimate: 0 }), [{ json: { semEmails: true } }]);
});

test('repositório público: nenhum endereço de e-mail além do remetente do Ploomes nos workflows gerados', () => {
  for (const arq of fs.readdirSync(path.join(RAIZ, 'workflows', 'json'))) {
    const txt = fs.readFileSync(path.join(RAIZ, 'workflows', 'json', arq), 'utf8');
    const enderecos = [...new Set((txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []))];
    assert.deepEqual(enderecos.filter((e) => e !== 'noreply@ploomes.com'), [], arq);
  }
  const src = fs.readFileSync(path.join(RAIZ, 'src', 'emailsPcp.js'), 'utf8');
  assert.ok(!/@[a-z0-9-]+\.com\.br/i.test(src));
});

test('Intérprete E-mail do PCP (Groq): recebe o contexto, chama o Groq e devolve a interpretação', () => {
  const w = interprete();
  assert.equal(w.name, 'PCP MRBL - Intérprete E-mail do PCP (Groq)');
  assert.deepEqual(destinos(w, 'Receber Contexto'), ['Montar Pedido Groq']);
  assert.deepEqual(destinos(w, 'Montar Pedido Groq'), ['Chamar Groq']);
  assert.deepEqual(destinos(w, 'Chamar Groq'), ['Devolver Interpretação']);
  const groq = no(w, 'Chamar Groq');
  assert.equal(groq.parameters.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(groq.parameters.nodeCredentialType, 'groqApi');
  assert.equal(groq.credentials.groqApi.id, ID_CREDENCIAL_GROQ);
  const [pedido] = rodarAdaptador('montar-pedido-groq-email-pcp', { emailId: 'G1', texto: 'Chega dia 30/10.', itensAbertos: [] });
  assert.equal(pedido.json.emailId, 'G1');
  assert.equal(pedido.json.corpo.model, 'openai/gpt-oss-20b');
  const [volta] = rodarAdaptador('devolver-interpretacao-email-pcp', { choices: [{ message: { content: '{"tipo":"OBSERVACAO"}' } }] },
    { 'Montar Pedido Groq': [pedido.json] });
  assert.deepEqual(volta.json, { emailId: 'G1', interpretacao: { tipo: 'OBSERVACAO' } });
});

test('Montar Busca: sem domínio configurado o workflow para', () => {
  assert.throws(() => rodarAdaptador('montar-busca-emails-pcp', {}, { Config: [{ dominio: 'CONFIGURAR_DOMINIO' }] }), /Configure o domínio/);
  assert.deepEqual(rodarAdaptador('montar-busca-emails-pcp', {}, { Config: [{ dominio: DOMINIO }] }),
    [{ json: { q: 'from:(@' + DOMINIO + ') subject:"OS:" -from:noreply@ploomes.com newer_than:7d' } }]);
});

test('Selecionar → Montar Pedidos → Finalizar: reserva, pedido ao intérprete e PENDENTE', () => {
  const sel = rodarAdaptador('selecionar-emails-pcp', {}, {
    Config: [{ dominio: DOMINIO }], 'Ler E-mail': [gmail, {}], 'Ler Planilha E-mails': [leitura()]
  });
  assert.equal(sel.length, 1);
  assert.match(sel[0].json.url, /EMAILS_PCP'!A2:append/);
  assert.equal(sel[0].json.body.values[0][0], 'G1');
  assert.equal(sel[0].json.body.values[0][7], 'O zíper chega dia 30/10.');
  const pedidos = rodarAdaptador('montar-pedidos-emails-pcp', {}, { 'Selecionar E-mails': sel.map((i) => i.json), 'Gravar Reservas': [{}] });
  // Reserva gravada só em parte: nada vai ao intérprete.
  assert.deepEqual(rodarAdaptador('montar-pedidos-emails-pcp', {}, { 'Selecionar E-mails': [sel[0].json, sel[0].json], 'Gravar Reservas': [{}] }), []);
  assert.deepEqual(pedidos.map((p) => p.json.emailId), ['G1']);
  const relida = leitura([['G1', 'T1', '2026-10-27T12:30:00.000Z', 'Pessoa Um', 'RE: Caixa separada - OS:90001', '90001', 'CAIXA_SEPARADA',
    'O zíper chega dia 30/10.', '', '', '', '', '', '', 'ERRO', 1, '', '']]);
  relida.valueRanges = relida.valueRanges.slice(0, 1);
  const fim = rodarAdaptador('finalizar-emails-pcp', {}, {
    'Montar Pedidos de Interpretação': pedidos.map((p) => p.json),
    'Interpretar E-mail': [{ emailId: 'G1', interpretacao: { tipo: 'PREVISAO', valor: '30/10', itens: ['ZIPER METAL 18CM'], resumo: 'Zíper chega 30/10', evidencia: 'chega dia 30/10', confianca: 0.9 } }],
    'Reler E-mails': [relida]
  });
  assert.equal(fim.length, 1);
  assert.match(fim[0].json.url, /values:batchUpdate$/);
  assert.deepEqual(fim[0].json.body.data, [{ range: "'EMAILS_PCP'!I2:O2", values: [['PREVISAO', '2026-10-30', 'F-1', 'Zíper chega 30/10', 'chega dia 30/10', 0.9, 'PENDENTE']] }]);
  // Falha do intérprete: nada a gravar (a linha segue ERRO para a próxima rodada).
  assert.deepEqual(rodarAdaptador('finalizar-emails-pcp', {}, {
    'Montar Pedidos de Interpretação': pedidos.map((p) => p.json), 'Interpretar E-mail': [{ error: 'Groq fora do ar' }], 'Reler E-mails': [relida]
  }), []);
  // Nada novo: nenhum item (o workflow para sem gravar).
  assert.deepEqual(rodarAdaptador('selecionar-emails-pcp', {}, {
    Config: [{ dominio: DOMINIO }], 'Ler E-mail': [{}], 'Ler Planilha E-mails': [leitura()]
  }), []);
  // Nenhum e-mail na busca: o Ler E-mail nem roda (o $() dele falha) e a rodada segue com as linhas ERRO.
  const comErro = leitura([['G0', 'T0', '2026-10-27T10:00:00.000Z', 'Pessoa Dois', 'RE: Caixa separada - OS:90001', '90001', 'CAIXA_SEPARADA',
    'Chamado aberto #1234567', '', '', '', '', '', '', 'ERRO', 1, '', '']]);
  const semBusca = rodarAdaptador('selecionar-emails-pcp', {}, { Config: [{ dominio: DOMINIO }], 'Ler Planilha E-mails': [comErro] });
  assert.equal(semBusca.length, 1);
  assert.deepEqual(semBusca[0].json.pedidos.map((p) => p.emailId), ['G0']);
});

test('Montar Erro E-mails: linha no ERROS_APP sem texto nem remetente', () => {
  const [erro] = rodarAdaptador('montar-erro-emails-pcp', {}, {});
  assert.match(erro.json.url, /ERROS_APP/);
  assert.equal(erro.json.body.values[0][2], 'EMAILS_PCP_LER');
  assert.ok(!JSON.stringify(erro.json).includes('@'));
});
