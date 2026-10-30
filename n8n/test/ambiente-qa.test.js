// Ambiente de QA com dados reais (spec 2026-10-30): os workflows de homologação leem e
// gravam só na planilha QA; a produção continua só na original.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { carregar } = require('./carregar');
const { PLANILHA_QA_ID, idPlanilhaQaValido } = require('../scripts/planilha-qa');
const { IDS_SUBWORKFLOWS } = require('../scripts/ids-subworkflows');

const JSON_DIR = path.join(__dirname, '..', 'workflows', 'json');
const ORIGINAL = carregar({ real: true }).PLANILHA_ID;
const ler = (arq) => fs.readFileSync(path.join(JSON_DIR, arq), 'utf8');
const wf = (arq) => JSON.parse(ler(arq));

const PRODUCAO = ['pcp-api.json', 'pcp-envio.json', 'pcp-emails.json', 'pcp-interpretar-whatsapp.json',
  'pcp-interprete-email.json', 'pcp-medias-previsao.json', 'pcp-producao-sync.json',
  'pcp-retentar-interpretacao.json', 'pcp-whatsapp-entrada.json', 'pcp-whatsapp-saida.json'];
const HOMOLOG = ['pcp-api-homolog.json', 'pcp-envio-homolog.json', 'pcp-whatsapp-saida-homolog.json',
  'pcp-whatsapp-entrada-homolog.json', 'pcp-interpretar-whatsapp-homolog.json',
  'pcp-retentar-interpretacao-homolog.json', 'pcp-emails-homolog.json'];

const codeNodes = (w) => w.nodes.filter((n) => n.type === 'n8n-nodes-base.code');

test('PLANILHA_QA_ID: marcador ou id válido, nunca a original', () => {
  assert.ok(idPlanilhaQaValido(PLANILHA_QA_ID));
  assert.notEqual(PLANILHA_QA_ID, ORIGINAL);
  assert.ok(idPlanilhaQaValido('CONFIGURAR_PLANILHA_QA'));
  assert.ok(!idPlanilhaQaValido('CONFIGURAR_OUTRA'));
  assert.ok(!idPlanilhaQaValido('abc'));
  assert.ok(!idPlanilhaQaValido('id com espaço e aspas \' qualquer'));
});

test('produção: só a original, nunca a QA, e MODO_QA desligado em todo Code node', () => {
  for (const arq of PRODUCAO) {
    const txt = ler(arq);
    assert.ok(!txt.includes(PLANILHA_QA_ID), arq + ' tem o id da QA');
    for (const n of codeNodes(wf(arq))) {
      assert.ok(n.parameters.jsCode.includes('var MODO_QA = false;'), arq + ' / ' + n.name);
      assert.ok(!n.parameters.jsCode.includes('var MODO_QA = true;'), arq + ' / ' + n.name);
    }
  }
  // As planilhas lidas/gravadas pela produção são a original.
  assert.ok(ler('pcp-api.json').includes(ORIGINAL));
  assert.ok(ler('pcp-envio.json').includes(ORIGINAL));
  assert.ok(ler('pcp-producao-sync.json').includes(ORIGINAL));
  assert.ok(ler('pcp-medias-previsao.json').includes(ORIGINAL));
});

test('homologação: só a QA (nenhuma menção à original) e MODO_QA ligado em todo Code node', () => {
  for (const arq of HOMOLOG) {
    const txt = ler(arq);
    assert.ok(!txt.includes(ORIGINAL), arq + ' tem o id da original');
    assert.ok(txt.includes(PLANILHA_QA_ID), arq + ' sem o id da QA');
    const w = wf(arq);
    assert.ok(codeNodes(w).length > 0, arq);
    for (const n of codeNodes(w)) {
      assert.ok(n.parameters.jsCode.includes('var MODO_QA = true;'), arq + ' / ' + n.name);
      assert.ok(n.parameters.jsCode.includes("var PLANILHA_ID = '" + PLANILHA_QA_ID + "';"), arq + ' / ' + n.name);
    }
    // Todo acesso ao Google Sheets aponta para a QA (URL fixa ou documentId).
    for (const n of w.nodes) {
      const url = n.parameters && typeof n.parameters.url === 'string' ? n.parameters.url : '';
      if (url.includes('sheets.googleapis.com')) assert.ok(url.includes(PLANILHA_QA_ID), arq + ' / ' + n.name);
      if (n.type === 'n8n-nodes-base.googleSheets') assert.equal(n.parameters.documentId.value, PLANILHA_QA_ID, arq + ' / ' + n.name);
    }
  }
});

test('homologação: chama o Interpretar WhatsApp de homologação, nunca o de produção', () => {
  assert.ok(IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP_HOMOLOG);
  assert.notEqual(IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP_HOMOLOG, IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP);
  let chamadas = 0;
  for (const arq of HOMOLOG) {
    for (const n of wf(arq).nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
      const id = n.parameters.workflowId.value;
      assert.notEqual(id, IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP, arq + ' / ' + n.name);
      if (/Interpreta(ção|r de Novo)$/.test(n.name) && n.name !== 'Interpretar com Modelo') {
        assert.equal(id, IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP_HOMOLOG, arq + ' / ' + n.name);
        chamadas++;
      }
    }
  }
  assert.equal(chamadas, 3);  // API homolog, Receber (homolog) e Retentar (homolog)
});

test('nomes de workflow e caminhos de webhook não se repetem', () => {
  const todos = fs.readdirSync(JSON_DIR).filter((f) => f.endsWith('.json'));
  for (const arq of PRODUCAO.concat(HOMOLOG)) assert.ok(todos.includes(arq), arq);
  const nomes = todos.map((f) => wf(f).name);
  assert.equal(new Set(nomes).size, nomes.length);
  const caminhos = [];
  todos.forEach((f) => wf(f).nodes.filter((n) => n.type === 'n8n-nodes-base.webhook').forEach((n) => caminhos.push(n.parameters.path)));
  assert.equal(new Set(caminhos).size, caminhos.length);
  for (const arq of HOMOLOG) assert.match(wf(arq).name, /\(homolog\)$/);
  const entradaH = wf('pcp-whatsapp-entrada-homolog.json').nodes.find((n) => n.name === 'Receber WhatsApp');
  assert.equal(entradaH.parameters.path, 'pcp-whatsapp-entrada-h-CONFIGURAR_SEGREDO');
});

// ---- Modo QA (tarefa 2): roda os Code nodes do JSON gerado, produção x homologação ----
const vm = require('vm');
const GRUPO_TESTE = '120363412994688161@g.us';
function rodarCode(arq, nome, nodes, entrada) {
  const n = wf(arq).nodes.find((x) => x.name === nome);
  assert.ok(n, arq + ' sem ' + nome);
  const itens = (l) => (l || []).map((json) => ({ json }));
  const ctx = vm.createContext({
    $: (nomeNode) => ({ first: () => itens(nodes[nomeNode])[0], all: () => itens(nodes[nomeNode]) }),
    $input: { all: () => itens(entrada), first: () => itens(entrada)[0] },
    $getWorkflowStaticData: () => ({})
  });
  return JSON.parse(JSON.stringify(vm.runInContext('(function () {\n' + n.parameters.jsCode + '\n})()', ctx)));
}

test('modo QA: allowlists vazias só na homologação', () => {
  const prod = carregar({ real: true });
  const qa = carregar({ real: true, qa: true });
  assert.ok(prod.DEALS_EDITAVEIS.length > 0);
  assert.ok(prod.DEALS_PRODUCAO_EDITAVEIS.length > 0);
  assert.equal(qa.DEALS_EDITAVEIS.length, 0);
  assert.equal(qa.DEALS_PRODUCAO_EDITAVEIS.length, 0);
  assert.equal(qa.PLANILHA_ID, PLANILHA_QA_ID);
  // Enviar ao Ploomes: qualquer deal sobe na homologação; na produção, só os de teste.
  const antigo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const linha = { id: 'h1', quando: antigo, deal_id: '700001', os: '90001', texto: 'Ana moveu PED-0001', ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '' };
  assert.equal(rodarCode('pcp-envio.json', 'Selecionar Envio', {}, [linha]).length, 0);
  const sel = rodarCode('pcp-envio-homolog.json', 'Selecionar Envio', {}, [linha]);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].json.grupo.deal_id, '700001');
});

test('modo QA: nenhum campo gravado no Ploomes (só planilha e histórico)', () => {
  const campo = carregar().CAMPO_OFICINA_PLOOMES;
  const nodes = { 'Processar Acao': [{ status: 200, ploomes: { dealId: '700001', campos: { [campo]: '123' } } }] };
  const prod = rodarCode('pcp-api.json', 'Montar Alteracao Ploomes', nodes, []);
  assert.equal(prod[0].json.gravar, true);
  const hom = rodarCode('pcp-api-homolog.json', 'Montar Alteracao Ploomes', nodes, []);
  assert.deepEqual(hom, [{ json: { gravar: false } }]);
});

test('modo QA: registro de interação com "TESTE · " e a Visão da peça continua reconhecendo', () => {
  const grupos = [{ grupo: { deal_id: '700001', os: '90001', linhas: [{ id: 'a', quando: '2026-10-30T12:00:00.000Z', texto: 'Ana deu baixa', tentativas: 0 }] } }];
  const contatos = [{ statusCode: 200, body: { value: [{ ContactId: 5 }] } }];
  const prod = rodarCode('pcp-envio.json', 'Montar Registro', { 'Selecionar Envio': grupos }, contatos);
  assert.ok(prod[0].json.registro.Content.startsWith('[PCP · OS 90001] Atualizações do app PCP\n'));
  const hom = rodarCode('pcp-envio-homolog.json', 'Montar Registro', { 'Selecionar Envio': grupos }, contatos);
  assert.ok(hom[0].json.registro.Content.startsWith('TESTE · [PCP · OS 90001] Atualizações do app PCP\n'));
  const c = carregar();
  assert.equal(c.registroDoAppPeca(hom[0].json.registro.Content), true);
  assert.equal(c.registroDoAppPeca('<p>TESTE · [PCP · OS 90001] Atualizações do app PCP</p>'), true);
  assert.equal(c.registroDoAppPeca('TESTE de costura combinado'), false);
});

test('modo QA: WhatsApp sempre no grupo de teste, com "[TESTE] " e sem citação de outro grupo', () => {
  const fila = [
    { id: 'WA-E-1', grupo_jid: '120000000000000001@g.us', texto: 'Bom dia, previsão da OS 90001?', resposta_a_evolution_id: 'EV-1' },
    { id: 'WA-R-1', evolution_id: 'EV-1', grupo_jid: '120000000000000001@g.us', texto: 'qual OS?', participante_jid: 'p@s.whatsapp.net' }
  ];
  const nodes = { 'Selecionar Saida WhatsApp': [fila[0]], 'Ler Fila WhatsApp': fila };
  const prod = rodarCode('pcp-whatsapp-saida.json', 'Montar Envio WhatsApp', nodes, []);
  assert.equal(prod[0].json.corpo.number, '120000000000000001@g.us');
  assert.equal(prod[0].json.corpo.text, 'Bom dia, previsão da OS 90001?');
  assert.ok(prod[0].json.corpo.quoted);
  const hom = rodarCode('pcp-whatsapp-saida-homolog.json', 'Montar Envio WhatsApp', nodes, []);
  assert.deepEqual(hom[0].json.corpo, { number: GRUPO_TESTE, text: '[TESTE] Bom dia, previsão da OS 90001?' });
  // Citação de mensagem do próprio grupo de teste: fica.
  const doTeste = fila.map((m) => Object.assign({}, m, { grupo_jid: GRUPO_TESTE }));
  const hom2 = rodarCode('pcp-whatsapp-saida-homolog.json', 'Montar Envio WhatsApp',
    { 'Selecionar Saida WhatsApp': [doTeste[0]], 'Ler Fila WhatsApp': doTeste }, []);
  assert.equal(hom2[0].json.corpo.number, GRUPO_TESTE);
  assert.equal(hom2[0].json.corpo.quoted.key.remoteJid, GRUPO_TESTE);
});

// ---- Utilitário - Recarregar QA (tarefa 3) ----
const ABAS_RECARGA = ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'USUARIOS', 'HISTORICO_APP', 'PEDIDOS', 'PEDIDOS_ITENS',
  'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS', 'ERROS_APP', 'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS',
  'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS', 'EMAILS_PCP'];
const ORIGEM_FICTICIA = 'ORIGEM_FICTICIA_1234567890abcdef';
function respostaOriginal() {
  return {
    spreadsheetId: ORIGEM_FICTICIA,
    valueRanges: ABAS_RECARGA.map((aba) => {
      if (aba === 'HISTORICO_APP') {
        return { range: "'HISTORICO_APP'!A1:F4", values: [['id', 'quando', 'deal_id', 'texto', 'ploomes_status', 'ploomes_id'],
          ['h1', '30/10/2026 10:00', 700001, 'Ana deu baixa', 'PENDENTE', ''],
          ['h2', '30/10/2026 10:01', 700001, 'Ana anotou', 'ENVIADO', 42],
          ['h3', '30/10/2026 10:02', 700002, 'Bia', 'ERRO', '']] };
      }
      if (aba === 'FORNECEDORES') return { range: "'FORNECEDORES'!A1:Z1000" };
      return { range: "'" + aba + "'!A1:B2", values: [['id', 'valor'], [aba + '-1', true]] };
    })
  };
}

test('recarga: lista de abas do app, limpeza e gravação só na QA', () => {
  const c = carregar({ qa: true });
  assert.deepEqual(JSON.parse(JSON.stringify(c.ABAS_RECARGA_QA)), ABAS_RECARGA);
  const limpar = c.requisicaoLimpezaQa(respostaOriginal());
  assert.equal(limpar.url, 'https://sheets.googleapis.com/v4/spreadsheets/' + PLANILHA_QA_ID + '/values:batchClear');
  assert.deepEqual(JSON.parse(JSON.stringify(limpar.body.ranges)), ABAS_RECARGA.map((a) => "'" + a + "'"));

  const agora = Date.parse('2026-10-30T13:05:00.000Z');
  const gravar = JSON.parse(JSON.stringify(c.requisicaoRecargaQa(respostaOriginal(), agora)));
  assert.equal(gravar.url, 'https://sheets.googleapis.com/v4/spreadsheets/' + PLANILHA_QA_ID + '/values:batchUpdate');
  assert.equal(gravar.body.valueInputOption, 'RAW');
  const porRange = {};
  gravar.body.data.forEach((d) => { porRange[d.range] = d.values; });
  // Aba vazia na original não entra (a limpeza já a deixou vazia).
  assert.ok(!("'FORNECEDORES'!A1" in porRange));
  assert.deepEqual(porRange["'FALTANTES'!A1"], [['id', 'valor'], ['FALTANTES-1', true]]);
  // Pendências do envio ao Ploomes não sobem de novo pela homologação.
  assert.deepEqual(porRange["'HISTORICO_APP'!A1"].map((l) => l[4]), ['ploomes_status', 'COPIADO_QA', 'ENVIADO', 'ERRO']);
  assert.deepEqual(porRange["'QA_CONTROLE'!A1:B2"], [['copiado_em', 'abas'], ['2026-10-30T13:05:00.000Z', 17]]);
  // A resposta original não é alterada.
  assert.equal(respostaOriginal().valueRanges[4].values[1][4], 'PENDENTE');
});

test('recarga: recusa fora do modo QA, origem igual ao destino e leitura incompleta', () => {
  assert.throws(() => carregar().requisicaoLimpezaQa(respostaOriginal()), /modo QA/);
  assert.throws(() => carregar().requisicaoRecargaQa(respostaOriginal(), Date.now()), /modo QA/);
  const c = carregar({ qa: true });
  const mesma = Object.assign(respostaOriginal(), { spreadsheetId: PLANILHA_QA_ID });
  assert.throws(() => c.requisicaoLimpezaQa(mesma), /original/);
  assert.throws(() => c.requisicaoRecargaQa(mesma, Date.now()), /original/);
  const curta = respostaOriginal();
  curta.valueRanges.pop();
  assert.throws(() => c.requisicaoLimpezaQa(curta), /abas/);
  assert.throws(() => c.requisicaoRecargaQa(curta, Date.now()), /abas/);
});

test('recarga (workflow gerado): só lê a original; nada grava nela', () => {
  const w = wf('pcp-recarregar-qa.json');
  assert.equal(w.name, 'Utilitário - Recarregar QA (manual)');
  assert.equal(w.nodes.filter((n) => n.type === 'n8n-nodes-base.manualTrigger').length, 1);
  assert.ok(!w.nodes.some((n) => /webhook|scheduleTrigger/.test(n.type)), 'só roda à mão');
  const comOriginal = w.nodes.filter((n) => JSON.stringify(n).includes(ORIGINAL));
  assert.deepEqual(comOriginal.map((n) => n.name), ['Ler Original']);
  const ler = comOriginal[0];
  assert.equal(ler.parameters.method, 'GET');
  assert.ok(ler.parameters.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/' + ORIGINAL + '/values:batchGet?'));
  assert.ok(!ler.parameters.sendBody);
  ABAS_RECARGA.forEach((a) => assert.ok(ler.parameters.url.includes('ranges=' + encodeURIComponent("'" + a + "'")), a));
  for (const n of codeNodes(w)) assert.ok(n.parameters.jsCode.includes('var MODO_QA = true;'), n.name);
  // As gravações saem dos Code nodes: URL na QA, montada no próprio workflow gerado.
  const limpar = rodarCode('pcp-recarregar-qa.json', 'Montar Limpeza', { 'Ler Original': [respostaOriginal()] }, []);
  const gravar = rodarCode('pcp-recarregar-qa.json', 'Montar Recarga', { 'Ler Original': [respostaOriginal()] }, []);
  for (const r of [limpar[0].json, gravar[0].json]) {
    assert.ok(r.url.includes(PLANILHA_QA_ID));
    assert.ok(!JSON.stringify(r).includes(ORIGINAL));
  }
  const destinos = (de) => ((w.connections[de] || {}).main || []).flat().map((c) => c.node);
  assert.deepEqual(destinos('Ler Original'), ['Montar Limpeza']);
  assert.deepEqual(destinos('Montar Limpeza'), ['Limpar QA']);
  assert.deepEqual(destinos('Limpar QA'), ['Montar Recarga']);
  assert.deepEqual(destinos('Montar Recarga'), ['Gravar QA']);
  for (const nome of ['Limpar QA', 'Gravar QA']) {
    const n = w.nodes.find((x) => x.name === nome);
    assert.equal(n.parameters.method, 'POST');
    assert.equal(n.parameters.url, '={{ $json.url }}');
  }
});

// ---- Faixa do site (tarefa 4): o board da API homolog traz qa.copiadoEm ----
test('board: só o modo QA lê a QA_CONTROLE e manda qa.copiadoEm', () => {
  const prod = carregar();
  const qa = carregar({ qa: true });
  assert.ok(!JSON.stringify(prod.LEITURAS_BOARD).includes('QA_CONTROLE'));
  assert.equal(qa.LEITURAS_BOARD[qa.LEITURAS_BOARD.length - 1], 'QA_CONTROLE');
  const controle = [{ row_number: 2, copiado_em: '2026-10-30T13:05:00.000Z', abas: 17 }];
  const agora = Date.parse('2026-10-30T14:00:00.000Z');
  assert.ok(!('qa' in prod.montarRespostaBoard({}, [], [], agora, { qaControle: controle }).body));
  assert.deepEqual(JSON.parse(JSON.stringify(qa.montarRespostaBoard({}, [], [], agora, { qaControle: controle }).body.qa)),
    { copiadoEm: '2026-10-30T13:05:00.000Z' });
  assert.deepEqual(JSON.parse(JSON.stringify(qa.montarRespostaBoard({}, [], [], agora, {}).body.qa)), { copiadoEm: '' });

  // No workflow gerado: o Montar Board da homolog lê a aba do lote; o de produção não tem a aba.
  assert.ok(!wf('pcp-api.json').nodes.find((n) => n.name === 'Ler Planilha').parameters.url.includes('QA_CONTROLE'));
  assert.ok(wf('pcp-api-homolog.json').nodes.find((n) => n.name === 'Ler Planilha').parameters.url.includes("ranges='QA_CONTROLE'"));
  const resposta = { valueRanges: qa.LEITURAS_BOARD.map((l) => {
    const aba = typeof l === 'string' ? l : l.aba;
    return aba === 'QA_CONTROLE'
      ? { range: "'QA_CONTROLE'!A1:B2", values: [['copiado_em', 'abas'], ['2026-10-30T13:05:00.000Z', 17]] }
      : { range: "'" + aba + "'!A1:Z1" };
  }) };
  const board = rodarCode('pcp-api-homolog.json', 'Montar Board', { 'Ler Planilha': [resposta] }, []);
  assert.deepEqual(board[0].json.body.qa, { copiadoEm: '2026-10-30T13:05:00.000Z' });
});
