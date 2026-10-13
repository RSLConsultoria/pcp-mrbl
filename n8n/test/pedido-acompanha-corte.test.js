// "Pedido acompanha o corte": a conferencia pos-corte (Sync Faltantes) grava as linhas
// CORTE do negocio e marca SUBSTITUIDO as do PEDIDO que reaparecem no corte. Um pedido
// criado antes do corte aponta (PEDIDOS_ITENS.item_id) para o item do PEDIDO; o servidor
// resolve, na leitura, para o item do CORTE com o mesmo cod_item|cor|tamanho. Sem item
// correspondente (material saiu no corte) o item continua no antigo e vem marcado itemMudou.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
let n = 0;
const gerarId = () => 'h-' + (++n);

const P_ZIP = '600001|PEDIDO|Z1|PRETO|U';
const C_ZIP = '600001|CORTE|Z1|PRETO|U';
const P_LIN = '600001|PEDIDO|L2|AZUL|U';
const P_VIES = '600001|PEDIDO|V3|BRANCO|U';

function falt(o) {
  return Object.assign({
    os: '90001', deal_id: '600001', ciclo: 'PEDIDO', secao: 'COSTURA', unidade: 'UN', qtd_baixada: '',
    status: 'ABERTO', data_separacao: '2026-10-01 09:00', atualizado_em_app: ''
  }, o);
}
const FALT = [
  // trocado pela linha do CORTE (mesmo cod_item|cor|tamanho)
  falt({ id: P_ZIP, descricao_item: 'ZÍPER 15CM', qtd_falta: 10, status: 'SUBSTITUIDO' }),
  falt({ id: C_ZIP, ciclo: 'CORTE', descricao_item: 'ZÍPER 18CM', unidade: 'PC', qtd_falta: 8, qtd_baixada: 1 }),
  // saiu no corte: SUBSTITUIDO sem linha do CORTE
  falt({ id: P_LIN, descricao_item: 'LINHA', qtd_falta: 5, status: 'SUBSTITUIDO' }),
  // nao aparece no corte: o sync nao mexe, continua no PEDIDO
  falt({ id: P_VIES, descricao_item: 'VIÉS', unidade: 'MT', qtd_falta: 100 })
];
function ped(o) {
  return Object.assign({
    id: 'PED-0043', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', atualizado_em: 'P1'
  }, o);
}
function pit(o) {
  return Object.assign({
    pedido_id: 'PED-0043', deal_id: '600001', os: '90001', fornecedor: '', previsao: ''
  }, o);
}
const ITENS = [
  pit({ id: 'PED-0043|' + P_ZIP, item_id: P_ZIP, nome: 'ZÍPER 15CM', un: 'UN', qtd: 6 }),
  pit({ id: 'PED-0043|' + P_LIN, item_id: P_LIN, nome: 'LINHA', un: 'UN', qtd: 3 }),
  pit({ id: 'PED-0043|' + P_VIES, item_id: P_VIES, nome: 'VIÉS', un: 'MT', qtd: 20 })
];
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS.slice(), etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, gerarId));
}
function board(lin) {
  const l = lin || linhas();
  return limpo(ctx.montarRespostaBoard({}, l.faltantes, [], T0, { pedidos: l.pedidos, pedidosItens: l.pedidosItens })).body;
}

// ---------- board ----------
test('board: item do pedido segue o item do CORTE (id, nome e unidade atuais)', () => {
  const b = board();
  const p = b.pedidos.find((x) => x.id === 'PED-0043');
  assert.deepEqual(p.itens.map((i) => [i.itemId, i.nome, i.un, i.qtd, !!i.itemMudou]), [
    [C_ZIP, 'ZÍPER 18CM', 'PC', 6, false],
    [P_LIN, 'LINHA', 'UN', 3, true],
    [P_VIES, 'VIÉS', 'MT', 20, false]
  ]);
  const cx = b.caixas.find((c) => c.dealId === '600001');
  assert.equal(cx.ciclo, 'CORTE');
  const zip = cx.itens.find((i) => i.id === C_ZIP);
  assert.deepEqual(zip.pedidoIds, ['PED-0043']);
  assert.equal(zip.pedidoId, 'PED-0043');
  assert.deepEqual(cx.itens.find((i) => i.id === P_VIES).pedidoIds, ['PED-0043']);
  assert.ok(b.avisos.includes('PED-0043: LINHA (OS 90001) mudou no corte e não tem correspondente: confira o pedido.'), b.avisos.join(' | '));
});

test('board: pedido ja com baixa nao avisa item que mudou; sem linha do CORTE nada muda', () => {
  const b = board(linhas({ pedidos: [ped({ etapa: 'entregue', baixado_em: '2026-10-05T00:00:00.000Z' })] }));
  assert.equal(b.avisos.some((a) => a.indexOf('mudou no corte') >= 0), false);
  // linha PEDIDO aberta, sem CORTE: continua no proprio id
  const s = board(linhas({ faltantes: [falt({ id: P_ZIP, descricao_item: 'ZÍPER 15CM', qtd_falta: 10 })], pedidosItens: [ITENS[0]] }));
  assert.deepEqual(s.pedidos[0].itens.map((i) => [i.itemId, i.nome, !!i.itemMudou]), [[P_ZIP, 'ZÍPER 15CM', false]]);
});

test('board: linha PEDIDO ainda aberta nao e trocada mesmo com CORTE de mesmo codigo', () => {
  const fal = [falt({ id: P_ZIP, descricao_item: 'ZÍPER 15CM', qtd_falta: 10 }), FALT[1]];
  const b = board(linhas({ faltantes: fal, pedidosItens: [ITENS[0]] }));
  assert.deepEqual(b.pedidos[0].itens.map((i) => i.itemId), [P_ZIP]);
});

// ---------- baixa ----------
test('mover_pedido para a etapa da baixa: baixa na linha do CORTE; item que mudou fica sem baixa e no historico', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'entregue', confirmouBaixa: true },
    linhas({ pedidos: [ped({ etapa: 'aguardando' })] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: C_ZIP, qtd_baixada: 7, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: P_VIES, qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', etapa: 'entregue', baixado_em: ISO, atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca moveu PED-0043 para Enviado ao destino final e deu baixa: 6 PC de ZÍPER 18CM (resta 1 PC); 20 MT de VIÉS (resta 80 MT)' +
      ' · sem baixa: LINHA mudou no corte e não tem correspondente'
  ]);
});

test('baixar_pedido (compatibilidade): mesma baixa na linha do CORTE', () => {
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: 'P1', confirmouBaixa: true },
    linhas({ pedidos: [ped({ etapa: 'entregue' })], pedidosItens: [ITENS[0], ITENS[1]] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes.map((o) => [o.aba, o.linha.id, o.linha.qtd_baixada]), [['FALTANTES', C_ZIP, 7], ['PEDIDOS', 'PED-0043', undefined]]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca deu baixa do PED-0043: 6 PC de ZÍPER 18CM (resta 1 PC) · sem baixa: LINHA mudou no corte e não tem correspondente'
  ]);
});

test('dividir_pedido: a parte nova grava o item do CORTE e a baixa vai para a linha do CORTE', () => {
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: C_ZIP, qtd: 2 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const itemParte = r.operacoes.find((o) => o.aba === 'PEDIDOS_ITENS' && o.operacao === 'append').linha;
  assert.equal(itemParte.id, 'PED-0043.1|' + C_ZIP);
  assert.equal(itemParte.item_id, C_ZIP);
  assert.equal(itemParte.nome, 'ZÍPER 18CM');
  assert.equal(itemParte.un, 'PC');
  // o resto continua na linha original da PEDIDOS_ITENS (chave pelo id dela)
  const resto = r.operacoes.find((o) => o.aba === 'PEDIDOS_ITENS' && o.operacao === 'update').linha;
  assert.deepEqual(resto, { id: 'PED-0043|' + P_ZIP, qtd: 4 });
  const bx = r.operacoes.filter((o) => o.aba === 'FALTANTES');
  assert.deepEqual(bx.map((o) => [o.linha.id, o.linha.qtd_baixada]), [[C_ZIP, 3]]);
  assert.match(r.historicos[0].texto, /2 PC de ZÍPER 18CM foram para PED-0043\.1/);
  // o site aberto antes do corte ainda manda o id antigo: tambem vale
  const antigo = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: P_ZIP, qtd: 2 }] });
  assert.equal(antigo.status, 200, JSON.stringify(antigo.body));
});

test('dividir_pedido com o item que mudou: a parte fica sem baixa dele e o historico avisa', () => {
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: P_LIN, qtd: 3 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.operacoes.filter((o) => o.aba === 'FALTANTES').length, 0);
  assert.match(r.historicos[0].texto, / · sem baixa: LINHA mudou no corte e não tem correspondente$/);
});

// ---------- validacao ----------
test('editar_pedido: quantidade validada contra o resta do item do CORTE; historico com o nome atual', () => {
  const muito = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: C_ZIP, qtd: 8 }] });
  assert.deepEqual(muito, { status: 400, body: { erro: 'Falta só 7 PC de ZÍPER 18CM' } });
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: C_ZIP, qtd: 7 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes[1], { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043|' + P_ZIP, qtd: 7 } });
  assert.equal(r.historicos[0].texto, 'Lucca alterou PED-0043: qtd de ZÍPER 18CM: 6 → 7');
  // id antigo (site aberto antes do corte) tambem acha o item
  assert.equal(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: P_ZIP, qtd: 7 }] }).status, 200);
});

test('gerar_pedido: o item do CORTE ja esta no pedido feito antes do corte', () => {
  const corpo = { tipo: 'gerar_pedido', origem: 'Fornecedor', quem: 'TECIDOS BETA', local: 'Bragança', responsavel: 'Gi',
    itens: [{ itemId: C_ZIP, dealId: '600001', qtd: 1 }] };
  assert.deepEqual(acao(corpo), { status: 409, body: { erro: 'Item já está no PED-0043.' } });
});

test('editar_pedido: quantidade do item que mudou no corte nao muda (nao ha resta para conferir)', () => {
  const r = acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: P_LIN, qtd: 2 }] });
  assert.deepEqual(r, { status: 409, body: { erro: 'LINHA mudou no corte e não tem correspondente: a quantidade não pode mudar.' } });
  // fornecedor e previsao continuam editaveis
  assert.equal(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', itens: [{ itemId: P_LIN, fornecedor: 'X' }] }).status, 200);
});
