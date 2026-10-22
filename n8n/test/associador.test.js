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
