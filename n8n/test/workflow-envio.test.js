// Workflow "PCP MRBL - Enviar ao Ploomes" com registro compilado: roda os
// Code nodes (src/ + adaptador) num vm com $ / $input falsos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ARQUIVOS, limpo } = require('./carregar');

const RAIZ = path.join(__dirname, '..');

function rodarNode(arq, globais) {
  const ctx = vm.createContext(Object.assign({}, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}
const itens = (lista) => lista.map((json) => ({ json }));
const entrada = (lista) => ({ all: () => itens(lista) });
const cifrao = (nodes) => (nome) => ({ all: () => itens(nodes[nome]) });

const TESTE = '607479158';
const antigo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
const recente = new Date(Date.now() - 60 * 1000).toISOString();
const L = (id, quando, extra) => Object.assign({
  id, quando, deal_id: TESTE, os: '999999', texto: 'Lucca moveu PED-0001', ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: ''
}, extra || {});

test('Selecionar Envio: um item por grupo pronto, so deals permitidos', () => {
  const rows = [L('a', antigo), L('b', antigo), L('c', antigo, { deal_id: '600001' }), L('d', recente, { deal_id: TESTE, os: '1', id: 'd' })];
  const saida = rodarNode('selecionar-envio', { $input: entrada(rows.slice(0, 3)) });
  assert.equal(saida.length, 1);
  assert.equal(saida[0].json.grupo.deal_id, TESTE);
  assert.deepEqual(saida[0].json.grupo.linhas.map((l) => l.id), ['a', 'b']);
  // linha recente no mesmo deal segura o grupo
  assert.deepEqual(rodarNode('selecionar-envio', { $input: entrada(rows) }), []);
});

test('Montar Registro + Resultado Envio: um registro por grupo, uma linha gravada por linha do historico', () => {
  const grupos = [
    { grupo: { deal_id: TESTE, os: '999999', linhas: [L('a', antigo), L('b', antigo, { tentativas: 2 })] } },
    { grupo: { deal_id: '700', os: '7', linhas: [L('c', antigo, { deal_id: '700' })] } },
    { grupo: { deal_id: '800', os: '8', linhas: [L('d', antigo, { deal_id: '800' })] } }
  ];
  const contatos = [{ statusCode: 200, body: { value: [{ ContactId: 5 }] } }, { statusCode: 503 }, { statusCode: 404 }];
  const montados = rodarNode('montar-registro', { $: cifrao({ 'Selecionar Envio': grupos }), $input: entrada(contatos) });
  assert.deepEqual(montados.map((m) => m.json.grupo.deal_id), [TESTE, '800']);
  assert.equal(montados[0].json.registro.ContactId, 5);
  assert.ok(!('ContactId' in montados[1].json.registro));
  assert.ok(montados[0].json.registro.Content.startsWith('[PCP · OS 999999] Atualizações do app PCP\n• '));
  assert.equal(montados[0].json.registro.Content.split('\n').length, 3);

  const respostas = [{ statusCode: 201, body: { Id: 42 } }, { statusCode: 400, body: { message: 'ruim' } }];
  const res = rodarNode('resultado-envio', { $: cifrao({ 'Montar Registro': montados.map((m) => m.json) }), $input: entrada(respostas) });
  assert.deepEqual(res.map((r) => r.json), [
    { id: 'a', ploomes_status: 'ENVIADO', ploomes_id: '42', tentativas: 0, erro: '' },
    { id: 'b', ploomes_status: 'ENVIADO', ploomes_id: '42', tentativas: 2, erro: '' },
    { id: 'd', ploomes_status: 'PENDENTE', tentativas: 1, erro: 'ruim' }
  ]);
  const com429 = rodarNode('resultado-envio', {
    $: cifrao({ 'Montar Registro': montados.map((m) => m.json) }),
    $input: entrada([{ statusCode: 429, body: {} }, { error: { message: 'timeout' } }])
  });
  assert.deepEqual(com429.map((r) => [r.json.id, r.json.ploomes_status, r.json.tentativas]), [['d', 'PENDENTE', 1]]);
});

test('pcp-envio.sdk.js: Buscar Contato usa o deal do grupo', () => {
  const sdk = fs.readFileSync(path.join(RAIZ, 'workflows', 'pcp-envio.sdk.js'), 'utf8');
  assert.ok(sdk.includes('Deals({{ $json.grupo.deal_id }})'));
  assert.ok(!sdk.includes('$json.linha'));
});
