// Cadeia de gravacao do ramo acao (F3 Task 4): roda o texto dos Code nodes
// "Filtrar <aba> <operacao>" (build/filtrar-*.js) num vm com um $ falso e
// simula os IF "Tem ...?". Garante: toda operacao gravada uma vez, no destino
// certo, na ordem dos destinos, e nenhum item vazio chega a um Sheets.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregar, limpo } = require('./carregar');
const { DESTINOS, codigoFiltrar } = require('../scripts/destinos');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'filtrar-operacoes.js'), 'utf8');

function rodarFiltrar(i, saida) {
  const ctx = vm.createContext({
    $: (nome) => {
      assert.equal(nome, 'Processar Acao');
      return { first: () => ({ json: saida }) };
    }
  });
  const codigo = '(function () {\n' + codigoFiltrar(TEMPLATE, DESTINOS[i], i) + '\n})()';
  return limpo(vm.runInContext(codigo, ctx));
}

// Devolve [{ gravar, aba, operacao, linhas }] na ordem em que o workflow grava.
function simular(saida) {
  const escritas = [];
  DESTINOS.forEach((d, i) => {
    const itens = rodarFiltrar(i, saida);
    assert.ok(itens.length > 0, 'Code sempre devolve ao menos um item');
    const vazios = itens.filter((it) => it.json._vazio === true);
    if (vazios.length) {
      assert.deepEqual(itens, [{ json: { _vazio: true } }]);
      return; // IF "Tem ...?" -> nao: pula o Sheets
    }
    itens.forEach((it) => assert.ok(Object.keys(it.json).length > 0, 'linha vazia'));
    escritas.push({ gravar: d.gravar, aba: d.aba, operacao: d.operacao, linhas: itens.map((it) => it.json) });
  });
  return escritas;
}

function esperado(saida) {
  // Operacoes agrupadas por destino, na ordem dos DESTINOS; historicos no fim.
  const out = [];
  DESTINOS.forEach((d) => {
    const linhas = d.fonte === 'historicos' ? saida.historicos
      : saida.operacoes.filter((o) => o.aba === d.aba && o.operacao === d.operacao).map((o) => o.linha);
    if (linhas.length) out.push({ gravar: d.gravar, aba: d.aba, operacao: d.operacao, linhas });
  });
  return out;
}

const ctx = carregar();
const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: ctx.gerarHash(crypto, 'senha-forte-123'), ativo: 'SIM' }];
function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
let n = 0;
const gerarId = () => 'h-' + (++n);
const FALT = [
  { id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT', qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: '' },
  { id: 'b', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'ZÍPER', unidade: 'UN', qtd_falta: 10, qtd_baixada: 4, status: 'ABERTO', atualizado_em_app: '', responsavel: '' }
];
function acao(corpo) {
  const s = sessao();
  const linhas = { faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [], pedidosItens: [], etapas: [], historico: [] };
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, linhas, T0, gerarId));
}

test('destinos: um Code, um IF e um Sheets por (aba, operacao), nomes unicos', () => {
  const nomes = DESTINOS.flatMap((d) => [d.filtrar, d.tem, d.gravar]);
  assert.equal(new Set(nomes).size, nomes.length);
  assert.deepEqual(DESTINOS.map((d) => d.aba),
    ['FALTANTES', 'CAIXAS_PCP', 'PEDIDOS', 'PEDIDOS', 'PEDIDOS_ITENS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'ETAPAS_PEDIDO', 'HISTORICO_APP']);
});

test('F2 baixa: uma linha em FALTANTES (update) e uma no HISTORICO_APP, como antes', () => {
  const saida = acao({ tipo: 'baixa', dealId: '600001', itemId: 'a', valor: 20, versao: '' });
  assert.equal(saida.status, 200);
  const escritas = simular(saida);
  assert.deepEqual(escritas.map((e) => e.gravar), ['Atualizar FALTANTES', 'Incluir HISTORICO_APP']);
  // mesma linha que a F2 gravava (linhaDeGravacao) e o mesmo historico
  assert.deepEqual(escritas[0].linhas, [limpo(ctx.linhaDeGravacao(saida.gravacao))]);
  assert.deepEqual(escritas[1].linhas, [saida.historico]);
});

test('F2 coluna da caixa: CAIXAS_PCP appendOrUpdate', () => {
  const saida = acao({ tipo: 'obs_caixa', dealId: '600001', valor: 'oi', versao: '' });
  assert.equal(saida.status, 200);
  assert.deepEqual(simular(saida).map((e) => e.gravar), ['Gravar CAIXAS_PCP', 'Incluir HISTORICO_APP']);
});

test('F3 gerar_pedido: PEDIDOS append, PEDIDOS_ITENS append, historicos', () => {
  const saida = acao({
    tipo: 'gerar_pedido',
    itens: [{ itemId: 'a', dealId: '600001', qtd: 20, fornecedor: '' }, { itemId: 'b', dealId: '600001', qtd: 6, fornecedor: 'X' }],
    origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-20', responsavel: ''
  });
  assert.equal(saida.status, 200, JSON.stringify(saida.body));
  const escritas = simular(saida);
  assert.deepEqual(escritas, esperado(saida));
  assert.deepEqual(escritas.map((e) => e.gravar), ['Incluir PEDIDOS', 'Incluir PEDIDOS_ITENS', 'Incluir HISTORICO_APP']);
  assert.equal(escritas[1].linhas.length, 2);
});

test('todos os destinos de uma vez: cada operacao exatamente uma vez, na ordem', () => {
  const op = (aba, operacao, chave, linha) => ({ aba, operacao, chave, linha });
  const saida = {
    status: 200,
    operacoes: [
      op('ETAPAS_PEDIDO', 'update', 'id', { id: 'x', nome: '', ordem: '' }),
      op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', { deal_id: '1', tratativa: 'RECEBIDO' }),
      op('FALTANTES', 'update', 'id', { id: 'a', qtd_baixada: 1 }),
      op('FALTANTES', 'update', 'id', { id: 'b', qtd_baixada: 2 }),
      op('PEDIDOS', 'append', 'id', { id: 'PED-0001' }),
      op('PEDIDOS', 'update', 'id', { id: 'PED-0002', etapa: 'y' }),
      op('PEDIDOS_ITENS', 'append', 'id', { id: 'PED-0001|a' }),
      op('PEDIDOS_ITENS', 'update', 'id', { id: 'PED-0002|b', qtd: 3 }),
      op('ETAPAS_PEDIDO', 'appendOrUpdate', 'id', { id: 'y', nome: 'Y', ordem: 1 })
    ],
    historicos: [{ id: 'h1' }, { id: 'h2' }]
  };
  const escritas = simular(saida);
  assert.deepEqual(escritas, esperado(saida));
  assert.deepEqual(escritas.map((e) => e.aba),
    ['FALTANTES', 'CAIXAS_PCP', 'PEDIDOS', 'PEDIDOS', 'PEDIDOS_ITENS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'ETAPAS_PEDIDO', 'HISTORICO_APP']);
  const total = escritas.reduce((s, e) => s + e.linhas.length, 0);
  assert.equal(total, saida.operacoes.length + saida.historicos.length);
});

test('sem operacoes nem historicos: nada e gravado', () => {
  assert.deepEqual(simular({ status: 200, operacoes: [], historicos: [] }), []);
});

test('Filtrar FALTANTES confere a lista antes de qualquer escrita', () => {
  const sai = (operacoes) => () => rodarFiltrar(0, { status: 200, operacoes, historicos: [] });
  assert.throws(sai([{ aba: 'OUTRA', operacao: 'update', chave: 'id', linha: { id: 'a' } }]), /sem destino/);
  assert.throws(sai([{ aba: 'PEDIDOS', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'a' } }]), /sem destino/);
  assert.throws(sai([{ aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'a' } }]), /sem destino/);
  assert.throws(sai([{ aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { qtd_baixada: 1 } }]), /sem chave/);
  assert.throws(sai([{ aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {} }]), /sem linha/);
});

test('build: o texto dos Code nodes Filtrar e o mesmo do template', () => {
  DESTINOS.forEach((d, i) => {
    const arq = path.join(__dirname, '..', 'build', d.arquivo + '.js');
    if (!fs.existsSync(arq)) return; // antes do primeiro npm run build
    assert.ok(fs.readFileSync(arq, 'utf8').endsWith(codigoFiltrar(TEMPLATE, d, i)), d.arquivo);
  });
});
