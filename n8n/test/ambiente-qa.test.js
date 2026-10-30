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
