const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const HOJE = new Date(2026, 9, 7);
const T0 = Date.UTC(2026, 9, 7, 15, 0, 0);

function linha(o) {
  return Object.assign({
    id: 'a', os: '90001', ciclo: 'PEDIDO', referencia: 'REF1', descricao_peca: 'PECA TESTE A',
    cliente: 'CLIENTE ALFA', secao: 'COSTURA', descricao_item: 'ZIPER METAL', nome_cor: 'preto',
    unidade: 'UN', qtd_necessaria: 10, qtd_separada: 0, qtd_falta: 10, qtd_falta_g: '', status: 'ABERTO',
    data_separacao: '2026-10-01 09:00', data_atualizacao: '', deal_id: '600001',
    qtd_baixada: '', atualizado_em_app: ''
  }, o);
}
function cp(o) {
  return Object.assign({
    deal_id: '600001', os: '90001', responsavel: '', previsao: '', observacao: '',
    coluna_manual: '', coluna_manual_em: '', atualizado_em: ''
  }, o);
}
function montar(faltantes, extras) {
  return limpo(ctx.montarCaixas(faltantes, [], HOJE, extras));
}

test('item: baixada, resta e restaG proporcional', () => {
  const r = montar([linha({ qtd_falta: 10, qtd_falta_g: 500, qtd_baixada: '4', atualizado_em_app: '2026-10-07T12:00:00.000Z' })]);
  const i = r.caixas[0].itens[0];
  assert.equal(i.baixada, 4);
  assert.equal(i.resta, 6);
  assert.equal(i.restaG, 300);
  assert.equal(i.versao, '2026-10-07T12:00:00.000Z');
  assert.equal(i.editavel, true);
});

test('item: falta null mantem resta null e aberto; baixa total fecha o item', () => {
  const sem = montar([
    linha({ id: 'x', qtd_falta: '' }),
    linha({ id: 'y', qtd_falta: 3, qtd_baixada: 3 })
  ]).caixas[0].itens;
  assert.equal(sem[0].resta, null);
  assert.equal(sem[0].restaG, null);
  assert.equal(sem[1].resta, 0);
  const c = montar([
    linha({ id: 'p1', qtd_falta: 3, qtd_baixada: 3 }),
    linha({ id: 'p2', qtd_falta: 3, qtd_baixada: 1 }),
    linha({ id: 'p3', qtd_falta: '' }),
    linha({ id: 'c1', ciclo: 'CORTE' })
  ]).caixas[0].itens.map((i) => i.id);
  assert.deepEqual(c, ['p2', 'p3', 'c1']);
});

test('item do texto da CAIXAS GANHAS nao e editavel', () => {
  const r = limpo(ctx.montarCaixas([], [{
    deal_id: '7', os: '1', saiu_com_falta: 'SIM', itens_faltando: 'FITA (falta 2 MT)', data_ganho: '2026-10-02 10:00'
  }], HOJE));
  assert.equal(r.caixas[0].itens[0].editavel, false);
  assert.equal(r.caixas[0].itens[0].resta, 2);
});

test('caixa: previsao, observacao, versao e responsavel da CAIXAS_PCP; sem aba continua igual', () => {
  const sem = montar([linha({ responsavel: 'Maria' })]).caixas[0];
  assert.deepEqual([sem.previsao, sem.observacao, sem.versao, sem.colunaManual, sem.historico],
    ['', '', '', null, []]);
  const c = montar([linha({ responsavel: 'Maria' })], {
    caixasPcp: [cp({ previsao: '2026-10-12', observacao: 'ligar', atualizado_em: 'V1', responsavel: 'Joana' })]
  }).caixas[0];
  assert.equal(c.previsao, '2026-10-12');
  assert.equal(c.observacao, 'ligar');
  assert.equal(c.versao, 'V1');
  assert.equal(c.responsavel, 'Joana');
});

test('colunaManual: vale ate um item ser atualizado depois; data_atualizacao e Brasilia', () => {
  const manual = { coluna_manual: 'saiu_sem', coluna_manual_em: '2026-10-07T12:00:00.000Z' };
  const col = (l) => montar([linha(l)], { caixasPcp: [cp(manual)] }).caixas[0].colunaManual;
  assert.equal(col({}), 'saiu_sem');
  assert.equal(col({ atualizado_em_app: '2026-10-07T11:59:59.000Z' }), 'saiu_sem');
  assert.equal(col({ atualizado_em_app: '2026-10-07T12:00:01.000Z' }), null);
  // 08:59 em Brasilia = 11:59 UTC (antes); 09:01 = 12:01 UTC (depois)
  assert.equal(col({ data_atualizacao: '2026-10-07 08:59' }), 'saiu_sem');
  assert.equal(col({ data_atualizacao: '2026-10-07 09:01' }), null);
  assert.equal(montar([linha({})], { caixasPcp: [cp({ coluna_manual: 'invalida', coluna_manual_em: manual.coluna_manual_em })] })
    .caixas[0].colunaManual, null);
});

test('historico: por deal, mais novo primeiro, corte em 30', () => {
  const h = [];
  for (let i = 0; i < 35; i++) {
    h.push({ deal_id: '600001', quando: '2026-10-07T10:' + String(i).padStart(2, '0') + ':00.000Z',
      usuario: 'Ana', texto: 't' + i, ploomes_status: 'ENVIADO' });
  }
  h.push({ deal_id: '999', quando: '2026-10-08T00:00:00.000Z', usuario: 'Ana', texto: 'outra', ploomes_status: 'PENDENTE' });
  const c = montar([linha({})], { historico: h }).caixas[0].historico;
  assert.equal(c.length, 30);
  assert.deepEqual(c[0], { quando: '2026-10-07T10:34:00.000Z', usuario: 'Ana', texto: 't34', ploomes: 'ENVIADO' });
  assert.equal(c[29].texto, 't5');
});

test('montarRespostaBoard: usuarios ativos ordenados', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, { usuarios: [
    { nome: 'Zeca', ativo: 'SIM' }, { nome: 'Ana', ativo: 's' }, { nome: 'Beto', ativo: 'NAO' }, { nome: 'Álvaro', ativo: '1' }
  ] }));
  assert.deepEqual(r.body.usuarios, ['Álvaro', 'Ana', 'Zeca']);
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [], [], T0)).body.usuarios, []);
});

// ---- processarAcao ----
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'ana@x.com', nome: 'Ana', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' },
  { email: 'pcp@x.com', nome: 'Paulo', perfil: 'pcp', senha_hash: HASH, ativo: 'SIM' }];
function sessao(estado, email) {
  const r = ctx.processarLogin(crypto, estado, { email, senha: 'senha-forte-123' }, USUARIOS, T0);
  return 'Bearer ' + r.body.token;
}
let n = 0;
const gerarId = () => 'id-' + (++n);
const FALT = [linha({ id: 'a', qtd_falta: 10, atualizado_em_app: 'V1' })];

test('processarAcao: 401 sem sessao', () => {
  const r = limpo(ctx.processarAcao({}, 'Bearer ' + '0'.repeat(64), { tipo: 'baixa' }, { faltantes: FALT, caixasPcp: [] }, T0, gerarId));
  assert.deepEqual(r, { status: 401, body: { erro: 'Sessão expirada.' } });
});

test('processarAcao: 400, 404 e 409', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  const lin = { faltantes: FALT, caixasPcp: [] };
  let r = limpo(ctx.processarAcao(e, cab, { tipo: 'baixa', dealId: '600001', itemId: 'a', valor: 0, versao: 'V1' }, lin, T0, gerarId));
  assert.equal(r.status, 400);
  r = limpo(ctx.processarAcao(e, cab, { tipo: 'baixa', dealId: '600001', itemId: 'nao', valor: 1, versao: 'V1' }, lin, T0, gerarId));
  assert.deepEqual(r, { status: 404, body: { erro: 'Item não encontrado.' } });
  r = limpo(ctx.processarAcao(e, cab, { tipo: 'baixa', dealId: 'outro', itemId: 'a', valor: 1, versao: 'V1' }, lin, T0, gerarId));
  assert.equal(r.status, 404);
  r = limpo(ctx.processarAcao(e, cab, { tipo: 'baixa', dealId: '600001', itemId: 'a', valor: 1, versao: 'VELHA' }, lin, T0, gerarId));
  assert.deepEqual(r, { status: 409, body: { erro: 'Alguém alterou esta caixa agora há pouco.' } });
});

test('processarAcao: 200 de item limpa o cache e devolve gravacao e historico', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  e.board = { corpo: {}, guardadoEm: T0 };
  const r = limpo(ctx.processarAcao(e, cab, { tipo: 'baixa', dealId: '600001', itemId: 'a', valor: 4, versao: 'V1' },
    { faltantes: FALT, caixasPcp: [] }, T0, gerarId));
  const iso = new Date(T0).toISOString();
  assert.equal(r.status, 200);
  assert.equal(e.board, undefined);
  assert.deepEqual(r.body, { ok: true, versao: iso, historico: { quando: iso, usuario: 'Ana',
    texto: 'Ana deu baixa: 4 UN de ZIPER METAL (resta 6 UN)', ploomes: 'PENDENTE' } });
  assert.equal(r.gravacao.aba, 'FALTANTES');
  assert.equal(r.gravacao.campos.qtd_baixada, 4);
  assert.equal(r.historico.os, '90001');
  assert.equal(r.historico.email, 'ana@x.com');
});

test('processarAcao: caixa sem linha na CAIXAS_PCP; perfil nao ADM exige justificativa', () => {
  const e = {}; const cab = sessao(e, 'ana@x.com');
  const lin = { faltantes: FALT, caixasPcp: [] };
  const r = limpo(ctx.processarAcao(e, cab, { tipo: 'previsao_caixa', dealId: '600001', valor: '2026-10-12', versao: '' }, lin, T0, gerarId));
  assert.equal(r.status, 200);
  assert.equal(r.gravacao.aba, 'CAIXAS_PCP');
  assert.equal(r.gravacao.campos.os, '90001');
  const e2 = {}; const cab2 = sessao(e2, 'pcp@x.com');
  const r2 = limpo(ctx.processarAcao(e2, cab2, { tipo: 'mover', dealId: '600001', valor: 'saiu_sem', versao: '', justificativa: 'curta' }, lin, T0, gerarId));
  assert.equal(r2.status, 400);
  const r3 = limpo(ctx.processarAcao(e, cab, { tipo: 'obs_caixa', dealId: '600001', valor: 'x', versao: 'errada' },
    { faltantes: FALT, caixasPcp: [cp({ atualizado_em: 'C1' })] }, T0, gerarId));
  assert.equal(r3.status, 409);
});
