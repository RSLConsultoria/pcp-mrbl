const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// 09/10/2026: nova demanda pos-saida. Itens descobertos depois que a caixa saiu entram
// na FALTANTES ligados ao deal da caixa (CAIXAS GANHAS por OS + tipo), com ciclo e origem
// POS_SAIDA (o Sync Faltantes nao toca essas linhas).
const ctx = carregar();
const T0 = Date.UTC(2026, 9, 9, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
const GANHA = { deal_id: '700004', os: '90004', caixa: 'Caixa de costura', referencia: 'REF-04', descricao_peca: 'PECA D',
  cliente: 'CLIENTE ALFA', saiu_com_falta: 'NAO', itens_faltando: '', data_ganho: '2026-10-01' };
const CORPO = { tipo: 'nova_demanda', os: '90004', caixa: 'COSTURA',
  itens: [{ nome: 'BOTÃO 12MM', cor: 'azul', qtd: 2, un: 'UN' }, { nome: 'VIÉS', cor: '', qtd: '1,5', un: 'MT' }] };
function linhas(extra) {
  return Object.assign({ faltantes: [], caixasPcp: [], ganhas: [GANHA], pedidos: [], pedidosItens: [], etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  let n = 0;
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, () => 'h-' + (++n)));
}

test('nova_demanda: grava os itens na FALTANTES ligados ao deal da caixa, com ciclo e origem POS_SAIDA', () => {
  const r = acao(CORPO);
  assert.equal(r.status, 200);
  const base = {
    os: '90004', ciclo: 'POS_SAIDA', origem: 'POS_SAIDA', referencia: 'REF-04', descricao_peca: 'PECA D', cliente: 'CLIENTE ALFA',
    secao: 'COSTURA', qtd_baixada: 0, status: 'ABERTO', data_separacao: '2026-10-09 12:00', deal_id: '700004', atualizado_em_app: ISO
  };
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'append', chave: 'id', linha: Object.assign({ id: '700004|POS_SAIDA|h-1', descricao_item: 'BOTÃO 12MM', nome_cor: 'azul', unidade: 'UN', qtd_falta: 2 }, base) },
    { aba: 'FALTANTES', operacao: 'append', chave: 'id', linha: Object.assign({ id: '700004|POS_SAIDA|h-2', descricao_item: 'VIÉS', nome_cor: '', unidade: 'MT', qtd_falta: 1.5 }, base) }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto, h.ploomes_status]), [
    ['700004', '90004', 'nova_demanda', 'Lucca criou demanda pós-saída: 2 UN de BOTÃO 12MM azul; 1,5 MT de VIÉS', 'PENDENTE']
  ]);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.versao, ISO);
  // ids gravados: o site tira a demanda da fila quando o board mostra estes itens
  assert.deepEqual(r.body.itemIds, ['700004|POS_SAIDA|h-1', '700004|POS_SAIDA|h-2']);
  assert.equal(r.gravacao, null);
  assert.equal(r.historico, null);
});

test('nova_demanda: validacoes do corpo, iguais no pre e no processar', () => {
  const s = sessao();
  const casos = [
    [{ os: '' }, 'Informe a OS.'],
    [{ caixa: 'PREPARACAO' }, 'Escolha o tipo de caixa.'],
    [{ itens: [] }, 'Informe ao menos um item.'],
    [{ itens: [{ nome: ' ', qtd: 1, un: 'UN' }] }, 'Informe o nome do item.'],
    [{ itens: [{ nome: 'X', qtd: 0, un: 'UN' }] }, 'Informe uma quantidade maior que zero'],
    [{ itens: [{ nome: 'X', qtd: 1, un: '' }] }, 'Informe a unidade do item.'],
    [{ itens: [{ nome: 'X'.repeat(101), qtd: 1, un: 'UN' }] }, 'Nome do item muito longo.'],
    [{ itens: [{ nome: 'X', cor: 'c'.repeat(41), qtd: 1, un: 'UN' }] }, 'Cor muito longa.'],
    [{ itens: [{ nome: 'X', qtd: 1, un: 'U'.repeat(11) }] }, 'Unidade muito longa.'],
    [{ itens: [null] }, 'Informe o nome do item.'],
    [{ itens: Array.from({ length: 31 }, () => ({ nome: 'X', qtd: 1, un: 'UN' })) }, 'No máximo 30 itens por demanda.']
  ];
  for (const [extra, erro] of casos) {
    const corpo = Object.assign({}, CORPO, extra);
    assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), { ok: false, status: 400, body: { erro } });
    assert.deepEqual(acao(corpo), { status: 400, body: { erro } });
  }
  // tipo de caixa sem acento/caixa baixa vale; aqui a caixa de acabamento nao existe
  assert.equal(acao(Object.assign({}, CORPO, { caixa: 'acabamento' })).status, 404);
});

test('nova_demanda: caixa nao encontrada, ainda nao saiu, duplicada ou nao editavel; nada e gravado', () => {
  assert.deepEqual(acao(Object.assign({}, CORPO, { os: '99999' })), { status: 404, body: { erro: 'Caixa da OS 99999 (Costura) não encontrada.' } });
  const noAlmox = linhas({ ganhas: [], faltantes: [{ id: 'x', os: '90004', deal_id: '700004', secao: 'COSTURA', status: 'ABERTO', qtd_falta: 1 }] });
  assert.deepEqual(acao(CORPO, noAlmox), { status: 409, body: { erro: 'A caixa da OS 90004 (Costura) ainda não saiu.' } });
  const duas = linhas({ ganhas: [GANHA, Object.assign({}, GANHA, { deal_id: '700099' })] });
  assert.deepEqual(acao(CORPO, duas), { status: 409, body: { erro: 'Mais de uma caixa da OS 90004 (Costura) saiu. Fale com o PCP.' } });
  ctx.DEALS_EDITAVEIS = ['600001'];
  try {
    assert.deepEqual(acao(CORPO), { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

test('board: item com origem POS_SAIDA vem com posSaida e fica na caixa mesmo resolvido numa caixa de CORTE', () => {
  const linha = acao(CORPO).operacoes[0].linha;
  const corte = { id: 'k', os: '90004', deal_id: '700004', ciclo: 'CORTE', secao: 'COSTURA', descricao_item: 'TECIDO', unidade: 'MT', qtd_falta: 0, status: 'RESOLVIDO' };
  const pos = Object.assign({}, linha, { status: 'RESOLVIDO', qtd_baixada: 2 });
  const cx = limpo(ctx.montarRespostaBoard({}, [corte, pos], [GANHA], T0, {})).body.caixas[0];
  assert.deepEqual(cx.itens.map((i) => [i.nome, i.posSaida]), [['TECIDO', false], ['BOTÃO 12MM', true]]);
  assert.equal(cx.saiu, true);
  assert.equal(cx.saiuComFalta, false);
});

test('board: caixa so da GANHAS com falta em texto mantem os itens do texto e a data da GANHAS depois da demanda pos-saida', () => {
  const g = Object.assign({}, GANHA, { saiu_com_falta: 'SIM', itens_faltando: 'FITA (falta 3 MT)', conferido_em: 'CORTE', data_ganho: '2026-10-01' });
  const linha = acao(CORPO, linhas({ ganhas: [g] })).operacoes[0].linha;
  const cx = limpo(ctx.montarRespostaBoard({}, [linha], [g], T0, {})).body.caixas[0];
  assert.deepEqual(cx.itens.map((i) => [i.nome, i.posSaida]), [['FITA', false], ['BOTÃO 12MM', true]]);
  assert.equal(cx.registradoEm, '2026-10-01');
  assert.equal(cx.ciclo, 'CORTE');
  const g2 = Object.assign({}, g, { itens_faltando: '' });
  const cx2 = limpo(ctx.montarRespostaBoard({}, [linha], [g2], T0, {})).body.caixas[0];
  assert.deepEqual(cx2.itens.map((i) => i.nome), ['Itens não detalhados na planilha', 'BOTÃO 12MM']);
  // demanda sobre caixa que saiu sem falta: so o item novo
  const g3 = Object.assign({}, g, { saiu_com_falta: 'NAO' });
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [linha], [g3], T0, {})).body.caixas[0].itens.map((i) => i.nome), ['BOTÃO 12MM']);
});
