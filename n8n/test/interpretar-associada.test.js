// C2 (16/10): mensagem associada manualmente também passa pelo intérprete,
// num workflow próprio disparado sem esperar depois da associação gravada.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const PRODUCAO = [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA A', data_combinada: '2026-10-20',
  pecas: 160, peca: 'PECA TESTE B', em_costura: 'SIM', atualizado_em_ploomes: 'v1' }];
const MENSAGEM = { id: 'WA-R-abc', quando: '2026-10-13T13:20:00.000Z', direcao: 'RECEBIDA', tipo_conteudo: 'TEXTO',
  texto: 'As duas ficam prontas dia 22.', deal_id: '700001', os: '90001', oficina_id: 'of-1', associacao: 'MANUAL',
  grupo_jid: 'grupo-ficticio@g.us', participante_jid: 'p@s.whatsapp.net', participante_nome: 'Pessoa Ficticia' };
const dados = (extra) => Object.assign({ producao: PRODUCAO, mensagens: [MENSAGEM], sugestoes: [], faltantes: [], ganhas: [] }, extra);
const pedido = { mensagemId: 'WA-R-abc', dealId: '700001' };

test('prepara a interpretação da mensagem associada com o mesmo contexto da entrada', () => {
  const r = limpo(ctx.prepararInterpretacaoManualWhatsapp(dados(), pedido, '2026-10-13'));
  assert.equal(r.ok, true);
  assert.equal(r.interpretar, true);
  assert.deepEqual(r.preparacao, {
    ok: true, precisaInterpretar: true, mensagemId: 'WA-R-abc', quando: '2026-10-13T13:20:00.000Z', texto: 'As duas ficam prontas dia 22.',
    dealId: '700001', os: '90001', versao: 'v1', operacoes: []
  });
  assert.equal(r.entrada.texto, 'As duas ficam prontas dia 22.');
  assert.equal(r.entrada.peca, 'PECA TESTE B');
  assert.equal(r.entrada.statusPrazo, 'NO_PRAZO');
  assert.match(r.entrada.instrucoes, /citam a peça/);
  assert.doesNotMatch(JSON.stringify(r), /@g\.us|s\.whatsapp\.net|Pessoa Ficticia/);
  // A conclusão reaproveita a da entrada e grava a sugestão com id determinístico.
  const c = limpo(ctx.concluirEntradaWhatsapp(r.preparacao,
    { tipo: 'NOVA_DATA_COMBINADA', valor: '22/10', resumo: 'Entrega dia 22.', evidencia: 'prontas dia 22', confianca: 0.9 },
    { agora: '2026-10-13T13:30:00.000Z', gerarId: () => ctx.idSugestaoWhatsapp(r.preparacao.mensagemId) }));
  assert.deepEqual(c.operacoes, [{ aba: 'WHATSAPP_SUGESTOES', operacao: 'append', chave: 'id', linha: {
    id: 'WA-S-abc', mensagem_id: 'WA-R-abc', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-22',
    resumo: 'Entrega dia 22.', evidencia: 'prontas dia 22', confianca: 0.9, status: 'PENDENTE', criado_em: '2026-10-13T13:30:00.000Z',
    decidido_em: '', decidido_por: '', versao: 'v1'
  } }]);
});

test('mensagem que já tem sugestão não gera outra', () => {
  for (const s of [{ id: 'WA-S-abc', mensagem_id: 'WA-R-abc', status: 'IGNORADA' }, { id: 'OUTRO', mensagem_id: 'WA-R-abc', status: 'PENDENTE' }]) {
    assert.deepEqual(limpo(ctx.prepararInterpretacaoManualWhatsapp(dados({ sugestoes: [s] }), pedido, '2026-10-13')),
      { ok: true, interpretar: false, motivo: 'JA_TEM_SUGESTAO' });
  }
});

test('não interpreta mensagem ausente, não textual, enviada, de outra OS ou de OS fora da produção', () => {
  const motivo = (d, p) => ctx.prepararInterpretacaoManualWhatsapp(d, p || pedido, '2026-10-13').motivo;
  assert.equal(motivo(dados({ mensagens: [] })), 'MENSAGEM_NAO_ENCONTRADA');
  assert.equal(motivo(dados({ mensagens: [Object.assign({}, MENSAGEM, { tipo_conteudo: 'NAO_TEXTUAL', texto: '' })] })), 'NAO_TEXTUAL');
  assert.equal(motivo(dados({ mensagens: [Object.assign({}, MENSAGEM, { direcao: 'ENVIADA' })] })), 'MENSAGEM_NAO_ENCONTRADA');
  assert.equal(motivo(dados({ mensagens: [Object.assign({}, MENSAGEM, { deal_id: '700002' })] })), 'ASSOCIACAO_MUDOU');
  assert.equal(motivo(dados({ producao: [] })), 'OS_NAO_ENCONTRADA');
  assert.equal(motivo(dados(), { mensagemId: '', dealId: '700001' }), 'MENSAGEM_NAO_ENCONTRADA');
});

// ----- Ação associar_whatsapp: pede a interpretação ao workflow, sem expor no corpo -----
const T0 = Date.parse('2026-10-13T14:00:00.000Z');
function sessao() {
  const c = carregar();
  c.DEALS_PRODUCAO_EDITAVEIS = ['700001'];
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'ADM', senha_hash: c.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const login = c.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0);
  return { c, estado, cab: 'Bearer ' + login.body.token };
}
const linhasAcao = (msg, sugestoes) => ({
  producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA A', atualizado_em_ploomes: 'v1' }],
  oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }],
  whatsappMensagens: [Object.assign({ id: 'MSG-SEM', quando: '2026-10-13T13:00:00.000Z', direcao: 'RECEBIDA', associacao: 'SEM_ASSOCIACAO',
    deal_id: '', os: '', oficina_id: 'of-1', grupo_jid: 'grupo-ficticio@g.us', tipo_conteudo: 'TEXTO', texto: 'Fica pronta dia 22.' }, msg)],
  whatsappSugestoes: sugestoes || []
});
const corpo = { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-SEM', versao: 'v1' };

test('associar_whatsapp pede a interpretação da mensagem textual ao workflow, fora do corpo da resposta', () => {
  const { c, estado, cab } = sessao();
  const r = limpo(c.processarAcao(estado, cab, corpo, linhasAcao(), T0, () => 'H1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.interpretar, { mensagemId: 'MSG-SEM', dealId: '700001' });
  assert.equal('interpretar' in r.body, false);
});

test('associar_whatsapp não pede interpretação de conteúdo não textual nem de mensagem que já tem sugestão', () => {
  const { c, estado, cab } = sessao();
  const naoTexto = limpo(c.processarAcao(estado, cab, corpo, linhasAcao({ tipo_conteudo: 'NAO_TEXTUAL', texto: '' }), T0, () => 'H1'));
  assert.equal(naoTexto.status, 200);
  assert.equal(naoTexto.interpretar, null);
  const comSugestao = limpo(c.processarAcao(estado, cab, corpo,
    linhasAcao({}, [{ id: 'WA-S-MSG-SEM', mensagem_id: 'MSG-SEM', status: 'IGNORADA' }]), T0, () => 'H1'));
  assert.equal(comSugestao.status, 200);
  assert.equal(comSugestao.interpretar, null);
  const outra = limpo(c.processarAcao(estado, cab,
    { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: '', dataCombinada: '2026-10-25', motivo: 'Teste' }, linhasAcao(), T0, () => 'H1'));
  assert.equal(outra.status, 200, JSON.stringify(outra.body));
  assert.equal(outra.interpretar, null);
});
