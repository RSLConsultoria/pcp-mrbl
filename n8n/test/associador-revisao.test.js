// Revisão final de 23/10: correções do associador e da regra de evidência.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const producao = [
  { deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', peca: 'BLUSA TESTE', referencia: 'R1', pecas: '11' },
  { deal_id: '700002', os: '90002', oficina_id: 'of-1', em_costura: 'SIM', peca: 'CALCA TESTE', referencia: 'R2', pecas: '20' }
];
const cands = () => ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22');
const agora = '2026-10-22T13:00:05.000Z';
const ctxDecisao = { agora, gerarId: () => 'WA-P-9' };
const pergunta = { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', evolution_id: 'EVO-P', status_envio: 'ENVIADA', quando: '2026-10-22T12:00:00.000Z',
  pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-1', grupo_jid: 'g@g.us' };
const original = { id: 'WA-R-1', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', deal_id: '', texto: 'vai atrasar' };
const resposta = { id: 'WA-R-2', evolution_id: 'EVO-2', direcao: 'RECEBIDA', texto: 'é a blusa', grupo_jid: 'g@g.us', resposta_a_evolution_id: '' };

test('modo resposta só liga a original quando o modelo diz que a mensagem responde à pergunta', () => {
  const entrada = { mensagem: resposta, candidatos: cands(), pergunta, original };
  const sem = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'OS', os: '90001', confianca: 0.95, motivo: 'blusa' }, ctxDecisao));
  assert.deepEqual(sem.operacoes.map((o) => o.linha.id), ['WA-R-2']);
  const com = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'OS', os: '90001', confianca: 0.95, motivo: 'blusa', respondePergunta: true }, ctxDecisao));
  assert.deepEqual(com.operacoes.map((o) => o.linha.id).sort(), ['WA-P-1', 'WA-R-1', 'WA-R-2']);
  assert.deepEqual(com.interpretar, { mensagemId: 'WA-R-1', dealId: '700001' });
});

test('citar a pergunta também conta como resposta', () => {
  const citando = { ...resposta, resposta_a_evolution_id: 'EVO-P' };
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: citando, candidatos: cands(), pergunta, original },
    { resultado: 'OS', os: '90002', confianca: 0.95, motivo: 'calça' }, ctxDecisao));
  assert.ok(r.operacoes.some((o) => o.linha.id === 'WA-R-1' && o.linha.deal_id === '700002'));
});

test('original já associada pelo PCP não é sobrescrita: só liga a resposta e fecha a pergunta', () => {
  const manual = { ...original, associacao: 'MANUAL', deal_id: '700002', os: '90002' };
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: resposta, candidatos: cands(), pergunta, original: manual },
    { resultado: 'OS', os: '90001', confianca: 0.95, motivo: 'blusa', respondePergunta: true }, ctxDecisao));
  assert.deepEqual(r.operacoes.map((o) => o.linha.id).sort(), ['WA-P-1', 'WA-R-2']);
  assert.equal(r.interpretar, null);
});

test('pergunta só pode ser respondida depois de enviada e por mensagem posterior', () => {
  const msgs = [pergunta];
  assert.equal(ctx.perguntaRespondivelWhatsapp(msgs, 'g@g.us', '2026-10-22T12:30:00.000Z').id, 'WA-P-1');
  assert.equal(ctx.perguntaRespondivelWhatsapp([{ ...pergunta, status_envio: 'PENDENTE' }], 'g@g.us', '2026-10-22T12:30:00.000Z'), null);
  assert.equal(ctx.perguntaRespondivelWhatsapp(msgs, 'g@g.us', '2026-10-22T11:59:00.000Z'), null);
  // A trava continua valendo para pergunta ainda na fila.
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...pergunta, status_envio: 'PENDENTE' }], 'g@g.us', '2026-10-22T12:30:00.000Z').id, 'WA-P-1');
});

test('grupo travado por pergunta aberta: dúvida vira sem associação, sem segunda pergunta', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: resposta, candidatos: cands(), pergunta: null, original: null, grupoTravado: true },
    { resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }, ctxDecisao));
  assert.equal(r.resultado, 'SEM_ASSOCIACAO');
  assert.equal(r.operacoes.length, 1);
});

test('não é OS com confiança baixa vira sem associação (não some do app)', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: resposta, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'NAO_OS', confianca: 0.6, motivo: 'talvez' }, ctxDecisao));
  assert.equal(r.resultado, 'SEM_ASSOCIACAO');
});

test('pergunta vencida ainda na fila não é mais enviada', () => {
  const linhas = [{ ...pergunta, status_envio: 'PENDENTE', quando: '2026-10-20T10:00:00.000Z' }, original];
  const r = limpo(ctx.fecharPerguntasVencidasWhatsapp(linhas, '2026-10-22T11:00:00.000Z'));
  assert.deepEqual(r.operacoes[0].linha, { id: 'WA-P-1', pergunta_fechada_em: '2026-10-22T11:00:00.000Z', status_envio: 'ERRO', erro: 'Pergunta vencida antes do envio.' });
});

test('até o go-live, só os deals liberados entram como candidatos', () => {
  const c = limpo(ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22', ['700002']));
  assert.deepEqual(c.map((x) => x.os), ['90002']);
  assert.equal(ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22', []).length, 2);
});

test('evidência: paráfrase leve passa; trecho de outra mensagem não', () => {
  const v = (evidencia, msg) => limpo(ctx.validarInterpretacaoWhatsapp(
    { tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-24', resumo: 'x', evidencia, confianca: 0.95 }, '2026-10-22T12:00:00.000Z', msg)).tipo;
  assert.equal(v('entrego … sexta', 'entrego na sexta'), 'NOVA_DATA_COMBINADA');
  assert.equal(v('entrego sexta-feira', 'entrego sexta'), 'NOVA_DATA_COMBINADA');
  assert.equal(v('fica pronto dia 24', 'Fica pronto, dia 24!'), 'NOVA_DATA_COMBINADA');
  assert.equal(v('o TESTE PCP fica pronto dia 29', 'essa vai atrasar uns dias, faltou aviamento'), 'OBSERVACAO');
  // Nova data sem evidência nenhuma, com a mensagem conhecida: sem data.
  assert.equal(v('', 'essa vai atrasar'), 'OBSERVACAO');
});
