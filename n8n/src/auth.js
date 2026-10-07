// ===== src/auth.js =====
// Hash de senha e token de sessao. O modulo crypto do Node chega por
// parametro (cripto): no n8n vem de require('crypto') no adaptador, nos
// testes vem direto do Node.
// Formato do hash: pbkdf2$<iteracoes>$<salt hex>$<hash hex> (SHA-256, 32 bytes).

var PBKDF2_ITERACOES = 120000;

function gerarHash(cripto, senha, saltHex) {
  var salt = saltHex || cripto.randomBytes(16).toString('hex');
  var h = cripto.pbkdf2Sync(senha, salt, PBKDF2_ITERACOES, 32, 'sha256').toString('hex');
  return 'pbkdf2$' + PBKDF2_ITERACOES + '$' + salt + '$' + h;
}

function iguaisTempoConstante(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function conferirSenha(cripto, senha, armazenado) {
  var p = texto(armazenado).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  var it = Number(p[1]);
  if (!isFinite(it) || it < 1 || it > 1000000) return false;
  if (!/^[0-9a-f]+$/.test(p[2]) || p[2].length % 2 !== 0 || p[2].length < 32) return false;
  if (!/^[0-9a-f]{64}$/.test(p[3])) return false;
  var h = cripto.pbkdf2Sync(senha, p[2], it, 32, 'sha256').toString('hex');
  return iguaisTempoConstante(h, p[3]);
}

function gerarToken(cripto) {
  return cripto.randomBytes(32).toString('hex');
}
