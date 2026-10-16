const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const AGORA = '2026-10-15T14:00:00.000Z';

function mensagem(extra) {
  return Object.assign({
    id: 'MSG-1', evolution_id: '', quando: '2026-10-15T13:00:00.000Z',
    grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO FICTICIO', participante_jid: '', participante_nome: 'Pessoa PCP',
    direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', tipo_conteudo: 'TEXTO', texto: 'Confirma a entrega de *CAMISA TESTE*?',
    resposta_a_evolution_id: '', deal_id: '700001', os: '90001', oficina_id: 'OF-1', associacao: 'MANUAL',
    status_envio: 'PENDENTE', erro: '', criado_em: '2026-10-15T13:00:00.000Z'
  }, extra || {});
}

test('seleciona a pendencia mais antiga e a marca antes do envio externo', () => {
  const r = limpo(ctx.selecionarSaidaWhatsapp([
    mensagem({ id: 'MSG-2', criado_em: '2026-10-15T13:30:00.000Z' }),
    mensagem({ id: 'MSG-1', criado_em: '2026-10-15T13:00:00.000Z' }),
    mensagem({ id: 'MSG-JA', status_envio: 'ENVIADA' })
  ], AGORA));

  assert.equal(r.enviar, true);
  assert.equal(r.id, 'MSG-1');
  assert.equal(r.grupo_jid, 'grupo-ficticio@g.us');
  assert.equal(r.texto, 'Confirma a entrega de *CAMISA TESTE*?');
  assert.deepEqual(r.linha, {
    id: 'MSG-1', status_envio: 'ENVIANDO', erro: 'Tentativa iniciada em 2026-10-15T14:00:00.000Z'
  });
});

test('execucao repetida nao seleciona ENVIANDO e recupera tentativa travada sem reenviar', () => {
  assert.equal(ctx.selecionarSaidaWhatsapp([
    mensagem({ status_envio: 'ENVIANDO', erro: 'Tentativa iniciada em 2026-10-15T13:55:00.000Z' })
  ], AGORA), null);

  const travada = limpo(ctx.selecionarSaidaWhatsapp([
    mensagem({ status_envio: 'ENVIANDO', erro: 'Tentativa iniciada em 2026-10-15T13:40:00.000Z' })
  ], AGORA));
  assert.equal(travada.enviar, false);
  assert.deepEqual(travada.linha, {
    id: 'MSG-1', status_envio: 'ERRO',
    erro: 'Resultado incerto. Confira no WhatsApp antes de confirmar um reenvio.'
  });
});

test('pendencia invalida vira erro sem chamar a Evolution', () => {
  const r = limpo(ctx.selecionarSaidaWhatsapp([mensagem({ grupo_jid: '' })], AGORA));
  assert.equal(r.enviar, false);
  assert.equal(r.linha.status_envio, 'ERRO');
  assert.match(r.linha.erro, /grupo/i);
});

test('linha sem ID e ignorada porque nao existe chave segura para atualiza-la', () => {
  const r = limpo(ctx.selecionarSaidaWhatsapp([
    mensagem({ id: '', criado_em: '2026-10-15T12:00:00.000Z' }),
    mensagem({ id: 'MSG-VALIDA' })
  ], AGORA));
  assert.equal(r.id, 'MSG-VALIDA');
});

test('sucesso guarda o ID devolvido pela Evolution', () => {
  const r = limpo(ctx.resultadoSaidaWhatsapp(mensagem(), {
    statusCode: 201, body: { key: { id: 'EVOLUTION-FICTICIO-1' } }
  }));
  assert.deepEqual(r, {
    id: 'MSG-1', evolution_id: 'EVOLUTION-FICTICIO-1', status_envio: 'ENVIADA', erro: ''
  });
});

test('4xx, 429, 5xx, timeout e sucesso sem ID ficam para reenvio humano', () => {
  const casos = [
    [{ statusCode: 400, body: {} }, /recusou.*400/i],
    [{ statusCode: 429, body: {} }, /limite.*429/i],
    [{ statusCode: 503, body: {} }, /incerto.*503/i],
    [{ error: { message: 'timeout ficticio' } }, /incerto.*timeout/i],
    [{ statusCode: 200, body: {} }, /sem ID/i]
  ];
  for (const [resposta, padrao] of casos) {
    const r = limpo(ctx.resultadoSaidaWhatsapp(mensagem(), resposta));
    assert.equal(r.status_envio, 'ERRO');
    assert.equal(r.evolution_id, '');
    assert.match(r.erro, padrao);
  }
});
