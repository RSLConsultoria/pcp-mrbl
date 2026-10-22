const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');
const ctx = carregar();

const payload = (id, textoMsg) => ({ event: 'messages.upsert', instance: 'producao', data: {
  key: { remoteJid: 'grupo-teste@g.us', fromMe: false, id, participant: '5500000000001@s.whatsapp.net' },
  pushName: 'Pessoa Teste', message: { conversation: textoMsg }, messageTimestamp: 1792690000 } });
const dados = () => ({
  oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }],
  producao: [
    { deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', peca: 'BLUSA TESTE', pecas: '11' },
    { deal_id: '700002', os: '90002', oficina_id: 'of-1', em_costura: 'SIM', peca: 'CALCA TESTE', pecas: '20' }
  ],
  mensagens: []
});
const contexto = { instancia: 'producao', agora: '2026-10-22T13:00:00.000Z', gerarId: (e) => 'WA-R-' + e };

test('sem regra que resolva e com OS na Costura: pede o associador', () => {
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-1', 'a blusa sai dia 27'), dados(), contexto));
  assert.equal(r.precisaInterpretar, false);
  assert.equal(r.precisaAssociar, true);
  assert.deepEqual(r.pedidoAssociador.candidatos.map((c) => c.os), ['90001', '90002']);
  assert.equal(r.pedidoAssociador.mensagem.id, 'WA-R-EVO-1');
  assert.equal(r.pedidoAssociador.pergunta, null);
  assert.ok(!JSON.stringify(r.pedidoAssociador.entrada).includes('5500000000001'));
});

test('com pergunta aberta: todos os candidatos da oficina, a pergunta e a original junto', () => {
  const d = dados();
  d.producao.push({ deal_id: '700003', os: '90003', oficina_id: 'of-1', em_costura: 'SIM', peca: 'SAIA TESTE' });
  d.mensagens = [
    { id: 'WA-R-0', direcao: 'RECEBIDA', grupo_jid: 'grupo-teste@g.us', texto: 'vai atrasar', associacao: 'IA_DUVIDA', quando: '2026-10-22T12:00:00.000Z' },
    { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'grupo-teste@g.us', quando: '2026-10-22T12:00:05.000Z', texto: 'Olá! Essa mensagem é sobre *BLUSA TESTE* ou *CALCA TESTE*?', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-0', pergunta_fechada_em: '' }
  ];
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-2', 'é a blusa'), d, contexto));
  assert.equal(r.precisaAssociar, true);
  assert.deepEqual(r.pedidoAssociador.candidatos.map((c) => c.os), ['90001', '90002', '90003']);
  assert.deepEqual(r.pedidoAssociador.entrada.pergunta.candidatos, ['90001', '90002']);
  assert.equal(r.pedidoAssociador.pergunta.id, 'WA-P-1');
  assert.equal(r.pedidoAssociador.original.id, 'WA-R-0');
  assert.equal(r.pedidoAssociador.entrada.pergunta.mensagemOriginal, 'vai atrasar');
});

test('regra fixa resolvendo (OS no texto) não chama o associador', () => {
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-3', 'a 90001 sai dia 27'), dados(), contexto));
  assert.equal(r.precisaAssociar, false);
  assert.equal(r.precisaInterpretar, true);
});

test('oficina sem OS na Costura não chama o associador', () => {
  const d = dados();
  d.producao = [];
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-4', 'a blusa sai dia 27'), d, contexto));
  assert.equal(r.precisaAssociar, false);
});
