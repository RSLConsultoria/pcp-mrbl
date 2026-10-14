const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-13T14:00:00.000Z');
function contexto() {
  const ctx = carregar();
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['700001'];
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'ADM', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const login = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0);
  return { ctx, estado, cab: 'Bearer ' + login.body.token };
}

const linhas = () => ({
  producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA A', data_combinada: '2026-10-18', atualizado_em_ploomes: 'v1' }],
  oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }, { ploomes_id: 'of-2', nome: 'OFICINA B', ativo: 'SIM' }],
  whatsappMensagens: [{ id: 'MSG-1', deal_id: '700001', oficina_id: 'of-1' }],
  whatsappSugestoes: [{ id: 'SUG-1', mensagem_id: 'MSG-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-20', resumo: 'Entrega dia 20.', status: 'PENDENTE', versao: 'v1' }]
});

test('alterar_producao valida allowlist, versao e motivo e prepara planilha/Ploomes/historico', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-20', motivo: 'Oficina confirmou.' };
  assert.equal(ctx.preValidarAcao(estado, cab, corpo, T0).ok, true);
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{ aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: { deal_id: '700001', oficina_id: 'of-2', oficina_nome: 'OFICINA B', data_combinada: '2026-10-20' } }]);
  assert.equal(r.ploomes.dealId, '700001');
  assert.equal(r.historicos[0].acao, 'PRODUCAO_ALTERAR_COMBINADO');
  assert.match(r.historicos[0].texto, /Oficina confirmou/);
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['outro'];
  assert.equal(ctx.preValidarAcao(estado, cab, corpo, T0).status, 403);
});

test('aceitar sugestao prepara mudanca sem resposta ao grupo; repeticao aceita e idempotente', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Oficina confirmou.' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-2'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes.map((o) => o.aba), ['PRODUCAO', 'WHATSAPP_SUGESTOES']);
  assert.equal(r.ploomes.dealId, '700001');
  assert.equal('mensagem' in r || 'resposta' in r, false);
  const ja = linhas();
  ja.whatsappSugestoes[0].status = 'ACEITA';
  const outra = limpo(ctx.processarAcao(estado, cab, corpo, ja, T0, () => 'NAO-USA'));
  assert.equal(outra.status, 200);
  assert.deepEqual(outra.operacoes, []);
});

test('ignorar sugestao registra decisao sem tocar no Ploomes', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'ignorar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-3'));
  assert.equal(r.status, 200);
  assert.equal(r.ploomes, null);
  assert.deepEqual(r.operacoes.map((o) => o.aba), ['WHATSAPP_SUGESTOES']);
});

test('enviar whatsapp apenas enfileira o texto para o grupo cadastrado', () => {
  const { ctx, estado, cab } = contexto();
  let seq = 0;
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: '*OS 90001*\nBom dia. Qual a previsão de entrega?' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'ID-' + (++seq)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.ploomes, null);
  assert.equal(r.body.mensagemId, 'ID-1');
  assert.deepEqual(r.operacoes, [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: {
    id: 'ID-1', evolution_id: '', quando: '2026-10-13T14:00:00.000Z', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE',
    participante_jid: '', participante_nome: 'Pessoa PCP', direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', tipo_conteudo: 'TEXTO',
    texto: '*OS 90001*\nBom dia. Qual a previsão de entrega?', resposta_a_evolution_id: '', deal_id: '700001', os: '90001',
    oficina_id: 'of-1', associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: '2026-10-13T14:00:00.000Z'
  } }]);
  assert.equal(r.historicos[0].acao, 'WHATSAPP_ENFILEIRAR');
  assert.equal('resposta' in r || 'envio' in r, false);
});

test('enviar whatsapp exige grupo, modelo valido, OS no texto e versao atual', () => {
  const { ctx, estado, cab } = contexto();
  const base = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: '*OS 90001*\nCobrança de teste.' };
  const semGrupo = linhas();
  semGrupo.oficinas[0].grupo_jid = '';
  assert.equal(ctx.processarAcao(estado, cab, base, semGrupo, T0, () => 'X').status, 409);
  assert.equal(ctx.processarAcao(estado, cab, { ...base, modelo: 'INVENTADO' }, linhas(), T0, () => 'X').status, 400);
  assert.equal(ctx.processarAcao(estado, cab, { ...base, texto: 'Sem identificação.' }, linhas(), T0, () => 'X').status, 400);
  assert.equal(ctx.processarAcao(estado, cab, { ...base, versao: 'antiga' }, linhas(), T0, () => 'X').status, 409);
});
