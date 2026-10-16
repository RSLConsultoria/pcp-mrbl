// Novas tentativas do intérprete (16/10): a mensagem fica "a interpretar"
// (interpretacao_status = PENDENTE) com contador e próxima tentativa. Cada
// tentativa é reservada antes de chamar o modelo; o agendamento de 15 min pega
// as vencidas sem sugestão e, depois de 5 tentativas, marca ERRO definitivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const AGORA = '2026-10-13T14:00:00.000Z';
const mais = (min) => new Date(Date.parse(AGORA) + min * 60000).toISOString();
const PRODUCAO = [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', atualizado_em_ploomes: 'v1', peca: 'PECA TESTE B' }];
const recebida = (extra) => Object.assign({
  id: 'WA-R-1', quando: '2026-10-13T13:00:00.000Z', direcao: 'RECEBIDA', tipo_conteudo: 'TEXTO', texto: 'Fica pronta dia 22.',
  deal_id: '700001', os: '90001', oficina_id: 'of-1', associacao: 'CITACAO',
  interpretacao_status: 'PENDENTE', interpretacao_tentativas: 1, interpretacao_proxima: '2026-10-13T13:10:00.000Z'
}, extra);

test('entrada que precisa do intérprete já grava a mensagem como a interpretar (1ª tentativa reservada)', () => {
  const evento = {
    event: 'messages.upsert', instance: 'producao',
    data: { key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'EV-1', participant: 'p@s.whatsapp.net' }, pushName: 'Pessoa Teste',
      messageTimestamp: 1791897600, message: { extendedTextMessage: { text: 'A OS 90001 fica pronta amanhã.' } } }
  };
  const dados = { oficinas: [{ ploomes_id: 'of-1', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }], producao: PRODUCAO, mensagens: [] };
  const p = limpo(ctx.prepararEntradaWhatsapp(evento, dados, { agora: AGORA, gerarId: () => 'WA-R-1' }));
  assert.equal(p.precisaInterpretar, true);
  const linha = p.operacoes[0].linha;
  assert.equal(linha.interpretacao_status, 'PENDENTE');
  assert.equal(linha.interpretacao_tentativas, 1);
  assert.equal(linha.interpretacao_proxima, mais(10));

  evento.data.message.extendedTextMessage.text = 'Sem OS e sem citação.';
  const sem = limpo(ctx.prepararEntradaWhatsapp(evento, dados, { agora: AGORA, gerarId: () => 'WA-R-2' }));
  assert.equal(sem.precisaInterpretar, false);
  assert.equal(sem.operacoes[0].linha.interpretacao_status, '');
  assert.equal(sem.operacoes[0].linha.interpretacao_tentativas, '');
  assert.equal(sem.operacoes[0].linha.interpretacao_proxima, '');
});

test('Interpretar WhatsApp reserva a próxima tentativa antes de chamar o modelo', () => {
  const dados = { producao: PRODUCAO, mensagens: [recebida()], sugestoes: [], faltantes: [], ganhas: [] };
  const r = limpo(ctx.prepararInterpretacaoManualWhatsapp(dados, { mensagemId: 'WA-R-1', dealId: '700001' }, '2026-10-13', AGORA));
  assert.equal(r.interpretar, true);
  assert.deepEqual(r.reserva, { id: 'WA-R-1', interpretacao_status: 'PENDENTE', interpretacao_tentativas: 2, interpretacao_proxima: mais(10) });
  const esgotada = { producao: PRODUCAO, mensagens: [recebida({ interpretacao_tentativas: 5 })], sugestoes: [], faltantes: [], ganhas: [] };
  assert.equal(ctx.prepararInterpretacaoManualWhatsapp(esgotada, { mensagemId: 'WA-R-1', dealId: '700001' }, '2026-10-13', AGORA).motivo, 'LIMITE_TENTATIVAS');
});

test('agendamento pega só as vencidas sem sugestão e marca ERRO depois de 5 tentativas', () => {
  const mensagens = [
    recebida({ id: 'VENCIDA', quando: '2026-10-13T12:00:00.000Z' }),
    recebida({ id: 'ASSOCIADA-SEM-TENTATIVA', quando: '2026-10-13T12:10:00.000Z', interpretacao_tentativas: 0, interpretacao_proxima: '2026-10-13T13:50:00.000Z' }),
    recebida({ id: 'FUTURA', interpretacao_proxima: mais(5) }),
    recebida({ id: 'COM-SUGESTAO' }),
    recebida({ id: 'ESGOTADA', interpretacao_tentativas: 5 }),
    recebida({ id: 'JA-ERRO', interpretacao_status: 'ERRO', interpretacao_tentativas: 5 }),
    recebida({ id: 'NUNCA-FALHOU', interpretacao_status: '', interpretacao_tentativas: '', interpretacao_proxima: '' }),
    recebida({ id: 'SEM-OS', deal_id: '' }),
    recebida({ id: 'OUTRA-OS', deal_id: '799999' }),
    recebida({ id: 'NAO-TEXTO', tipo_conteudo: 'NAO_TEXTUAL', texto: '' })
  ];
  const r = limpo(ctx.selecionarInterpretacoesPendentesWhatsapp({
    producao: PRODUCAO, mensagens, sugestoes: [{ id: 'WA-S-COM-SUGESTAO', mensagem_id: 'COM-SUGESTAO', status: 'PENDENTE' }]
  }, AGORA));
  assert.deepEqual(r.interpretar, [{ mensagemId: 'VENCIDA', dealId: '700001' }, { mensagemId: 'ASSOCIADA-SEM-TENTATIVA', dealId: '700001' }]);
  assert.deepEqual(r.erros, [{ id: 'ESGOTADA', interpretacao_status: 'ERRO', interpretacao_proxima: '' }]);
});

test('agendamento limita a quantidade por rodada, das mais antigas para as mais novas', () => {
  const mensagens = [];
  for (let i = 0; i < 15; i++) mensagens.push(recebida({ id: 'M' + String(i).padStart(2, '0'), quando: mais(-100 + i) }));
  const r = ctx.selecionarInterpretacoesPendentesWhatsapp({ producao: PRODUCAO, mensagens: mensagens.reverse(), sugestoes: [] }, AGORA);
  assert.equal(r.interpretar.length, 10);
  assert.equal(r.interpretar[0].mensagemId, 'M00');
});

test('associação manual marca a mensagem como a interpretar, para o agendamento pegar se o disparo falhar', () => {
  const c = carregar();
  c.DEALS_PRODUCAO_EDITAVEIS = ['700001'];
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'ADM', senha_hash: c.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const T0 = Date.parse(AGORA);
  const cab = 'Bearer ' + c.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0).body.token;
  const linhas = {
    producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', atualizado_em_ploomes: 'v1' }],
    oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-ficticio@g.us', ativo: 'SIM' }],
    whatsappMensagens: [{ id: 'MSG-SEM', quando: '2026-10-13T13:00:00.000Z', direcao: 'RECEBIDA', associacao: 'SEM_ASSOCIACAO', deal_id: '', os: '',
      oficina_id: 'of-1', grupo_jid: 'grupo-ficticio@g.us', tipo_conteudo: 'TEXTO', texto: 'Fica pronta dia 22.' }],
    whatsappSugestoes: []
  };
  const r = limpo(c.processarAcao(estado, cab, { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-SEM', versao: 'v1' }, linhas, T0, () => 'H1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes[0].linha, {
    id: 'MSG-SEM', deal_id: '700001', os: '90001', oficina_id: 'of-1', associacao: 'MANUAL',
    interpretacao_status: 'PENDENTE', interpretacao_tentativas: 0, interpretacao_proxima: mais(10)
  });
});
