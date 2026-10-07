const test = require('node:test');
const assert = require('node:assert');
const { carregar, limpo } = require('./carregar');

const c = carregar();
const base = { dealId: '9001', versao: '' };
const ok = (corpo, perfil) => limpo(c.validarAcao(corpo, perfil || 'ADM'));
const AGORA = '2026-10-07T12:00:00.000Z';
const ctx = (extra) => Object.assign({
  usuario: 'Lucca', email: 'lucca@exemplo.com', agora: AGORA,
  os: '90001', nomeItem: 'ZÍPER METAL', un: 'UN', gerarId: () => 'id-1',
}, extra || {});

test('validarAcao: tipos validos', () => {
  assert.strictEqual(ok({ ...base, tipo: 'baixa', itemId: 'a', valor: 20 }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'baixa', itemId: 'a', valor: '2,5' }).acao.valor, 2.5);
  assert.strictEqual(ok({ ...base, tipo: 'previsao_item', itemId: 'a', valor: '2026-10-09' }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'previsao_item', itemId: 'a', valor: '' }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'obs_item', itemId: 'a', valor: 'x' }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'responsavel', valor: 'Maria' }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'previsao_caixa', valor: '2026-10-09' }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'obs_caixa', valor: 'a'.repeat(500) }).ok, true);
  assert.strictEqual(ok({ ...base, tipo: 'mover', valor: 'saiu_sem' }).ok, true);
});

test('validarAcao: invalidos', () => {
  const bad = (corpo, perfil) => {
    const r = ok(corpo, perfil);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 400);
    assert.ok(r.erro);
  };
  bad({ ...base, tipo: 'xyz', valor: 1 });
  bad(null);
  bad({ tipo: 'responsavel', valor: 'Maria' });
  bad({ ...base, tipo: 'baixa', valor: 5 });
  bad({ ...base, tipo: 'previsao_item', valor: '' });
  bad({ ...base, tipo: 'baixa', itemId: 'a', valor: 0 });
  bad({ ...base, tipo: 'baixa', itemId: 'a', valor: -1 });
  bad({ ...base, tipo: 'baixa', itemId: 'a', valor: 'abc' });
  bad({ ...base, tipo: 'previsao_caixa', valor: '09/10' });
  bad({ ...base, tipo: 'obs_caixa', valor: 'a'.repeat(501) });
  bad({ ...base, tipo: 'responsavel', valor: 5 });
  bad({ ...base, tipo: 'mover', valor: 'inexistente' });
});

test('validarAcao: justificativa do mover', () => {
  const msg = 'Justificativa precisa de pelo menos 15 caracteres.';
  const corpo = { ...base, tipo: 'mover', valor: 'saiu_com' };
  assert.strictEqual(ok(corpo, 'ADM').ok, true);
  const sem = ok(corpo, 'PCP');
  assert.strictEqual(sem.ok, false);
  assert.strictEqual(sem.status, 400);
  assert.strictEqual(sem.erro, msg);
  assert.strictEqual(ok({ ...corpo, justificativa: '   curta   ' }, 'PCP').erro, msg);
  assert.strictEqual(ok({ ...corpo, justificativa: '  ' + 'a'.repeat(14) + '  ' }, 'PCP').erro, msg);
  const bom = ok({ ...corpo, justificativa: '  ' + 'a'.repeat(15) + '  ' }, 'PCP');
  assert.strictEqual(bom.ok, true);
  assert.strictEqual(bom.acao.justificativa, 'a'.repeat(15));
});

test('aplicarAcao: baixa soma e grava', () => {
  const alvo = { id: 'a', qtd_falta: 52, qtd_baixada: 10, atualizado_em_app: 'v1' };
  const acao = ok({ ...base, tipo: 'baixa', itemId: 'a', valor: 20, versao: 'v1' }).acao;
  const r = limpo(c.aplicarAcao(acao, alvo, ctx()));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.gravacao, {
    aba: 'FALTANTES', chave: { coluna: 'id', valor: 'a' },
    campos: { qtd_baixada: 30, atualizado_em_app: AGORA },
  });
  assert.strictEqual(r.historico.texto, 'Lucca deu baixa: 20 UN de ZÍPER METAL (resta 22 UN)');
  assert.deepStrictEqual(r.historico, {
    id: 'id-1', quando: AGORA, usuario: 'Lucca', email: 'lucca@exemplo.com',
    deal_id: '9001', os: '90001', item_id: 'a', acao: 'baixa', texto: r.historico.texto,
    ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '',
  });
});

test('aplicarAcao: baixa no limite e acima', () => {
  const alvo = { id: 'a', qtd_falta: 52, qtd_baixada: 30, atualizado_em_app: 'v1' };
  const mk = (v) => ok({ ...base, tipo: 'baixa', itemId: 'a', valor: v, versao: 'v1' }).acao;
  const lim = limpo(c.aplicarAcao(mk(22), alvo, ctx()));
  assert.strictEqual(lim.ok, true);
  assert.strictEqual(lim.gravacao.campos.qtd_baixada, 52);
  assert.match(lim.historico.texto, /\(resta 0 UN\)$/);
  const acima = limpo(c.aplicarAcao(mk(23), alvo, ctx()));
  assert.strictEqual(acima.ok, false);
  assert.strictEqual(acima.status, 400);
  assert.strictEqual(acima.erro, 'Falta só 22 UN');
  assert.strictEqual(acima.gravacao, undefined);
});

test('aplicarAcao: baixa com qtd_falta vazia ou invalida e rejeitada', () => {
  for (const f of ['', 'abc', null, undefined]) {
    const alvo = { id: 'a', qtd_falta: f, qtd_baixada: '', atualizado_em_app: '' };
    const acao = ok({ ...base, tipo: 'baixa', itemId: 'a', valor: 5 }).acao;
    const r = limpo(c.aplicarAcao(acao, alvo, ctx()));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.erro, 'Item sem quantidade faltante registrada.');
    assert.strictEqual(r.gravacao, undefined);
  }
});

test('aplicarAcao: 409 por versao', () => {
  const alvo = { id: 'a', qtd_falta: 52, qtd_baixada: 0, atualizado_em_app: 'v2' };
  const acao = ok({ ...base, tipo: 'obs_item', itemId: 'a', valor: 'x', versao: 'v1' }).acao;
  const r = limpo(c.aplicarAcao(acao, alvo, ctx()));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.erro, 'Alguém alterou esta caixa agora há pouco.');
  assert.strictEqual(r.gravacao, undefined);
  assert.strictEqual(r.historico, undefined);
});

test('aplicarAcao: previsao e obs do item', () => {
  const alvo = { id: 'a', atualizado_em_app: '' };
  const p = limpo(c.aplicarAcao(ok({ ...base, tipo: 'previsao_item', itemId: 'a', valor: '2026-10-09' }).acao, alvo, ctx()));
  assert.deepStrictEqual(p.gravacao.campos, { previsao: '2026-10-09', atualizado_em_app: AGORA });
  assert.strictEqual(p.historico.texto, 'Lucca definiu previsão de ZÍPER METAL: 09/10');
  const v = limpo(c.aplicarAcao(ok({ ...base, tipo: 'previsao_item', itemId: 'a', valor: '' }).acao, alvo, ctx()));
  assert.strictEqual(v.historico.texto, 'Lucca removeu a previsão de ZÍPER METAL');
  const o = limpo(c.aplicarAcao(ok({ ...base, tipo: 'obs_item', itemId: 'a', valor: 'chega sexta' }).acao, alvo, ctx()));
  assert.deepStrictEqual(o.gravacao.campos, { observacao_pcp: 'chega sexta', atualizado_em_app: AGORA });
  assert.strictEqual(o.historico.texto, 'Lucca anotou em ZÍPER METAL: "chega sexta"');
});

test('aplicarAcao: acoes da caixa', () => {
  const alvo = { deal_id: '9001', atualizado_em: 'c1' };
  const g = (corpo) => limpo(c.aplicarAcao(ok({ ...base, versao: 'c1', ...corpo }).acao, alvo, ctx({ nomeItem: '', un: '' })));
  const chave = { coluna: 'deal_id', valor: '9001' };
  const r = g({ tipo: 'responsavel', valor: 'Renata' });
  assert.deepStrictEqual(r.gravacao, { aba: 'CAIXAS_PCP', chave, campos: { deal_id: '9001', os: '90001', responsavel: 'Renata', atualizado_em: AGORA } });
  assert.strictEqual(r.historico.texto, 'Lucca definiu responsável: Renata');
  assert.strictEqual(r.historico.item_id, '');
  const p = g({ tipo: 'previsao_caixa', valor: '2026-10-09' });
  assert.strictEqual(p.gravacao.campos.previsao, '2026-10-09');
  assert.strictEqual(p.historico.texto, 'Lucca definiu previsão geral da caixa: 09/10');
  const pv = g({ tipo: 'previsao_caixa', valor: '' });
  assert.strictEqual(pv.historico.texto, 'Lucca removeu a previsão geral da caixa');
  const o = g({ tipo: 'obs_caixa', valor: 'tudo ok' });
  assert.strictEqual(o.gravacao.campos.observacao, 'tudo ok');
  assert.strictEqual(o.historico.texto, 'Lucca anotou na caixa: "tudo ok"');
  const m = g({ tipo: 'mover', valor: 'completa_pedido' });
  assert.deepStrictEqual(m.gravacao.campos, { deal_id: '9001', os: '90001', coluna_manual: 'completa_pedido', coluna_manual_em: AGORA, atualizado_em: AGORA });
  assert.strictEqual(m.historico.texto, 'Lucca moveu para Caixa completa · Pedido');
  const mj = g({ tipo: 'mover', valor: 'falta_corte', justificativa: ' cliente pediu urgencia ' });
  assert.strictEqual(mj.historico.texto, 'Lucca moveu para Itens faltando · Corte — Justificativa: cliente pediu urgencia');
});

test('textoDaAcao: nomes das 6 colunas', () => {
  const nomes = {
    falta_pedido: 'Itens faltando · Pedido', completa_pedido: 'Caixa completa · Pedido',
    falta_corte: 'Itens faltando · Corte', completa_corte: 'Caixa completa · Corte',
    saiu_com: 'Saiu com faltas', saiu_sem: 'Saiu sem faltas',
  };
  for (const k of Object.keys(nomes)) {
    assert.strictEqual(c.textoDaAcao({ tipo: 'mover', valor: k }, ctx()), 'Lucca moveu para ' + nomes[k]);
  }
});

test('aplicarAcao: caixa sem linha previa cria a linha', () => {
  const acao = ok({ ...base, tipo: 'responsavel', valor: 'Maria', versao: '' }).acao;
  const r = limpo(c.aplicarAcao(acao, null, ctx()));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.gravacao.aba, 'CAIXAS_PCP');
  assert.strictEqual(r.gravacao.campos.deal_id, '9001');
  assert.strictEqual(r.gravacao.campos.responsavel, 'Maria');
  const velha = ok({ ...base, tipo: 'responsavel', valor: 'Maria', versao: 'x' }).acao;
  assert.strictEqual(limpo(c.aplicarAcao(velha, null, ctx())).status, 409);
});

test('validarAcao: datas impossiveis', () => {
  const prev = (v) => ok({ ...base, tipo: 'previsao_caixa', valor: v });
  assert.strictEqual(prev('2026-02-31').status, 400);
  assert.strictEqual(prev('2026-04-31').status, 400);
  assert.strictEqual(prev('2027-02-29').ok, false);
  assert.strictEqual(prev('2028-02-29').ok, true);
});

test('validarAcao: limites de responsavel e justificativa', () => {
  const r1 = ok({ ...base, tipo: 'responsavel', valor: 'a'.repeat(101) });
  assert.strictEqual(r1.status, 400);
  assert.strictEqual(r1.erro, 'Nome do responsável muito longo.');
  assert.strictEqual(ok({ ...base, tipo: 'responsavel', valor: '  ' + 'a'.repeat(100) + '  ' }).ok, true);
  const r2 = ok({ ...base, tipo: 'mover', valor: 'saiu_com', justificativa: 'a'.repeat(501) });
  assert.strictEqual(r2.status, 400);
  assert.strictEqual(r2.erro, 'Justificativa muito longa (máximo 500 caracteres).');
  assert.strictEqual(ok({ ...base, tipo: 'mover', valor: 'saiu_com', justificativa: 'a'.repeat(500) }, 'PCP').ok, true);
});

test('validarAcao: obs normaliza quebras de linha', () => {
  for (const tipo of ['obs_item', 'obs_caixa']) {
    const r = ok({ ...base, tipo, itemId: 'a', valor: '  linha1\r\n\nlinha2\rlinha3  ' });
    assert.strictEqual(r.acao.valor, 'linha1 linha2 linha3');
  }
  const alvo = { id: 'a', atualizado_em_app: '' };
  const acao = ok({ ...base, tipo: 'obs_item', itemId: 'a', valor: 'a\nb' }).acao;
  const r = limpo(c.aplicarAcao(acao, alvo, ctx()));
  assert.strictEqual(r.gravacao.campos.observacao_pcp, 'a b');
  assert.strictEqual(r.historico.texto, 'Lucca anotou em ZÍPER METAL: "a b"');
  assert.strictEqual(ok({ ...base, tipo: 'obs_caixa', valor: 'a'.repeat(501) }).ok, false);
});

test('validarAcao: baixa arredonda e rejeita zero', () => {
  assert.strictEqual(ok({ ...base, tipo: 'baixa', itemId: 'a', valor: 0.0004 }).erro, 'Informe uma quantidade maior que zero');
  assert.strictEqual(ok({ ...base, tipo: 'baixa', itemId: 'a', valor: '0,0001' }).status, 400);
  assert.strictEqual(ok({ ...base, tipo: 'baixa', itemId: 'a', valor: 1.00049 }).acao.valor, 1);
});

test('aplicarAcao: baixa com texto em pt-BR', () => {
  const alvo = { id: 'a', qtd_falta: 15, qtd_baixada: 2, atualizado_em_app: '' };
  const acao = ok({ ...base, tipo: 'baixa', itemId: 'a', valor: '2,5' }).acao;
  const r = limpo(c.aplicarAcao(acao, alvo, ctx({ nomeItem: 'VIÉS', un: 'MT' })));
  assert.strictEqual(r.historico.texto, 'Lucca deu baixa: 2,5 MT de VIÉS (resta 10,5 MT)');
});

test('aplicarAcao: responsavel vazio remove', () => {
  const acao = ok({ ...base, tipo: 'responsavel', valor: '   ' }).acao;
  const r = limpo(c.aplicarAcao(acao, { deal_id: '9001', atualizado_em: '' }, ctx()));
  assert.strictEqual(r.gravacao.campos.responsavel, '');
  assert.strictEqual(r.historico.texto, 'Lucca removeu o responsável');
});

test('aplicarAcao: 409 em caixa com atualizado_em desatualizado', () => {
  const alvo = { deal_id: '9001', atualizado_em: 'c2' };
  const acao = ok({ ...base, tipo: 'obs_caixa', valor: 'x', versao: 'c1' }).acao;
  const r = limpo(c.aplicarAcao(acao, alvo, ctx()));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 409);
});

test('linhaDeGravacao: inclui a coluna-chave quando ausente', () => {
  const { carregar, limpo } = require('./carregar');
  const c = carregar();
  assert.deepStrictEqual(limpo(c.linhaDeGravacao({ aba: 'FALTANTES', chave: { coluna: 'id', valor: 'x1' }, campos: { baixa: 5 } })), { baixa: 5, id: 'x1' });
  assert.deepStrictEqual(limpo(c.linhaDeGravacao({ aba: 'CAIXAS_PCP', chave: { coluna: 'deal_id', valor: 9 }, campos: { deal_id: 9, obs: 'a' } })), { deal_id: 9, obs: 'a' });
});
