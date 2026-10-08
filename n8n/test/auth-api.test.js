const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [
  { email: 'Lucca@RSLConsultoria.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' },
  { email: 'inativo@x.com', nome: 'Fulano', perfil: 'PCP', senha_hash: HASH, ativo: 'NAO' }
];

function novoEstado() { return {}; }
function login(estado, email, senha, agora) {
  return limpo(ctx.processarLogin(crypto, estado, { email, senha }, USUARIOS, agora || T0));
}

test('hash: formato, ida e volta, senha errada e hash malformado', () => {
  assert.match(HASH, /^pbkdf2\$120000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', HASH), true);
  assert.equal(ctx.conferirSenha(crypto, 'senha-errada', HASH), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', ''), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', 'sha1$1$aa$bb'), false);
  assert.match(ctx.gerarToken(crypto), /^[0-9a-f]{64}$/);
});

test('hash: rejeita iteracoes acima de 1000000 e salt com comprimento par menor que 32', () => {
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', 'pbkdf2$5000000$00000000000000000000000000000000$' + '0'.repeat(64)), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', 'pbkdf2$120000$000000000000000$' + '0'.repeat(64)), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', 'pbkdf2$120000$0000000000000000000000000000000$' + '0'.repeat(64)), false);
});

test('login certo: devolve token, guarda sessao de 12h, e-mail sem diferenca de maiuscula', () => {
  const estado = novoEstado();
  const r = login(estado, ' lucca@rslconsultoria.com ', 'senha-forte-123');
  assert.equal(r.status, 200);
  assert.match(r.body.token, /^[0-9a-f]{64}$/);
  assert.equal(r.body.nome, 'Lucca');
  assert.equal(r.body.perfil, 'ADM');
  assert.equal(r.body.expiraEm, new Date(T0 + 12 * 3600 * 1000).toISOString());
  assert.deepEqual(limpo(estado.sessoes[r.body.token]), {
    email: 'lucca@rslconsultoria.com', nome: 'Lucca', perfil: 'ADM', expira: T0 + 12 * 3600 * 1000
  });
});

test('login: campos faltando = 400; senha errada, inativo ou desconhecido = 401', () => {
  const estado = novoEstado();
  assert.equal(login(estado, '', 'x').status, 400);
  assert.deepEqual(login(estado, 'lucca@rslconsultoria.com', 'errada'), { status: 401, body: { erro: 'E-mail ou senha incorretos.' } });
  assert.equal(login(estado, 'inativo@x.com', 'senha-forte-123').status, 401);
  assert.equal(login(estado, 'ninguem@x.com', 'senha-forte-123').status, 401);
});

test('login: 5 falhas em 15 min bloqueiam, mesmo com a senha certa; depois libera', () => {
  const estado = novoEstado();
  for (let i = 0; i < 5; i++) login(estado, 'lucca@rslconsultoria.com', 'errada', T0 + i * 1000);
  const bloqueado = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123', T0 + 10000);
  assert.deepEqual(bloqueado, { status: 429, body: { erro: 'Muitas tentativas. Tente de novo em 15 minutos.' } });
  const depois = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123', T0 + 16 * 60 * 1000);
  assert.equal(depois.status, 200);
  assert.equal(estado.tentativas['lucca@rslconsultoria.com'], undefined);
});

test('login: rejeita e-mails com nomes de prototipo (constructor, __proto__)', () => {
  const estado = novoEstado();
  const r1 = login(estado, 'constructor', 'senha-forte-123');
  assert.deepEqual(r1, { status: 401, body: { erro: 'E-mail ou senha incorretos.' } });
  const r2 = login(estado, '__proto__', 'qualquer-senha');
  assert.deepEqual(r2, { status: 401, body: { erro: 'E-mail ou senha incorretos.' } });
  const r3 = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123');
  assert.equal(r3.status, 200);
});

test('board: sem token ou token invalido = 401', () => {
  const estado = novoEstado();
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, undefined, T0)), { status: 401, body: { erro: 'Sessão expirada.' } });
  assert.equal(ctx.validarPedidoBoard(estado, 'Bearer ' + 'a'.repeat(64), T0).status, 401);
});

test('board: token valido sem cache pede leitura; com cache novo devolve o cache', () => {
  const estado = novoEstado();
  const token = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123').body.token;
  const cab = 'Bearer ' + token;
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0)), { ler: true });

  const r = limpo(ctx.montarRespostaBoard(estado, [], [], T0));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { geradoEm: new Date(T0).toISOString(), caixas: [], avisos: [], usuarios: [], dealsEditaveis: [],
    pedidos: [], etapasPedido: limpo(ctx.ETAPAS_PADRAO) });

  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0 + 29000)), { status: 200, body: r.body });
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0 + 31000)), { ler: true });
});

test('board: sessao vencida = 401 e some do estado', () => {
  const estado = novoEstado();
  const token = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123').body.token;
  const r = ctx.validarPedidoBoard(estado, 'Bearer ' + token, T0 + 12 * 3600 * 1000 + 1);
  assert.equal(r.status, 401);
  assert.equal(estado.sessoes[token], undefined);
});
