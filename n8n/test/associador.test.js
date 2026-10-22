const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const producao = [
  { deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', peca: 'BLUSA TESTE', referencia: 'REF-1', pecas: '11', data_combinada: '2026-10-30', lead_time: '' },
  { deal_id: '700002', os: '90002', oficina_id: 'of-1', em_costura: 'SIM', peca: 'CALCA TESTE', referencia: 'REF-2', pecas: '20', data_combinada: '', lead_time: '2026-11-05' },
  { deal_id: '700003', os: '90003', oficina_id: 'of-2', em_costura: 'SIM', peca: 'SAIA TESTE', referencia: 'REF-3', pecas: '5', data_combinada: '', lead_time: '' },
  { deal_id: '700004', os: '90004', oficina_id: 'of-1', em_costura: 'NAO', prevista: 'SIM', peca: 'VESTIDO TESTE', referencia: 'REF-4', pecas: '9' }
];
const mensagens = [
  { id: 'E1', direcao: 'ENVIADA', status_envio: 'ENVIADA', deal_id: '700001', grupo_jid: 'grupo-teste@g.us', quando: '2026-10-22T12:00:00.000Z', texto: 'Olá. A entrega de *BLUSA TESTE*...' }
];

test('candidatos: só OS da oficina na Costura, com a última mensagem do PCP', () => {
  const c = limpo(ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', mensagens, '2026-10-22'));
  assert.deepEqual(c.map((x) => x.os), ['90001', '90002']);
  assert.equal(c[0].pecas, 11);
  assert.equal(c[0].prazoVigente, '2026-10-30');
  assert.deepEqual(c[0].ultimaMensagemPcp, { quando: '2026-10-22T12:00:00.000Z', texto: 'Olá. A entrega de *BLUSA TESTE*...' });
  assert.equal(c[1].ultimaMensagemPcp, null);
});

test('validação: OS confiante, dúvida, não é OS e desvios', () => {
  const c = ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22');
  const v = (x) => limpo(ctx.validarAssociacaoWhatsapp(x, c));
  assert.deepEqual(v({ resultado: 'OS', os: '90001', confianca: 0.9, motivo: 'fala da blusa' }),
    { ok: true, resultado: 'OS', dealId: '700001', os: '90001', candidatos: [], confianca: 0.9, motivo: 'fala da blusa' });
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }).resultado, 'DUVIDA');
  assert.deepEqual(v({ resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }).candidatos, ['700001', '700002']);
  assert.equal(v({ resultado: 'NAO_OS', confianca: 0.95, motivo: 'saudação' }).resultado, 'NAO_OS');
  // OS com confiança baixa: vira dúvida se vierem candidatos válidos; senão sem associação
  assert.equal(v({ resultado: 'OS', os: '90001', candidatos: ['90001', '90002'], confianca: 0.6, motivo: 'x' }).resultado, 'DUVIDA');
  assert.equal(v({ resultado: 'OS', os: '90001', confianca: 0.6, motivo: 'x' }).resultado, 'SEM_ASSOCIACAO');
  // desvios = falha
  assert.equal(v({ resultado: 'OS', os: '99999', confianca: 0.9 }).ok, false);
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001'], confianca: 0.5 }).ok, false);
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001', '90001'], confianca: 0.5 }).ok, false);
  assert.equal(v({ resultado: 'OS', os: '90001', confianca: 1.5 }).ok, false);
  assert.equal(v({ resultado: 'TALVEZ', confianca: 0.5 }).ok, false);
  assert.equal(v(null).ok, false);
});

test('texto da pergunta: 2 e 3 peças, nomes iguais ganham quantidade e depois referência', () => {
  const p = (peca, pecas, referencia) => ({ peca, pecas, referencia });
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('CALCA', 20, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* ou *CALCA*?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('CALCA', 20, 'R2'), p('SAIA', 5, 'R3')]), 'Olá! Essa mensagem é sobre *BLUSA*, *CALCA* ou *SAIA*?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('BLUSA', 20, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* (11 peças) ou *BLUSA* (20 peças)?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('BLUSA', 11, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* (R1) ou *BLUSA* (R2)?');
});

test('pergunta aberta: do grupo, enviada ou na fila, menos de 24 h e não fechada', () => {
  const base = { id: 'P1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', grupo_jid: 'grupo-teste@g.us', status_envio: 'ENVIADA', quando: '2026-10-22T12:00:00.000Z', pergunta_fechada_em: '' };
  const agora = '2026-10-22T20:00:00.000Z';
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'grupo-teste@g.us', agora).id, 'P1');
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, status_envio: 'PENDENTE' }], 'grupo-teste@g.us', agora).id, 'P1');
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'outro@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, pergunta_fechada_em: '2026-10-22T13:00:00.000Z' }], 'grupo-teste@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, status_envio: 'ERRO' }], 'grupo-teste@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'grupo-teste@g.us', '2026-10-23T12:00:01.000Z'), null);
});

test('contexto do associador: sem JID, telefone nem nome de participante', () => {
  const c = ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', mensagens, '2026-10-22');
  const grupo = [{ id: 'R0', direcao: 'RECEBIDA', grupo_jid: 'grupo-teste@g.us', participante_jid: '5500000000001@s.whatsapp.net', participante_nome: 'Fulano', quando: '2026-10-22T11:00:00.000Z', texto: 'bom dia', os: '' }];
  const e = limpo(ctx.contextoAssociadorWhatsapp({ texto: 'a blusa sai dia 27', quando: '2026-10-22T13:00:00.000Z' }, c, grupo, null));
  const s = JSON.stringify(e);
  assert.ok(!/5500000000001|Fulano|grupo-teste/.test(s));
  assert.equal(e.texto, 'a blusa sai dia 27');
  assert.deepEqual(e.conversa, [{ direcao: 'RECEBIDA', quando: '2026-10-22T11:00:00.000Z', texto: 'bom dia', os: '' }]);
  assert.equal(e.pergunta, null);
  assert.ok(e.instrucoes.length > 0 && e.schema.resultado);
});

const msgLinha = { id: 'WA-R-1', evolution_id: 'EVO-1', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', oficina_id: 'of-1', direcao: 'RECEBIDA', texto: 'a blusa sai dia 27', quando: '2026-10-22T13:00:00.000Z', associacao: 'SEM_ASSOCIACAO' };
const ctxDecisao = { agora: '2026-10-22T13:00:05.000Z', gerarId: () => 'WA-P-1' };
const cands = () => ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22');

test('decisão OS: liga a mensagem como IA e pede interpretação', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'OS', os: '90001', confianca: 0.92, motivo: 'fala da blusa' }, ctxDecisao));
  assert.equal(r.ok, true);
  assert.equal(r.resultado, 'OS');
  assert.equal(r.operacoes.length, 1);
  assert.deepEqual(
    { id: r.operacoes[0].linha.id, deal_id: r.operacoes[0].linha.deal_id, os: r.operacoes[0].linha.os, associacao: r.operacoes[0].linha.associacao, associacao_confianca: r.operacoes[0].linha.associacao_confianca, interpretacao_status: r.operacoes[0].linha.interpretacao_status },
    { id: 'WA-R-1', deal_id: '700001', os: '90001', associacao: 'IA', associacao_confianca: 0.92, interpretacao_status: 'PENDENTE' });
  assert.deepEqual(r.interpretar, { mensagemId: 'WA-R-1', dealId: '700001' });
});

test('decisão DUVIDA: marca IA_DUVIDA e enfileira a pergunta citando a mensagem', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'duas peças' }, ctxDecisao));
  assert.equal(r.resultado, 'DUVIDA');
  assert.equal(r.operacoes[0].linha.associacao, 'IA_DUVIDA');
  const p = r.operacoes[1];
  assert.equal(p.operacao, 'append');
  assert.equal(p.linha.tipo, 'PERGUNTA_ASSOCIACAO');
  assert.equal(p.linha.texto, 'Olá! Essa mensagem é sobre *BLUSA TESTE* ou *CALCA TESTE*?');
  assert.equal(p.linha.resposta_a_evolution_id, 'EVO-1');
  assert.equal(p.linha.pergunta_candidatos, '700001;700002');
  assert.equal(p.linha.pergunta_mensagem_id, 'WA-R-1');
  assert.equal(p.linha.status_envio, 'PENDENTE');
  assert.equal(r.interpretar, null);
});

test('decisão NAO_OS e SEM_ASSOCIACAO não perguntam nem interpretam', () => {
  const nao = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'NAO_OS', confianca: 0.9, motivo: 'saudação' }, ctxDecisao));
  assert.equal(nao.operacoes.length, 1);
  assert.equal(nao.operacoes[0].linha.associacao, 'NAO_OS');
  const sem = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'OS', os: '90001', confianca: 0.5, motivo: 'incerto' }, ctxDecisao));
  assert.equal(sem.resultado, 'SEM_ASSOCIACAO');
  assert.equal(sem.operacoes[0].linha.associacao, undefined);
  assert.equal(sem.operacoes[0].linha.associacao_motivo, 'incerto');
  assert.equal(sem.interpretar, null);
});

test('modo resposta: escolheu a OS liga original e resposta e fecha a pergunta', () => {
  const pergunta = { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-1', grupo_jid: 'grupo-teste@g.us' };
  const resposta = { ...msgLinha, id: 'WA-R-2', evolution_id: 'EVO-2', texto: 'é a blusa' };
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: resposta, candidatos: cands().filter((c) => c.os !== '90003'), pergunta, original: msgLinha },
    { resultado: 'OS', os: '90001', confianca: 0.95, motivo: 'respondeu blusa' }, ctxDecisao));
  assert.equal(r.resultado, 'OS');
  const porId = Object.fromEntries(r.operacoes.map((o) => [o.linha.id, o.linha]));
  assert.equal(porId['WA-R-2'].associacao, 'IA');
  assert.equal(porId['WA-R-2'].interpretacao_status, '');
  assert.equal(porId['WA-R-1'].deal_id, '700001');
  assert.equal(porId['WA-R-1'].interpretacao_status, 'PENDENTE');
  assert.equal(porId['WA-P-1'].pergunta_fechada_em, '2026-10-22T13:00:05.000Z');
  assert.equal(porId['WA-P-1'].deal_id, '700001');
  assert.deepEqual(r.interpretar, { mensagemId: 'WA-R-1', dealId: '700001' });
});

test('modo resposta: não respondeu segue o fluxo normal, sem nova pergunta', () => {
  const pergunta = { id: 'WA-P-1', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-1' };
  const entrada = { mensagem: { ...msgLinha, id: 'WA-R-3' }, candidatos: cands(), pergunta, original: msgLinha };
  const nao = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'NAO_OS', confianca: 0.9, motivo: 'outro assunto' }, ctxDecisao));
  assert.deepEqual(nao.operacoes.map((o) => [o.linha.id, o.linha.associacao]), [['WA-R-3', 'NAO_OS']]);
  const duvida = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }, ctxDecisao));
  assert.equal(duvida.resultado, 'SEM_ASSOCIACAO');
  assert.equal(duvida.operacoes.length, 1);
});

test('saída inválida do modelo falha', () => {
  const r = ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null }, { resultado: 'OS', os: '12345', confianca: 0.9 }, ctxDecisao);
  assert.equal(r.ok, false);
});

test('perguntas com mais de 24 h fecham e a original volta para SEM_ASSOCIACAO', () => {
  const linhas = [
    { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'g@g.us', quando: '2026-10-21T10:00:00.000Z', pergunta_mensagem_id: 'WA-R-1', pergunta_fechada_em: '' },
    { id: 'WA-R-1', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', grupo_jid: 'g@g.us', quando: '2026-10-21T09:59:00.000Z' },
    { id: 'WA-P-2', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'h@g.us', quando: '2026-10-22T10:00:00.000Z', pergunta_mensagem_id: 'WA-R-9', pergunta_fechada_em: '' }
  ];
  const r = limpo(ctx.fecharPerguntasVencidasWhatsapp(linhas, '2026-10-22T11:00:00.000Z'));
  assert.deepEqual(r.operacoes.map((o) => o.linha), [
    { id: 'WA-P-1', pergunta_fechada_em: '2026-10-22T11:00:00.000Z' },
    { id: 'WA-R-1', associacao: 'SEM_ASSOCIACAO' }
  ]);
});

test('corpo do envio: cita a mensagem original quando a linha responde a ela', () => {
  const linhas = [
    { id: 'WA-P-1', resposta_a_evolution_id: 'EVO-1', grupo_jid: 'grupo-teste@g.us', texto: 'Olá! Essa mensagem é sobre *A* ou *B*?' },
    { id: 'WA-R-1', evolution_id: 'EVO-1', participante_jid: '5500000000001@s.whatsapp.net', texto: 'a blusa sai dia 27', direcao: 'RECEBIDA' }
  ];
  assert.deepEqual(limpo(ctx.corpoEnvioWhatsapp({ id: 'WA-P-1', grupo_jid: 'grupo-teste@g.us', texto: 'Olá! Essa mensagem é sobre *A* ou *B*?' }, linhas)), {
    number: 'grupo-teste@g.us', text: 'Olá! Essa mensagem é sobre *A* ou *B*?',
    quoted: { key: { id: 'EVO-1', remoteJid: 'grupo-teste@g.us', fromMe: false, participant: '5500000000001@s.whatsapp.net' }, message: { conversation: 'a blusa sai dia 27' } }
  });
  assert.deepEqual(limpo(ctx.corpoEnvioWhatsapp({ id: 'X', grupo_jid: 'g@g.us', texto: 'oi' }, [{ id: 'X' }])), { number: 'g@g.us', text: 'oi' });
});
