const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { converter } = require('../scripts/sdk-para-json');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-whatsapp-entrada.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

test('workflow de entrada recebe o evento sem responder nem enviar ao grupo', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Receber WhatsApp');
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
  assert.equal(w.settings.saveDataErrorExecution, 'none');

  const webhook = no(w, 'Receber WhatsApp');
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.match(webhook.parameters.path, /CONFIGURAR_SEGREDO/);

  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest' && /sendText|evolution/i.test(String(n.parameters.url))));
  assert.ok(!w.nodes.some((n) => /responder grupo|enviar (ao|para|pela) whatsapp/i.test(n.name)));
});

test('workflow grava a mensagem antes de chamar o intérprete configurável', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Receber WhatsApp'), ['Ler Contexto WhatsApp']);
  assert.deepEqual(destinos(w, 'Ler Contexto WhatsApp'), ['Preparar Entrada WhatsApp']);
  assert.deepEqual(destinos(w, 'Preparar Entrada WhatsApp', 1), ['Montar Erro de Recepção']);
  assert.deepEqual(destinos(w, 'Preparar Entrada WhatsApp'), ['Gravar Mensagem?']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem?', 0), ['Gravar Mensagem Recebida']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem?', 1), ['Confirmar Recebimento']);
  assert.deepEqual(destinos(w, 'Gravar Mensagem Recebida'), ['Confirmar Recebimento']);
  assert.deepEqual(destinos(w, 'Confirmar Recebimento'), ['Precisa Interpretar?']);
  assert.deepEqual(destinos(w, 'Precisa Interpretar?', 0), ['Montar Contexto do Intérprete']);
  assert.deepEqual(destinos(w, 'Montar Contexto do Intérprete'), ['Interpretar com Modelo']);

  assert.equal(no(w, 'Gravar Mensagem Recebida').parameters.method, 'POST');
  assert.equal(no(w, 'Gravar Mensagem Recebida').retryOnFail, undefined);
  assert.equal(no(w, 'Interpretar com Modelo').type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(no(w, 'Interpretar com Modelo').parameters.workflowId.value, require('../scripts/ids-subworkflows').IDS_SUBWORKFLOWS.INTERPRETE);
  assert.equal(no(w, 'Interpretar com Modelo').parameters.options.waitForSubWorkflow, true);
  assert.equal(no(w, 'Confirmar Recebimento').parameters.options.responseCode, 200);
});

test('workflow valida a saída e registra somente erros resumidos', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Interpretar com Modelo'), ['Finalizar Entrada WhatsApp']);
  assert.deepEqual(destinos(w, 'Finalizar Entrada WhatsApp'), ['Tem Sugestão?']);
  assert.deepEqual(destinos(w, 'Tem Sugestão?', 0), ['Gravar Sugestão WhatsApp']);
  assert.equal(no(w, 'Gravar Sugestão WhatsApp').retryOnFail, undefined);

  const erro = no(w, 'Registrar Erro de Recepção');
  assert.equal(erro.parameters.method, 'POST');
  assert.equal(erro.parameters.url, '={{ $json.url }}');
  assert.match(no(w, 'Montar Erro de Recepção').parameters.jsCode, /ERROS_APP/);
  assert.doesNotMatch(no(w, 'Montar Erro de Recepção').parameters.jsCode, /payload.*linhaErroEntrada|texto.*linhaErroEntrada/);
  assert.equal(erro.onError, 'continueRegularOutput');
  assert.deepEqual(destinos(w, 'Registrar Erro de Recepção'), ['Solicitar Reentrega']);
  assert.equal(no(w, 'Solicitar Reentrega').parameters.options.responseCode, 503);
  assert.deepEqual(destinos(w, 'Registrar Erro de Interpretação'), []);
});

// ----- Contexto ampliado do intérprete (ajuste de 16/10) -----
const fs = require('node:fs');
const vm = require('node:vm');
const { ARQUIVOS, carregar, limpo } = require('./carregar');
const RAIZ = path.join(__dirname, '..');

function rodarAdaptador(arq, nodes) {
  const ctx = vm.createContext({ require });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  // Os dados dos testes são fictícios: a lista de deals liberados fica vazia (= todos).
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  ctx.$ = (nome) => {
    if (!(nome in nodes)) throw new Error('node inesperado: ' + nome);
    const itens = nodes[nome].map((json) => ({ json }));
    return { first: () => itens[0], all: () => itens };
  };
  ctx.$input = { first: () => ({ json: nodes.$input[0] }), all: () => nodes.$input.map((json) => ({ json })) };
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}

const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });
function leituraEntrada() {
  return { valueRanges: [
    vr('OFICINAS', [['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo'], ['of-1', 'OFICINA A', 'grupo-ficticio@g.us', 'GRUPO TESTE', 'SIM']]),
    vr('PRODUCAO', [['deal_id', 'os', 'oficina_id', 'oficina_nome', 'data_combinada', 'lead_time', 'pecas', 'peca', 'referencia', 'em_costura', 'atualizado_em_ploomes'],
      ['700001', '90001', 'of-1', 'OFICINA A', '2026-10-20', '', 160, 'PECA TESTE B', 'REF-02', 'SIM', 'v1']]),
    vr('WHATSAPP_MENSAGENS', [['id', 'evolution_id', 'quando', 'grupo_jid', 'grupo_nome', 'participante_jid', 'participante_nome', 'direcao', 'tipo', 'tipo_conteudo', 'texto',
      'resposta_a_evolution_id', 'deal_id', 'os', 'oficina_id', 'associacao', 'status_envio', 'erro', 'criado_em',
      'envio_tentativas', 'envio_proxima', 'interpretacao_status', 'interpretacao_tentativas', 'interpretacao_proxima'],
      ['WA-E-1', 'EV-1', '2026-10-13T12:00:00.000Z', 'grupo-ficticio@g.us', 'GRUPO TESTE', '', 'Pessoa PCP', 'ENVIADA', 'COBRANCA_PRAZO', 'TEXTO', 'Olá. A entrega de *PECA TESTE B* segue?',
      '', '700001', '90001', 'of-1', 'MANUAL', 'ENVIADA', '', '2026-10-13T12:00:00.000Z']]),
    vr('WHATSAPP_SUGESTOES', [['id', 'mensagem_id', 'deal_id', 'status']]),
    vr('FALTANTES', [['id', 'os', 'deal_id', 'secao', 'ciclo', 'descricao_item', 'unidade', 'qtd_falta', 'qtd_baixada', 'status'],
      ['f1', '90001', '700001', 'COSTURA', 'PEDIDO', 'VIÉS TESTE', 'MT', 4, '', 'ABERTO']]),
    vr('CAIXAS GANHAS', [['deal_id', 'os']])
  ] };
}

test('entrada lê também FALTANTES e CAIXAS GANHAS para o contexto do intérprete', () => {
  const lote = carregar();
  assert.deepEqual(limpo(lote.LEITURAS_WHATSAPP_ENTRADA), ['OFICINAS', 'PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'FALTANTES', 'CAIXAS GANHAS']);
  const url = no(workflow(), 'Ler Contexto WhatsApp').parameters.url;
  assert.equal(url, lote.urlLeitura(lote.PLANILHA_ID, lote.LEITURAS_WHATSAPP_ENTRADA));
});

test('Montar Contexto do Intérprete manda OS, faltas, conversa e instruções, sem JID nem participante', () => {
  const preparacao = {
    ok: true, precisaInterpretar: true, mensagemId: 'WA-R-abc', dealId: '700001', os: '90001', quando: '2026-10-13T13:20:00.000Z',
    contextoInterpretacao: { texto: 'Fica pronta dia 22.', quando: '2026-10-13T13:20:00.000Z', dealId: '700001', os: '90001', dataCombinada: '2026-10-20' }
  };
  const [saida] = rodarAdaptador('montar-contexto-interprete', {
    'Preparar Entrada WhatsApp': [{ preparacao }],
    'Ler Contexto WhatsApp': [leituraEntrada()],
    $input: [{}]
  });
  const j = saida.json;
  assert.equal(j.texto, 'Fica pronta dia 22.');
  assert.equal(j.os, '90001');
  assert.equal(j.peca, 'PECA TESTE B');
  assert.equal(j.pecas, 160);
  assert.equal(j.dataCombinada, '2026-10-20');
  assert.deepEqual(j.faltasCostura, { quantidade: 1, itens: ['VIÉS TESTE: falta 4 MT'] });
  assert.deepEqual(j.conversa, [{ direcao: 'ENVIADA', quando: '2026-10-13T12:00:00.000Z', texto: 'Olá. A entrega de *PECA TESTE B* segue?' }]);
  assert.match(j.instrucoes, /citam a peça/);
  assert.doesNotMatch(JSON.stringify(j), /@g\.us|Pessoa PCP|participante/);
});

test('Preparar Entrada WhatsApp continua aceitando a leitura com as abas novas', () => {
  const [saida] = rodarAdaptador('preparar-whatsapp-entrada', {
    'Receber WhatsApp': [{ body: {
      event: 'messages.upsert', instance: 'producao',
      data: { key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'EV-NOVO', participant: 'p@s.whatsapp.net' },
        pushName: 'Pessoa Teste', messageTimestamp: 1791897600, message: { extendedTextMessage: { text: 'Fica pronta dia 22.', contextInfo: { stanzaId: 'EV-1' } } } }
    } }],
    $input: [leituraEntrada()]
  });
  assert.equal(saida.json.gravar, true);
  assert.equal(saida.json.precisaInterpretar, true);
  assert.equal(saida.json.preparacao.dealId, '700001');
});

test('sem associação: chama o associador, grava a decisão e dispara a interpretação', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Precisa Interpretar?', 1), ['Precisa Associar?']);
  assert.deepEqual(destinos(w, 'Precisa Associar?', 0), ['Montar Contexto do Associador']);
  assert.deepEqual(destinos(w, 'Montar Contexto do Associador'), ['Associar com Modelo']);
  assert.deepEqual(destinos(w, 'Associar com Modelo'), ['Finalizar Associação']);
  assert.deepEqual(destinos(w, 'Associar com Modelo', 1), ['Montar Erro de Interpretação']);
  assert.deepEqual(destinos(w, 'Finalizar Associação', 1), ['Montar Erro de Interpretação']);
  assert.equal(no(w, 'Associar com Modelo').parameters.workflowId.value, require('../scripts/ids-subworkflows').IDS_SUBWORKFLOWS.ASSOCIADOR);
  assert.deepEqual(destinos(w, 'Finalizar Associação'), ['Gravar Associação']);
  assert.deepEqual(destinos(w, 'Gravar Associação'), ['Interpretar Associada?']);
  assert.deepEqual(destinos(w, 'Interpretar Associada?', 0), ['Montar Pedido de Interpretação (Entrada)']);
  assert.deepEqual(destinos(w, 'Montar Pedido de Interpretação (Entrada)'), ['Disparar Interpretação']);
  assert.match(no(w, 'Interpretar Associada?').parameters.conditions.conditions[0].leftValue, /Finalizar Associação/);
  const assoc = no(w, 'Associar com Modelo');
  assert.equal(assoc.parameters.options.waitForSubWorkflow, true);
  assert.equal(no(w, 'Disparar Interpretação').parameters.options.waitForSubWorkflow, false);
  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest' && /evolution/i.test(String(n.parameters.url))));
});

// QA de 23/10: o "Precisa Associar?" lê o campo no topo da saída do adaptador.
test('Preparar Entrada WhatsApp entrega precisaAssociar no topo quando nenhuma regra liga a mensagem', () => {
  const [saida] = rodarAdaptador('preparar-whatsapp-entrada', {
    'Receber WhatsApp': [{ body: {
      event: 'messages.upsert', instance: 'producao',
      data: { key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'EV-SEM-OS', participant: 'p@s.whatsapp.net' },
        pushName: 'Pessoa Teste', messageTimestamp: 1792700000, message: { conversation: 'a peça B sai dia 29' } }
    } }],
    $input: [leituraEntrada()]
  });
  assert.equal(saida.json.gravar, true);
  assert.equal(saida.json.precisaInterpretar, false);
  assert.equal(saida.json.precisaAssociar, true);
  assert.match(no(workflow(), 'Precisa Associar?').parameters.conditions.conditions[0].leftValue, /\.json\.precisaAssociar/);
});

// QA de 23/10: a mensagem é gravada DEPOIS da leitura; o Finalizar Associação
// precisa achar a linha dela pelo updatedRange da gravação.
test('Finalizar Associação atualiza a linha que a entrada acabou de gravar', () => {
  const leitura = leituraEntrada();
  const cab = leitura.valueRanges[2].values[0];
  cab.push('associacao_confianca', 'associacao_motivo', 'pergunta_candidatos', 'pergunta_mensagem_id', 'pergunta_fechada_em');
  const [preparada] = rodarAdaptador('preparar-whatsapp-entrada', {
    'Receber WhatsApp': [{ body: {
      event: 'messages.upsert', instance: 'producao',
      data: { key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'EV-SEM-OS', participant: 'p@s.whatsapp.net' },
        pushName: 'Pessoa Teste', messageTimestamp: 1792700000, message: { conversation: 'a peça B sai dia 29' } }
    } }],
    $input: [leitura]
  });
  assert.equal(preparada.json.precisaAssociar, true);
  const saida = rodarAdaptador('finalizar-associacao', {
    'Preparar Entrada WhatsApp': [preparada.json],
    'Ler Contexto WhatsApp': [leitura],
    'Gravar Mensagem Recebida': [{ spreadsheetId: 'x', updates: { updatedRange: 'WHATSAPP_MENSAGENS!A3:AC3' } }],
    $input: [{ associacao: { resultado: 'OS', os: '90001', candidatos: [], confianca: 0.95, motivo: 'fala da peça B' } }]
  });
  assert.equal(saida.length, 1);
  assert.match(saida[0].json.url, /values:batchUpdate/);
  const texto = JSON.stringify(saida[0].json.body);
  assert.match(texto, /WHATSAPP_MENSAGENS'?!\w*3/);
  assert.match(texto, /fala da peça B/);
  assert.deepEqual(saida[0].json.interpretar, { mensagemId: preparada.json.preparacao.mensagemId, dealId: '700001' });
});

test('Finalizar Associação na dúvida anexa a pergunta depois da mensagem recém-gravada', () => {
  const leitura = leituraEntrada();
  leitura.valueRanges[2].values[0].push('associacao_confianca', 'associacao_motivo', 'pergunta_candidatos', 'pergunta_mensagem_id', 'pergunta_fechada_em');
  leitura.valueRanges[1].values.push(['700002', '90002', 'of-1', 'OFICINA A', '', '', 50, 'PECA TESTE C', 'REF-03', 'SIM', 'v1']);
  const [preparada] = rodarAdaptador('preparar-whatsapp-entrada', {
    'Receber WhatsApp': [{ body: {
      event: 'messages.upsert', instance: 'producao',
      data: { key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'EV-DUVIDA', participant: 'p@s.whatsapp.net' },
        pushName: 'Pessoa Teste', messageTimestamp: 1792700000, message: { conversation: 'essa vai atrasar' } }
    } }],
    $input: [leitura]
  });
  const saida = rodarAdaptador('finalizar-associacao', {
    'Preparar Entrada WhatsApp': [preparada.json],
    'Ler Contexto WhatsApp': [leitura],
    'Gravar Mensagem Recebida': [{ spreadsheetId: 'x', updates: { updatedRange: 'WHATSAPP_MENSAGENS!A3:AC3' } }],
    $input: [{ associacao: { resultado: 'DUVIDA', os: '', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'duas peças' } }]
  });
  const anexo = saida.find((s) => /:append/.test(s.json.url));
  assert.ok(anexo, 'sem append da pergunta');
  assert.match(decodeURIComponent(anexo.json.url), /WHATSAPP_MENSAGENS'?!A4/);
  assert.match(JSON.stringify(anexo.json.body), /Essa mensagem é sobre \*PECA TESTE B\* ou \*PECA TESTE C\*/);
  assert.ok(saida.some((s) => /batchUpdate/.test(s.json.url) && /IA_DUVIDA/.test(JSON.stringify(s.json.body))));
});
