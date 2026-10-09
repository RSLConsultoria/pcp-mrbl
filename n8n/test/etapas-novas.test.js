const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// 09/10/2026: etapas novas. A penultima (Enviado ao destino final, id entregue) da a
// baixa; a ultima (Concluido) finaliza o pedido. Sem enviar_oficina/oficina_recebeu.
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
function falt(o) {
  return Object.assign({
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: ''
  }, o);
}
const FALT = [falt({ id: 'a' }), falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', unidade: 'UN', qtd_falta: 50 })];
function ped(o) {
  return Object.assign({
    id: 'PED-0044', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', concluido_em: '', atualizado_em: 'P1', pai: ''
  }, o);
}
function pit(o) {
  return Object.assign({
    id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001',
    nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', previsao: ''
  }, o);
}
const ITENS = [pit({}), pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 30 })];
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS.slice(), etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  let n = 0;
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, () => 'h-' + (++n)));
}
const ENVIADO = { etapa: 'entregue', baixado_em: '2026-10-08T10:00:00.000Z' };
const ETAPAS5 = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
  { id: 'concluido', nome: 'Concluído', ordem: 5 }
];
const FIM = [{ id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }];
const salvar = (etapas, lin) => acao({ tipo: 'salvar_etapas', etapas }, lin || linhas({ pedidos: [], etapas: ETAPAS5 }));

test('etapas padrao: Enviado ao destino final (id entregue) e Concluido no fim', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, {}));
  assert.deepEqual(r.body.etapasPedido, ETAPAS5);
});

test('mover para Enviado ao destino final da a baixa, mas nao finaliza', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue', confirmouBaixa: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'c', qtd_baixada: 30, atualizado_em_app: ISO } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'entregue', baixado_em: ISO, atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca moveu PED-0044 para Enviado ao destino final e deu baixa: 20 MT de VIÉS (resta 80 MT)',
    'Lucca moveu PED-0044 para Enviado ao destino final e deu baixa: 30 UN de BOTÃO (resta 20 UN)'
  ]);
  const b = limpo(ctx.montarRespostaBoard({}, FALT, [], T0, { pedidos: [ped(ENVIADO)], pedidosItens: ITENS }));
  const p = b.body.pedidos[0];
  assert.deepEqual([p.finalizado, p.baixadoEm, p.concluidoEm], [false, ENVIADO.baixado_em, '']);
});

test('mover para Concluido: so com a baixa dada; grava concluido_em e finaliza', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'concluido' }, linhas({ pedidos: [ped(ENVIADO)] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'concluido', concluido_em: ISO, atualizado_em: ISO } }]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca moveu PED-0044 para Concluído'], ['600002', 'Lucca moveu PED-0044 para Concluído']
  ]);
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'concluido' }),
    { status: 400, body: { erro: 'Mova o pedido primeiro para Enviado ao destino final.' } });
  const fim = ped(Object.assign({}, ENVIADO, { etapa: 'concluido', concluido_em: ISO }));
  const b = limpo(ctx.montarRespostaBoard({}, FALT, [], T0, { pedidos: [fim], pedidosItens: ITENS }));
  assert.equal(b.body.pedidos[0].finalizado, true);
  assert.equal(b.body.pedidos[0].concluidoEm, ISO);
});

test('pedido com baixa so vai para Concluido; concluido nao muda mais', () => {
  const lin = linhas({ pedidos: [ped(ENVIADO)] });
  const erro = { status: 409, body: { erro: 'Pedido com baixa só pode ir para Concluído.' } };
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'aguardando' }, lin), erro);
  assert.deepEqual(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { quem: 'X' } }, lin), erro);
  assert.deepEqual(acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', qtd: 1 }] }, lin), erro);
  assert.deepEqual(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1', confirmouBaixa: true }, lin), erro);
  const fim = linhas({ pedidos: [ped(Object.assign({}, ENVIADO, { etapa: 'concluido', concluido_em: ISO }))] });
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue', confirmouBaixa: true }, fim),
    { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } });
});

test('pedido com baixa nao prende o item: o resto pode ir para outro pedido', () => {
  const lin = linhas({ pedidos: [ped(ENVIADO)], faltantes: [falt({ id: 'a', qtd_baixada: 20 }), FALT[1]] });
  const r = acao({ tipo: 'gerar_pedido', itens: [{ itemId: 'a', dealId: '600001', qtd: 80 }], origem: 'FORNECEDOR',
    quem: 'TECIDOS BETA', local: 'BRAGANCA', responsavel: 'Gi' }, lin);
  assert.equal(r.status, 200);
  assert.equal(r.body.pedidoId, 'PED-0045');
});

test('editar_pedido nao muda etapa: so arrastando o card (pre e processar)', () => {
  const s = sessao();
  const corpo = { tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { etapa: 'solicitado' } };
  const erro = { status: 400, body: { erro: 'Para mudar a etapa, arraste o card.' } };
  assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), Object.assign({ ok: false }, erro));
  assert.deepEqual(acao(corpo), erro);
});

test('baixar_pedido (compatibilidade): so na etapa da baixa', () => {
  assert.deepEqual(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1', confirmouBaixa: true }),
    { status: 400, body: { erro: 'Dar baixa só na etapa Enviado ao destino final.' } });
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1', confirmouBaixa: true }, linhas({ pedidos: [ped({ etapa: 'entregue' })] }));
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[r.operacoes.length - 1].linha.baixado_em, ISO);
});

test('salvar_etapas: as duas ultimas ficam no fim, nessa ordem (podem ser renomeadas)', () => {
  const erro = { status: 400, body: { erro: 'As etapas Enviado ao destino final e Concluído precisam continuar no fim, nessa ordem.' } };
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, FIM[1], FIM[0]]), erro);
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, FIM[0], FIM[1], { nome: 'Depois' }]), erro);
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Outra' }, FIM[1]]), erro);
  const ok = salvar([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Em trânsito' }, { id: 'entregue', nome: 'Enviado' }, { id: 'concluido', nome: 'Recebido' }]);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.operacoes.slice(0, 4).map((o) => [o.linha.id, o.linha.nome, o.linha.ordem]), [
    ['a_pedir', 'A pedir', 1], ['em_transito', 'Em trânsito', 2], ['entregue', 'Enviado', 3], ['concluido', 'Recebido', 4]
  ]);
});

test('salvar_etapas: minimo de 3; pedido concluido nao segura etapa, pedido aberto segura', () => {
  assert.deepEqual(salvar(FIM), { status: 400, body: { erro: 'O quadro precisa de pelo menos 3 etapas.' } });
  const comPedido = (o) => linhas({ etapas: ETAPAS5, pedidos: [ped(Object.assign({ etapa: 'solicitado' }, o))] });
  const sem = [{ id: 'a_pedir', nome: 'A pedir' }].concat(FIM);
  assert.deepEqual(salvar(sem, comPedido({})), { status: 409, body: { erro: 'A etapa Solicitado tem pedidos abertos.' } });
  assert.equal(salvar(sem, comPedido({ baixado_em: 'X', concluido_em: 'Y' })).status, 200);
});

test('dividir_pedido: so em Aguardando entrega; a parte vai para Enviado ao destino final com a baixa', () => {
  // sem "etapa" no corpo (o site antigo mandava; veja janela-migracao.test.js)
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', qtd: 5 }] });
  assert.equal(r.status, 200);
  assert.deepEqual([r.operacoes[0].linha.id, r.operacoes[0].linha.etapa, r.operacoes[0].linha.baixado_em], ['PED-0044.1', 'entregue', ISO]);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'FALTANTES'), [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 5, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca dividiu PED-0044: 5 MT de VIÉS foram para PED-0044.1 (Enviado ao destino final) e deu baixa: 5 MT de VIÉS (resta 95 MT)'
  ]);
  assert.deepEqual(acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', qtd: 5 }] },
    linhas({ pedidos: [ped({ etapa: 'solicitado' })] })),
    { status: 400, body: { erro: 'Dividir só com o pedido em Aguardando entrega.' } });
});

test('enviar_oficina e oficina_recebeu sairam; o board nao traz mais tratativa', () => {
  for (const tipo of ['enviar_oficina', 'oficina_recebeu']) {
    assert.deepEqual(acao({ tipo, dealId: '600001', versao: '' }), { status: 400, body: { erro: 'Tipo de ação inválido.' } });
    assert.equal(ctx.TIPOS_PEDIDO.indexOf(tipo), -1);
  }
  const cx = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, {
    caixasPcp: [{ deal_id: '600001', os: '90001', tratativa: 'ENVIADO', atualizado_em: 'C1' }]
  })).body.caixas[0];
  assert.equal('tratativa' in cx, false);
  assert.equal('tratativaEm' in cx, false);
});
