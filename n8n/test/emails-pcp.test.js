// F5c · E-mails do PCP: regras puras (assunto, modelo, limpeza do texto).
// Só dados fictícios: domínio @confeccao-exemplo.com.br, OS 9000x, pessoas inventadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

test('OS do assunto: número depois de "OS:", com ou sem espaço; sem OS → vazio', () => {
  assert.equal(ctx.osDoAssuntoEmailPcp('Caixa separada - OS:90001 | Ref: REF-01 | Desc: PECA TESTE'), '90001');
  assert.equal(ctx.osDoAssuntoEmailPcp('RE: Itens recebidos SP -OS: 90002 | Ref: R'), '90002');
  assert.equal(ctx.osDoAssuntoEmailPcp('ENC: Itens faltando pós corte - os:90003'), '90003');
  assert.equal(ctx.osDoAssuntoEmailPcp('Reunião de segunda'), '');
  assert.equal(ctx.osDoAssuntoEmailPcp('OS: sem número'), '');
  assert.equal(ctx.osDoAssuntoEmailPcp(null), '');
});

test('modelo pelo assunto, sem acento e sem diferença de caixa', () => {
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Caixa separada - OS:90001 | Ref: R'), 'CAIXA_SEPARADA');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Itens faltando pós corte - OS:90001'), 'POS_CORTE');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: ITENS FALTANDO POS CORTE - OS:90001'), 'POS_CORTE');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Itens recebidos SP -OS:90001'), 'RECEBIDOS_SP');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Dúvida - OS:90001'), 'OUTRO');
});

test('limpeza: corta o histórico citado em português', () => {
  const t = 'Item verificado, quantidade 40.\n\nEm seg., 27 de out. de 2026 às 10:00, Pessoa Ficticia <pcp@confeccao-exemplo.com.br>\nescreveu:\n> Caixa separada - OS:90001';
  assert.equal(ctx.limparTextoEmailPcp(t), 'Item verificado, quantidade 40.');
  assert.equal(ctx.limparTextoEmailPcp('Chamado aberto #1234567\nDe: Equipe <x@confeccao-exemplo.com.br>\nEnviado: segunda\nAssunto: OS'), 'Chamado aberto #1234567');
  assert.equal(ctx.limparTextoEmailPcp('Ok, conferido.\n-----Mensagem original-----\nDe: alguém'), 'Ok, conferido.');
  assert.equal(ctx.limparTextoEmailPcp('Linha nova\n> citação antiga\n> outra'), 'Linha nova');
});

test('limpeza: corta o histórico citado em inglês', () => {
  assert.equal(ctx.limparTextoEmailPcp('Arrives on 30/10.\nOn Mon, Oct 27, 2026 at 10:00 AM Someone <a@confeccao-exemplo.com.br> wrote:\n> old'), 'Arrives on 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Checked.\nFrom: Team\nSent: Monday'), 'Checked.');
  assert.equal(ctx.limparTextoEmailPcp('Checked.\n-----Original Message-----\nFrom: x'), 'Checked.');
});

test('limpeza: corta a assinatura em português e em inglês', () => {
  assert.equal(ctx.limparTextoEmailPcp('Previsão de chegada 30/10.\n\nAtenciosamente,\nPessoa Ficticia\nCompras'), 'Previsão de chegada 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nAtt.\nFulano Inventado'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nAtt,\nFulano'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\n--\nFulano | (00) 0000-0000'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nEnviado do meu iPhone'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\n\nBest regards,\nSomeone'), 'Received.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\nRegards\nSomeone'), 'Received.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\nSent from my phone'), 'Received.');
  // "Attention" e "Attached" não são assinatura.
  assert.equal(ctx.limparTextoEmailPcp('Attached the list.\nOk.'), 'Attached the list. Ok.');
});

test('limpeza: espaços, linhas em branco e limite de 1500 caracteres', () => {
  assert.equal(ctx.limparTextoEmailPcp('  Bom dia,\r\n\r\n  item   conferido.  \n'), 'Bom dia, item conferido.');
  assert.equal(ctx.limparTextoEmailPcp('a'.repeat(2000)).length, 1500);
  assert.equal(ctx.limparTextoEmailPcp(''), '');
  assert.equal(ctx.limparTextoEmailPcp(undefined), '');
  // Mensagem que começa pela citação não sobra nada.
  assert.equal(ctx.limparTextoEmailPcp('De: Equipe\nAssunto: OS:90001'), '');
  assert.deepEqual(limpo(ctx.COLUNAS_EMAILS_PCP), ['id', 'thread_id', 'quando', 'de_nome', 'assunto', 'os', 'modelo', 'texto', 'tipo', 'valor',
    'itens', 'resumo', 'evidencia', 'confianca', 'status', 'tentativas', 'decidido_em', 'decidido_por']);
});

// ----- Intérprete -----
const ITENS = [
  { id: 'F-1', dealId: '700001', nome: 'ZIPER METAL 18CM', cor: 'PRETO', un: 'UN', resta: 40 },
  { id: 'F-2', dealId: '700001', nome: 'BOTAO MADREPEROLA 15MM', cor: '', un: 'UN', resta: 120 },
  { id: 'F-3', dealId: '700011', nome: 'LINHA 120', cor: 'AMORA', un: 'cones', resta: 4 }
];
const QUANDO = '2026-10-27T13:00:00.000Z';
const v = (o, textoEmail) => limpo(ctx.validarInterpretacaoEmailPcp(o, { texto: textoEmail, quando: QUANDO, itensAbertos: ITENS }));
const base = (o) => Object.assign({ tipo: 'OBSERVACAO', valor: '', itens: [], resumo: 'r', evidencia: '', confianca: 0.9 }, o);

test('itens em aberto da OS: só os abertos das caixas daquela OS', () => {
  const caixas = [
    { dealId: '700001', os: '90001', itens: [
      { id: 'F-1', nome: 'ZIPER', cor: 'PRETO', un: 'UN', status: 'ABERTO', resta: 40 },
      { id: 'F-9', nome: 'ETIQUETA', cor: '', un: 'UN', status: 'RESOLVIDO', resta: 0 },
      { id: 'F-8', nome: 'TAG', cor: '', un: 'UN', status: 'PARCIAL', resta: 0 }] },
    { dealId: '700011', os: '90001', itens: [{ id: 'F-3', nome: 'LINHA', cor: '', un: 'cones', status: 'PARCIAL', resta: null }] },
    { dealId: '700002', os: '90002', itens: [{ id: 'F-5', nome: 'OUTRA', cor: '', un: 'UN', status: 'ABERTO', resta: 2 }] }
  ];
  assert.deepEqual(limpo(ctx.itensAbertosDaOsEmailPcp(caixas, '90001')).map((i) => [i.id, i.dealId]), [['F-1', '700001'], ['F-3', '700011']]);
  assert.deepEqual(limpo(ctx.itensAbertosDaOsEmailPcp(caixas, '')), []);
});

test('entrada do intérprete: texto limpo, assunto, OS e itens em aberto; nunca o remetente', () => {
  const linha = { id: 'G1', quando: QUANDO, de_nome: 'Pessoa Ficticia', assunto: 'RE: Caixa separada - OS:90001', os: '90001', modelo: 'CAIXA_SEPARADA', texto: 'Chega dia 30/10.' };
  const e = limpo(ctx.entradaInterpreteEmailPcp(linha, ITENS));
  assert.equal(e.emailId, 'G1');
  assert.equal(e.texto, 'Chega dia 30/10.');
  assert.equal(e.assunto, 'RE: Caixa separada - OS:90001');
  assert.equal(e.os, '90001');
  assert.equal(e.modelo, 'CAIXA_SEPARADA');
  assert.equal(e.quando, QUANDO);
  assert.deepEqual(e.itensAbertos[0], { id: 'F-1', nome: 'ZIPER METAL 18CM PRETO', falta: '40 UN' });
  assert.deepEqual(e.schema.tipo, ['PREVISAO', 'QUANTIDADE', 'CHAMADO', 'OBSERVACAO']);
  assert.match(e.instrucoes, /evid/i);
  assert.ok(!JSON.stringify(e).includes('Pessoa Ficticia'));
});

test('pedido ao Groq: modelo, JSON e o contexto como mensagem do usuário', () => {
  const corpo = limpo(ctx.pedidoGroqEmailPcp({ emailId: 'G1', texto: 'x'.repeat(20000), instrucoes: 'i', schema: {} }));
  assert.equal(corpo.model, 'openai/gpt-oss-20b');
  assert.equal(corpo.temperature, 0);
  assert.equal(corpo.reasoning_effort, 'low');
  assert.deepEqual(corpo.response_format, { type: 'json_object' });
  assert.equal(corpo.messages[0].role, 'system');
  assert.match(corpo.messages[0].content, /PREVISAO/);
  assert.equal(corpo.messages[1].role, 'user');
  assert.ok(corpo.messages[1].content.length <= 12000);
  const ok = limpo(ctx.respostaGroqEmailPcp({ choices: [{ message: { content: '{"tipo":"CHAMADO","valor":"1234567"}' } }] }, 'G1'));
  assert.deepEqual(ok, { emailId: 'G1', interpretacao: { tipo: 'CHAMADO', valor: '1234567' } });
  assert.throws(() => ctx.respostaGroqEmailPcp({ choices: [{ message: { content: 'não é json' } }] }, 'G1'), /JSON/);
  assert.throws(() => ctx.respostaGroqEmailPcp({}, 'G1'), /JSON/);
});

test('validação: PREVISAO com data e itens que batem pelo nome', () => {
  const t = 'O zíper metal 18cm chega dia 30/10.';
  assert.deepEqual(v(base({ tipo: 'PREVISAO', valor: '30/10', itens: ['ZIPER METAL 18CM'], evidencia: 'zíper metal 18cm chega dia 30/10' }), t),
    { ok: true, tipo: 'PREVISAO', valor: '2026-10-30', itens: ['F-1'], resumo: 'r', evidencia: 'zíper metal 18cm chega dia 30/10', confianca: 0.9 });
  // Sem itens citados: previsão da caixa.
  assert.equal(v(base({ tipo: 'PREVISAO', valor: '2026-10-30', evidencia: 'chega dia 30/10' }), t).tipo, 'PREVISAO');
  // Item pelo id também vale.
  assert.deepEqual(v(base({ tipo: 'PREVISAO', valor: '30/10', itens: ['F-2'], evidencia: 'chega dia 30/10' }), t).itens, ['F-2']);
});

test('validação: PREVISAO que cita item fora da OS, data inválida ou distante vira OBSERVACAO', () => {
  const t = 'O tecido chega dia 30/10.';
  assert.equal(v(base({ tipo: 'PREVISAO', valor: '30/10', itens: ['TECIDO AZUL'], evidencia: 'chega dia 30/10' }), t).tipo, 'OBSERVACAO');
  assert.equal(v(base({ tipo: 'PREVISAO', valor: 'semana que vem', evidencia: 'chega dia 30/10' }), t).tipo, 'OBSERVACAO');
  assert.equal(v(base({ tipo: 'PREVISAO', valor: '30/05', evidencia: 'chega dia 30/10' }), t).tipo, 'OBSERVACAO');
  const obs = v(base({ tipo: 'PREVISAO', valor: '30/10', itens: ['TECIDO AZUL'], evidencia: 'chega dia 30/10' }), t);
  assert.equal(obs.valor, '');
  assert.deepEqual(obs.itens, []);
});

test('validação: evidência fora do texto ou confiança baixa vira OBSERVACAO', () => {
  const t = 'Item verificado, quantidade 40.';
  const semEvid = v(base({ tipo: 'QUANTIDADE', valor: '40', itens: ['ZIPER METAL 18CM'], evidencia: 'chega amanhã de manhã', resumo: 'x' }), t);
  assert.equal(semEvid.tipo, 'OBSERVACAO');
  assert.equal(semEvid.evidencia, '');
  assert.equal(semEvid.resumo, 'Resposta por e-mail: Item verificado, quantidade 40.');
  assert.equal(v(base({ tipo: 'QUANTIDADE', valor: '40', itens: ['ZIPER METAL 18CM'], evidencia: '' }), t).tipo, 'OBSERVACAO');
  const baixa = v(base({ tipo: 'QUANTIDADE', valor: '40', itens: ['ZIPER METAL 18CM'], evidencia: 'quantidade 40', confianca: 0.69 }), t);
  assert.equal(baixa.tipo, 'OBSERVACAO');
  assert.equal(baixa.confianca, 0.69);
  assert.equal(v(base({ tipo: 'QUANTIDADE', valor: '40', itens: ['ZIPER METAL 18CM'], evidencia: 'quantidade 40', confianca: 0.7 }), t).tipo, 'QUANTIDADE');
});

test('validação: QUANTIDADE precisa de um item e de um número; CHAMADO precisa do número no texto', () => {
  const t = 'Item verificado, quantidade 40. Chamado aberto #1234567.';
  assert.deepEqual(v(base({ tipo: 'QUANTIDADE', valor: '40', itens: ['ZIPER METAL 18CM'], evidencia: 'quantidade 40' }), t),
    { ok: true, tipo: 'QUANTIDADE', valor: '40', itens: ['F-1'], resumo: 'r', evidencia: 'quantidade 40', confianca: 0.9 });
  assert.equal(v(base({ tipo: 'QUANTIDADE', valor: '40', itens: [], evidencia: 'quantidade 40' }), t).tipo, 'OBSERVACAO');
  assert.equal(v(base({ tipo: 'QUANTIDADE', valor: 'muitos', itens: ['F-1'], evidencia: 'quantidade 40' }), t).tipo, 'OBSERVACAO');
  assert.deepEqual(v(base({ tipo: 'CHAMADO', valor: '#1234567', evidencia: 'Chamado aberto #1234567' }), t).valor, '1234567');
  assert.equal(v(base({ tipo: 'CHAMADO', valor: '7654321', evidencia: 'Chamado aberto' }), t).tipo, 'OBSERVACAO');
});

test('validação: saída inválida do modelo é erro (a linha fica ERRO para nova tentativa)', () => {
  assert.equal(v('não é json', 't').ok, false);
  assert.equal(v(base({ tipo: 'OUTRA' }), 't').ok, false);
  assert.equal(v(base({ confianca: 101 }), 't').ok, false);
  assert.equal(v(base({ confianca: -1 }), 't').ok, false);
  // Em percentual (95) vale como 0,95.
  assert.equal(v(base({ confianca: 95 }), 't').confianca, 0.95);
  assert.equal(v(base({ confianca: 'alta' }), 't').ok, false);
  // OBSERVACAO válida (de string JSON).
  assert.equal(v(JSON.stringify(base({ resumo: 'Pedido de conferência', evidencia: 'confere' })), 'Pode conferir a quantidade?').tipo, 'OBSERVACAO');
});

// ----- Revisão final (27/10) -----
test('limpeza: cabeçalho da citação quebrado em qualquer ponto não deixa nome nem endereço', () => {
  assert.equal(ctx.limparTextoEmailPcp('Chega dia 30/10.\nEm seg., 27 de out. de 2026 às 10:00, Fulano Teste <\nfulano@confeccao-exemplo.com.br> escreveu:\n> antigo'), 'Chega dia 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Chega dia 30/10.\nEm seg., 27 de out. de 2026, Fulano\nTeste <f@confeccao-exemplo.com.br> escreveu:'), 'Chega dia 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Ok.\nOn Mon, Oct 27, 2026 Someone <\ns@confeccao-exemplo.com.br>\nwrote:'), 'Ok.');
  assert.equal(ctx.limparTextoEmailPcp('Falar com p.um@confeccao-exemplo.com.br sobre o zíper.'), 'Falar com sobre o zíper.');
  // "Enviado:" sozinho é conteúdo.
  assert.equal(ctx.limparTextoEmailPcp('Enviado: hoje pela transportadora\nchega dia 30/10'), 'Enviado: hoje pela transportadora chega dia 30/10');
});

test('itens: os lidos da CAIXAS GANHAS (não editáveis) não vão ao intérprete', () => {
  const caixas = [{ dealId: '700001', os: '90001', itens: [
    { id: 'F-1', nome: 'ZIPER', status: 'ABERTO', resta: 4, editavel: true },
    { id: '700001|ganha|0', nome: 'BOTAO', status: 'ABERTO', resta: 2, editavel: false }] }];
  assert.deepEqual(limpo(ctx.itensAbertosDaOsEmailPcp(caixas, '90001')).map((i) => i.id), ['F-1']);
});

test('itens: o nome exato vence; substring só com um candidato', () => {
  const itens = [{ id: 'L1', nome: 'LINHA', cor: '' }, { id: 'L2', nome: 'LINHA BRANCA 120', cor: '' }, { id: 'B1', nome: 'BOTAO MADREPEROLA', cor: '' }];
  const t = 'A linha e o botão chegam dia 30/10.';
  const c = (nomes) => limpo(ctx.validarInterpretacaoEmailPcp(base({ tipo: 'PREVISAO', valor: '30/10', itens: nomes, evidencia: 'chegam dia 30/10' }), { texto: t, quando: QUANDO, itensAbertos: itens }));
  assert.deepEqual(c(['LINHA']).itens, ['L1']);
  assert.deepEqual(c(['BOTAO']).itens, ['B1']);
  // "LINHA BRANCA" casa LINHA e LINHA BRANCA 120 por substring: ambíguo, não vale.
  assert.equal(c(['LINHA BRANCA']).tipo, 'OBSERVACAO');
});
