const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const quando = '2026-10-23T11:52:34.000Z';

// QA de 23/10: o intérprete tirou a data de OUTRA mensagem da conversa.
test('evidência fora da mensagem rebaixa para observação, sem data', () => {
  const v = limpo(ctx.validarInterpretacaoWhatsapp(
    { tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-29', resumo: 'Nova data 29/10', evidencia: 'o TESTE PCP fica pronto dia 29', confianca: 0.95 },
    quando, 'essa vai atrasar uns dias, faltou aviamento'));
  assert.equal(v.ok, true);
  assert.equal(v.tipo, 'OBSERVACAO');
  assert.equal(v.valor, '');
  assert.equal(v.evidencia, '');
  assert.equal(v.resumo, 'Mensagem da oficina: essa vai atrasar uns dias, faltou aviamento');
});

test('evidência dentro da mensagem (sem acento, maiúsculas ou pontuação) continua valendo', () => {
  const v = limpo(ctx.validarInterpretacaoWhatsapp(
    { tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-29', resumo: 'Nova data 29/10', evidencia: 'fica pronto dia 29', confianca: 0.95 },
    quando, 'O TESTE PCP fica pronto, dia 29!'));
  assert.equal(v.tipo, 'NOVA_DATA_COMBINADA');
  assert.equal(v.valor, '2026-10-29');
});

test('sem o texto da mensagem, a validação segue como antes', () => {
  const v = limpo(ctx.validarInterpretacaoWhatsapp(
    { tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-29', resumo: 'x', evidencia: 'qualquer', confianca: 0.95 }, quando));
  assert.equal(v.tipo, 'NOVA_DATA_COMBINADA');
});

test('concluir a entrada usa o texto da mensagem preparada', () => {
  const preparada = { ok: true, precisaInterpretar: true, mensagemId: 'WA-R-1', quando, dealId: '700001', os: '90001', versao: 'v1', texto: 'essa vai atrasar', operacoes: [] };
  const r = limpo(ctx.concluirEntradaWhatsapp(preparada,
    { tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-29', resumo: 'x', evidencia: 'pronto dia 29', confianca: 0.95 },
    { agora: quando, gerarId: () => 'WA-S-1' }));
  assert.equal(r.operacoes[0].linha.tipo, 'OBSERVACAO');
});
