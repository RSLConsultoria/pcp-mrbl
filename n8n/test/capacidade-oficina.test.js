// Ação alterar_capacidade_oficina (19/10): só ADM, só a aba OFICINAS.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-19T14:00:00.000Z');
function contexto(perfil) {
  const ctx = carregar({ real: true });  // DEALS_PRODUCAO_EDITAVEIS fica restrita ao card de teste: capacidade não depende dela
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil, senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const login = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0);
  return { ctx, estado, cab: 'Bearer ' + login.body.token };
}
const linhas = () => ({ oficinas: [
  { ploomes_id: 'of-1', nome: 'OFICINA A', ativo: 'SIM', capacidade_semana: '' },
  { ploomes_id: 'of-2', nome: 'OFICINA INATIVA', ativo: 'NAO', capacidade_semana: 100 }
] });

test('ADM grava a capacidade da oficina só na OFICINAS, sem Ploomes nem histórico', () => {
  const { ctx, estado, cab } = contexto('ADM');
  const corpo = { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 };
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo, T0)), { ok: true });
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'X'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id',
    linha: { ploomes_id: 'of-1', capacidade_semana: 600, atualizado_em: '2026-10-19T14:00:00.000Z' } }]);
  assert.deepEqual(r.historicos, []);
  assert.equal(r.ploomes, null);
  assert.equal(r.interpretar, null);
  assert.equal(r.body.versao, '2026-10-19T14:00:00.000Z');
});

test('capacidade vazia (null ou "") limpa o valor: sem capacidade, sem cor de alerta', () => {
  const { ctx, estado, cab } = contexto('ADM');
  for (const capacidade of [null, '']) {
    const r = limpo(ctx.processarAcao(estado, cab, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade }, linhas(), T0, () => 'X'));
    assert.equal(r.status, 200);
    assert.equal(r.operacoes[0].linha.capacidade_semana, '');
  }
});

test('capacidade recusa não ADM, número inválido, oficina inexistente ou inativa', () => {
  const adm = contexto('ADM');
  const op = contexto('PCP');
  const corpo = { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 };
  assert.equal(op.ctx.preValidarAcao(op.estado, op.cab, corpo, T0).status, 403);
  assert.equal(op.ctx.processarAcao(op.estado, op.cab, corpo, linhas(), T0, () => 'X').status, 403);
  assert.equal(adm.ctx.preValidarAcao(adm.estado, 'Bearer ' + 'a'.repeat(64), corpo, T0).status, 401);
  for (const capacidade of [-1, 1.5, 'dez', '12a', 2000000]) {
    const r = adm.ctx.preValidarAcao(adm.estado, adm.cab, { ...corpo, capacidade }, T0);
    assert.equal(r.status, 400, String(capacidade));
    assert.match(r.body.erro, /número inteiro/);
  }
  assert.equal(adm.ctx.preValidarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: '' }, T0).status, 400);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: 'of-9' }, linhas(), T0, () => 'X').status, 404);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: 'of-2' }, linhas(), T0, () => 'X').status, 404);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, capacidade: '450' }, linhas(), T0, () => 'X').status, 200);
});

test('gravação da capacidade exige a coluna capacidade_semana na OFICINAS', () => {
  const { ctx, estado, cab } = contexto('ADM');
  const r = ctx.processarAcao(estado, cab, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 }, linhas(), T0, () => 'X');
  const planilha = (cab2) => ctx.planilhaDoLote({ valueRanges: [{ range: "'OFICINAS'!A1:Z9", values: [cab2, ['of-1', 'OFICINA A', '', '', 'SIM', 'T0', '']] }] }, ['OFICINAS']);
  assert.throws(() => ctx.requisicoesDeEscrita(r.operacoes, [], planilha(['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em']), 'DOC'),
    /Cabeçalho obrigatório ausente: OFICINAS\.capacidade_semana/);
  const reqs = limpo(ctx.requisicoesDeEscrita(r.operacoes, [], planilha(['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em', 'capacidade_semana']), 'DOC'));
  assert.deepEqual(reqs[0].body.data, [{ range: "'OFICINAS'!F2:G2", values: [['2026-10-19T14:00:00.000Z', 600]] }]);
});

test('board devolve a capacidade das oficinas (null quando vazia)', () => {
  const ctx = carregar();
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, { oficinas: [
    { ploomes_id: 'of-1', nome: 'OFICINA A', ativo: 'SIM', capacidade_semana: 600 },
    { ploomes_id: 'of-3', nome: 'OFICINA B', ativo: 'SIM', capacidade_semana: '' }
  ] })).body;
  assert.deepEqual(r.oficinas.map((o) => [o.nome, o.capacidadeSemana]), [['OFICINA A', 600], ['OFICINA B', null]]);
});
