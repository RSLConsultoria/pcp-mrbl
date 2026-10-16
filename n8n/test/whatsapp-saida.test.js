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

// ----- Novas tentativas automáticas do envio (16/10) -----
// Certeza de que não saiu: repete sozinho com espera crescente, até 5 tentativas.
// Incerto (pode ter saído): ERRO e reenvio humano, como antes.
const RECUSADA_CONEXAO = { error: { message: 'The service refused the connection - perhaps it is offline', code: 'ECONNREFUSED' } };
const DNS = { error: { message: 'getaddrinfo ENOTFOUND evolution' } };
const DESCONECTADA = { statusCode: 400, body: { status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } } };
const INSTANCIA_AUSENTE = { statusCode: 404, body: { response: { message: ['The "producao" instance does not exist'] } } };

test('classifica a resposta da Evolution: enviada, repetir, incerto ou recusada', () => {
  const c = (r) => ctx.classificarEnvioWhatsapp(r).tipo;
  assert.equal(c({ statusCode: 201, body: { key: { id: 'EV-1' } } }), 'ENVIADA');
  assert.equal(c(RECUSADA_CONEXAO), 'REPETIR');
  assert.equal(c(DNS), 'REPETIR');
  assert.equal(c({ error: { message: 'connect EHOSTUNREACH 10.0.0.1:8080' } }), 'REPETIR');
  assert.equal(c({ statusCode: 429, body: {} }), 'REPETIR');
  // 400 tem texto livre na Evolution v2 (pode embrulhar falha depois de enviar): nunca repete.
  assert.equal(c(DESCONECTADA), 'RECUSADA');
  assert.equal(c({ statusCode: 400, body: { response: { message: ['instância indisponível'] } } }), 'RECUSADA');
  assert.equal(c({ statusCode: 404, body: { message: 'Cannot POST /message/x' } }), 'RECUSADA');
  assert.equal(c(INSTANCIA_AUSENTE), 'REPETIR');
  assert.equal(c({ statusCode: 400, body: { response: { message: ['número inválido'] } } }), 'RECUSADA');
  assert.equal(c({ statusCode: 401, body: {} }), 'RECUSADA');
  assert.equal(c({ statusCode: 503, body: {} }), 'INCERTO');
  assert.equal(c({ statusCode: 200, body: {} }), 'INCERTO');
  assert.equal(c({ error: { message: 'timeout of 30000ms exceeded', code: 'ECONNABORTED' } }), 'INCERTO');
  assert.equal(c({ error: { message: 'The connection to the server was closed unexpectedly', code: 'ECONNRESET' } }), 'INCERTO');
  assert.equal(c({}), 'INCERTO');
});

test('certeza de que não saiu volta para PENDENTE com espera crescente (5, 15, 30, 60 min)', () => {
  const esperas = [5, 15, 30, 60];
  for (let anteriores = 0; anteriores < 4; anteriores++) {
    const r = limpo(ctx.resultadoSaidaWhatsapp(mensagem({ envio_tentativas: anteriores || '' }), RECUSADA_CONEXAO, AGORA));
    assert.equal(r.status_envio, 'PENDENTE');
    assert.equal(r.evolution_id, '');
    assert.equal(r.envio_tentativas, anteriores + 1);
    assert.equal(r.envio_proxima, new Date(Date.parse(AGORA) + esperas[anteriores] * 60000).toISOString());
    assert.match(r.erro, /nova tentativa autom/i);
  }
});

test('na quinta falha certa vira ERRO para reenvio humano', () => {
  const r = limpo(ctx.resultadoSaidaWhatsapp(mensagem({ envio_tentativas: 4 }), { statusCode: 429, body: {} }, AGORA));
  assert.equal(r.status_envio, 'ERRO');
  assert.equal(r.envio_tentativas, 5);
  assert.equal(r.envio_proxima, '');
  assert.match(r.erro, /5 tentativas/);
});

test('incerto, recusado e sucesso sem ID ficam para reenvio humano, sem repetição automática', () => {
  const casos = [
    [{ statusCode: 400, body: {} }, /recusou.*400/i],
    [{ statusCode: 503, body: {} }, /incerto.*503/i],
    [{ error: { message: 'timeout ficticio' } }, /incerto.*timeout/i],
    [{ statusCode: 200, body: {} }, /sem ID/i]
  ];
  for (const [resposta, padrao] of casos) {
    const r = limpo(ctx.resultadoSaidaWhatsapp(mensagem({ envio_tentativas: 2 }), resposta, AGORA));
    assert.equal(r.status_envio, 'ERRO');
    assert.equal(r.evolution_id, '');
    assert.match(r.erro, padrao);
    assert.equal('envio_proxima' in r, false);
  }
});

test('seleção da saída respeita a próxima tentativa', () => {
  const futura = mensagem({ id: 'MSG-ESPERA', criado_em: '2026-10-15T12:00:00.000Z', envio_tentativas: 1, envio_proxima: '2026-10-15T14:05:00.000Z' });
  const vencida = mensagem({ id: 'MSG-VENCIDA', criado_em: '2026-10-15T12:30:00.000Z', envio_tentativas: 2, envio_proxima: '2026-10-15T13:59:00.000Z' });
  assert.equal(ctx.selecionarSaidaWhatsapp([futura], AGORA), null);
  assert.equal(ctx.selecionarSaidaWhatsapp([futura, vencida], AGORA).id, 'MSG-VENCIDA');
});

// ----- Conexão conferida antes do envio (GET /instance/connectionState) -----
test('avaliarConexaoWhatsapp: só "open" libera o envio', () => {
  const a = (r) => limpo(ctx.avaliarConexaoWhatsapp(r));
  assert.deepEqual(a({ statusCode: 200, body: { instance: { instanceName: 'producao', state: 'open' } } }), { aberta: true, motivo: '' });
  assert.equal(a({ statusCode: 200, body: { instance: { state: 'close' } } }).aberta, false);
  assert.match(a({ statusCode: 200, body: { instance: { state: 'connecting' } } }).motivo, /desconectad.*connecting/i);
  assert.match(a(RECUSADA_CONEXAO).motivo, /fora do ar/i);
  assert.match(a(INSTANCIA_AUSENTE).motivo, /404/);
  assert.equal(a({ statusCode: 500, body: {} }).aberta, false);
  assert.equal(a({}).aberta, false);
});

test('sem conexão aberta a mensagem não é enviada e volta para a fila (certeza de que não saiu)', () => {
  const fechada = { aberta: false, motivo: 'instância do WhatsApp desconectada (estado: close)' };
  const r = limpo(ctx.resultadoSemConexaoWhatsapp(mensagem({ envio_tentativas: 1 }), fechada, AGORA));
  assert.equal(r.status_envio, 'PENDENTE');
  assert.equal(r.envio_tentativas, 2);
  assert.equal(r.envio_proxima, new Date(Date.parse(AGORA) + 15 * 60000).toISOString());
  assert.match(r.erro, /desconectada/);
  const ultima = limpo(ctx.resultadoSemConexaoWhatsapp(mensagem({ envio_tentativas: 4 }), fechada, AGORA));
  assert.equal(ultima.status_envio, 'ERRO');
  assert.equal(ultima.envio_tentativas, 5);
});
