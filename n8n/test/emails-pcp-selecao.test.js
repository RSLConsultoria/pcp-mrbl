// F5c · E-mails do PCP: leitura do Gmail, linhas da aba EMAILS_PCP e a rodada de interpretação.
// Só dados fictícios: domínio confeccao-exemplo.com.br, pessoas e OS inventadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const DOMINIO = 'confeccao-exemplo.com.br';
const AGORA = '2026-10-27T13:00:00.000Z';

// Mensagem no formato bruto da Gmail API (users.messages.get?format=full): cabeçalhos em
// payload.headers e o corpo em base64url dentro de payload.parts (recursivo).
const b64 = (t) => Buffer.from(t, 'utf8').toString('base64url');
const TEXTO_G1 = 'O zíper chega dia 30/10.\n\nAtenciosamente,\nPessoa Um\n\nEm seg., 27 de out. de 2026, PCP <pcp@' + DOMINIO + '> escreveu:\n> Caixa separada';
const msgApi = (c) => ({
  id: c.id, threadId: c.threadId, internalDate: c.internalDate || '1793100000000', snippet: c.snippet || '',
  payload: {
    mimeType: 'multipart/alternative',
    headers: [{ name: 'From', value: c.from }, { name: 'Subject', value: c.subject }, { name: 'Date', value: c.date }],
    parts: [
      { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }], body: { size: 1, data: b64(c.text) } },
      { mimeType: 'text/html', body: { size: 1, data: b64('<div>' + c.text + '</div>') } }
    ]
  }
});
const gmail = (o) => {
  const c = Object.assign({
    id: 'G1', threadId: 'T1', subject: 'RE: Caixa separada - OS:90001 | Ref: REF-01 | Desc: PECA TESTE',
    date: 'Tue, 27 Oct 2026 09:30:00 -0300', from: 'Pessoa Um <pessoa.um@' + DOMINIO + '>', text: TEXTO_G1
  }, o);
  return msgApi(c);
};
const FALTANTES = [
  { id: 'F-1', deal_id: '700001', os: '90001', ciclo: 'PEDIDO', secao: 'COSTURA', descricao_item: 'ZIPER METAL 18CM', cor: 'PRETO', unidade: 'UN',
    qtd_necessaria: 40, qtd_separada: 0, qtd_falta: 40, qtd_baixada: 0, status: 'ABERTO', registrado_em: '2026-10-20' }
];
const linhaEmail = (o) => Object.assign({
  row_number: 2, id: 'G0', thread_id: 'T0', quando: '2026-10-27T10:00:00.000Z', de_nome: 'Pessoa Dois', assunto: 'RE: Itens faltando pós corte - OS:90001',
  os: '90001', modelo: 'POS_CORTE', texto: 'Chamado aberto #1234567', tipo: '', valor: '', itens: '', resumo: '', evidencia: '', confianca: '',
  status: 'ERRO', tentativas: 1, decidido_em: '', decidido_por: ''
}, o);

test('e-mail da Gmail API (format=full): id, conversa, data, nome do remetente e texto text/plain', () => {
  assert.deepEqual(limpo(ctx.emailDoGmailPcp(gmail())), {
    id: 'G1', threadId: 'T1', quando: '2026-10-27T12:30:00.000Z', deNome: 'Pessoa Um', deEndereco: 'pessoa.um@' + DOMINIO,
    assunto: 'RE: Caixa separada - OS:90001 | Ref: REF-01 | Desc: PECA TESTE', texto: TEXTO_G1
  });
});

test('e-mail da Gmail API: text/plain aninhado em multipart/mixed, cabeçalhos em qualquer caixa e sem Date', () => {
  const m = { id: 'G3', threadId: 'T3', internalDate: '1793106000000', payload: {
    mimeType: 'multipart/mixed',
    headers: [{ name: 'FROM', value: '"Pessoa Quatro" <P4@' + DOMINIO.toUpperCase() + '>' }, { name: 'subject', value: 'OS:90003' }],
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/html', body: { data: b64('<p>não use</p>') } },
        { mimeType: 'text/plain', body: { data: b64('Conferido: 12 peças ✓') } }
      ] },
      { mimeType: 'application/pdf', filename: 'anexo.pdf', body: { attachmentId: 'ANEXO-1', size: 10 } }
    ] } };
  const e = limpo(ctx.emailDoGmailPcp(m));
  assert.equal(e.deNome, 'Pessoa Quatro');
  assert.equal(e.deEndereco, 'p4@' + DOMINIO);
  assert.equal(e.assunto, 'OS:90003');
  assert.equal(e.texto, 'Conferido: 12 peças ✓');
  assert.equal(e.quando, new Date(1793106000000).toISOString());
});

test('e-mail da Gmail API: só text/html vira texto sem tags; corpo direto no payload; charset latin1', () => {
  const soHtml = limpo(ctx.emailDoGmailPcp({ id: 'G2', threadId: 'T2', payload: { mimeType: 'multipart/alternative',
    headers: [{ name: 'From', value: 'Pessoa Tres <p3@' + DOMINIO + '>' }, { name: 'Subject', value: 'OS:90002' }],
    parts: [{ mimeType: 'text/html', body: { data: b64('<p>Ok&nbsp;conferido</p><br>linha') } }] } }));
  assert.equal(soHtml.texto, 'Ok conferido\nlinha');
  const direto = limpo(ctx.emailDoGmailPcp({ id: 'G4', payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'OS:1' }],
    body: { data: b64('Chega amanhã') } } }));
  assert.equal(direto.texto, 'Chega amanhã');
  const latin1 = Buffer.from('Previsão 30/10', 'latin1').toString('base64url');
  const l1 = limpo(ctx.emailDoGmailPcp({ id: 'G5', payload: { mimeType: 'text/plain',
    headers: [{ name: 'Content-Type', value: 'text/plain; charset=ISO-8859-1' }], body: { data: latin1 } } }));
  assert.equal(l1.texto, 'Previsão 30/10');
  // Sem corpo: cai no snippet; nada: vazio, sem quebrar.
  assert.equal(limpo(ctx.emailDoGmailPcp({ id: 'G6', snippet: 'resumo', payload: { mimeType: 'text/plain', body: { size: 0 } } })).texto, 'resumo');
  assert.deepEqual(limpo(ctx.emailDoGmailPcp(null)), { id: '', threadId: '', quando: '', deNome: '', deEndereco: '', assunto: '', texto: '' });
});

test('lista da Gmail API: ids das mensagens; sem "messages" (nenhum e-mail) devolve lista vazia', () => {
  assert.deepEqual(limpo(ctx.idsListaGmailPcp({ messages: [{ id: 'A1', threadId: 'T' }, { id: 'A2', threadId: 'T' }, { id: 'A1' }, {}], resultSizeEstimate: 3 })), ['A1', 'A2']);
  assert.deepEqual(limpo(ctx.idsListaGmailPcp({ resultSizeEstimate: 0 })), []);
  assert.deepEqual(limpo(ctx.idsListaGmailPcp({})), []);
  assert.deepEqual(limpo(ctx.idsListaGmailPcp(null)), []);
  // Id só com letras, números, traço e sublinhado (vai no caminho da URL).
  assert.deepEqual(limpo(ctx.idsListaGmailPcp({ messages: [{ id: '../send' }, { id: 'abc?x=1' }, { id: '18f0a1B2' }] })), ['18f0a1B2']);
});

test('busca do Gmail: só com o domínio configurado', () => {
  assert.equal(ctx.buscaGmailEmailsPcp(DOMINIO), 'from:(@' + DOMINIO + ') subject:"OS:" -from:noreply@ploomes.com newer_than:7d');
  assert.equal(ctx.buscaGmailEmailsPcp(' @' + DOMINIO.toUpperCase() + ' '), 'from:(@' + DOMINIO + ') subject:"OS:" -from:noreply@ploomes.com newer_than:7d');
  for (const ruim of ['CONFIGURAR_DOMINIO', '', 'sem-ponto', 'a b.com', 'x.com) OR (y', null]) assert.equal(ctx.buscaGmailEmailsPcp(ruim), '');
});

test('rodada: e-mail novo entra como ERRO com 1 tentativa e vai ao intérprete com o texto limpo', () => {
  const r = limpo(ctx.selecionarEmailsPcp([{ json: gmail() }], { emails: [], faltantes: FALTANTES, ganhas: [] }, DOMINIO, AGORA));
  assert.equal(r.operacoes.length, 1);
  assert.deepEqual(r.operacoes[0], { aba: 'EMAILS_PCP', operacao: 'append', chave: 'id', linha: {
    id: 'G1', thread_id: 'T1', quando: '2026-10-27T12:30:00.000Z', de_nome: 'Pessoa Um', assunto: 'RE: Caixa separada - OS:90001 | Ref: REF-01 | Desc: PECA TESTE',
    os: '90001', modelo: 'CAIXA_SEPARADA', texto: 'O zíper chega dia 30/10.', tipo: '', valor: '', itens: '', resumo: '', evidencia: '', confianca: '',
    status: 'ERRO', tentativas: 1, decidido_em: '', decidido_por: ''
  } });
  assert.deepEqual(Object.keys(r.operacoes[0].linha), limpo(ctx.COLUNAS_EMAILS_PCP));
  assert.equal(r.pedidos.length, 1);
  assert.equal(r.pedidos[0].emailId, 'G1');
  assert.equal(r.pedidos[0].texto, 'O zíper chega dia 30/10.');
  assert.deepEqual(r.pedidos[0].itensAbertos, [{ id: 'F-1', nome: 'ZIPER METAL 18CM PRETO', falta: '40 UN' }]);
  assert.ok(!JSON.stringify(r.pedidos).includes('pessoa.um@'));
});

test('rodada: ignora sem OS, de fora do domínio, do Ploomes, já gravado, repetido e sem texto', () => {
  const itens = [
    gmail({ id: 'A', subject: 'RE: reunião' }),
    gmail({ id: 'B', from: 'X <alguem@outro-exemplo.com.br>' }),
    gmail({ id: 'C', from: 'Ploomes <noreply@ploomes.com>' }),
    gmail({ id: 'G0' }),
    gmail({ id: 'D' }), gmail({ id: 'D' }),
    gmail({ id: 'E', text: 'Em seg., 27 de out. de 2026, PCP escreveu:\n> só citação' }),
    gmail({ id: 'F', from: 'X <p@sub.' + DOMINIO + '.falso.com>' }),
    {}
  ].map((json) => ({ json }));
  const r = limpo(ctx.selecionarEmailsPcp(itens, { emails: [linhaEmail({ status: 'PENDENTE' })], faltantes: [], ganhas: [] }, DOMINIO, AGORA));
  assert.deepEqual(r.pedidos.map((p) => p.emailId), ['D']);
});

test('rodada: ERRO com menos de 3 tentativas volta ao intérprete (a partir do texto da aba); com 3 não', () => {
  const dados = { emails: [linhaEmail({ id: 'G0', tentativas: 2 }), linhaEmail({ row_number: 3, id: 'G9', tentativas: 3 }), linhaEmail({ row_number: 4, id: 'G8', status: 'PENDENTE' })], faltantes: FALTANTES, ganhas: [] };
  const r = limpo(ctx.selecionarEmailsPcp([], dados, DOMINIO, AGORA));
  assert.deepEqual(r.operacoes, [{ aba: 'EMAILS_PCP', operacao: 'update', chave: 'id', linha: { id: 'G0', tentativas: 3 } }]);
  assert.deepEqual(r.pedidos.map((p) => [p.emailId, p.texto]), [['G0', 'Chamado aberto #1234567']]);
});

test('rodada: no máximo 4 interpretações; as novas esperam a próxima rodada', () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({ json: gmail({ id: 'N' + i, date: '2026-10-27T1' + (i % 10) + ':00:00.000Z' }) }));
  const r = limpo(ctx.selecionarEmailsPcp(muitos, { emails: [linhaEmail({ id: 'G0' })], faltantes: [], ganhas: [] }, DOMINIO, AGORA));
  assert.equal(r.pedidos.length, 4);
  assert.equal(r.pedidos[0].emailId, 'G0');
  assert.equal(r.operacoes.filter((o) => o.operacao === 'append').length, 3);
});

test('rodada: domínio não configurado não seleciona e-mail novo', () => {
  const r = limpo(ctx.selecionarEmailsPcp([{ json: gmail() }], { emails: [], faltantes: [], ganhas: [] }, 'CONFIGURAR_DOMINIO', AGORA));
  assert.deepEqual(r, { operacoes: [], pedidos: [] });
});

test('conclusão: interpretação válida vira PENDENTE; inválida ou já decidida não grava', () => {
  const pedido = ctx.entradaInterpreteEmailPcp(linhaEmail({ id: 'G1', texto: 'O zíper metal chega dia 30/10.', quando: AGORA }),
    [{ id: 'F-1', nome: 'ZIPER METAL 18CM', cor: 'PRETO', un: 'UN', resta: 40 }]);
  const resp = { emailId: 'G1', interpretacao: { tipo: 'PREVISAO', valor: '30/10', itens: ['ZIPER METAL 18CM'], resumo: 'Zíper chega 30/10', evidencia: 'chega dia 30/10', confianca: 0.92 } };
  const linhas = [linhaEmail({ id: 'G1' })];
  assert.deepEqual(limpo(ctx.concluirEmailsPcp([pedido], [resp], linhas)), [{ aba: 'EMAILS_PCP', operacao: 'update', chave: 'id', linha: {
    id: 'G1', tipo: 'PREVISAO', valor: '2026-10-30', itens: 'F-1', resumo: 'Zíper chega 30/10', evidencia: 'chega dia 30/10', confianca: 0.92, status: 'PENDENTE'
  } }]);
  // Pareia pelo emailId, não pela posição.
  assert.equal(limpo(ctx.concluirEmailsPcp([{ emailId: 'X' }, pedido], [resp, { error: 'falhou' }], linhas)).length, 1);
  assert.deepEqual(limpo(ctx.concluirEmailsPcp([pedido], [{ error: 'Groq fora' }], linhas)), []);
  assert.deepEqual(limpo(ctx.concluirEmailsPcp([pedido], [{ emailId: 'G1', interpretacao: { tipo: 'X' } }], linhas)), []);
  assert.deepEqual(limpo(ctx.concluirEmailsPcp([pedido], [resp], [linhaEmail({ id: 'G1', status: 'IGNORADA' })])), []);
});

test('planilha: EMAILS_PCP lida pelo Ler E-mails, gravada por id e sem criar coluna', () => {
  assert.deepEqual(limpo(ctx.LEITURAS_EMAILS_PCP), ['EMAILS_PCP', 'FALTANTES', 'CAIXAS GANHAS']);
  const planilha = { linhas: { EMAILS_PCP: [] }, cabecalhos: { EMAILS_PCP: limpo(ctx.COLUNAS_EMAILS_PCP) }, linhaCabecalho: { EMAILS_PCP: 1 }, ultimaLinha: { EMAILS_PCP: 1 } };
  const r = ctx.selecionarEmailsPcp([{ json: gmail() }], { emails: [], faltantes: [], ganhas: [] }, DOMINIO, AGORA);
  const reqs = limpo(ctx.requisicoesDeEscrita(r.operacoes, [], planilha, 'PLANILHA'));
  assert.equal(reqs.length, 1);
  assert.match(reqs[0].url, /EMAILS_PCP'!A2:append\?valueInputOption=RAW&insertDataOption=OVERWRITE$/);
  assert.equal(reqs[0].body.values[0][14], 'ERRO');
  const semColuna = { ...planilha, cabecalhos: { EMAILS_PCP: limpo(ctx.COLUNAS_EMAILS_PCP).slice(0, 17) } };
  assert.throws(() => ctx.requisicoesDeEscrita(r.operacoes, [], semColuna, 'PLANILHA'), /Cabeçalho obrigatório ausente: EMAILS_PCP.decidido_por/);
});
