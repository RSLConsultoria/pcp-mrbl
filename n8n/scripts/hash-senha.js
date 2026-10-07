// Gera o senha_hash para a aba USUARIOS. Roda so na maquina de quem vai
// colar o hash na planilha: a senha nao sai daqui e nao e gravada em lugar
// nenhum.  Uso: npm run hash-senha
const crypto = require('crypto');
const { carregar } = require('../test/carregar');

function perguntarOculto(pergunta) {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);
    const stdin = process.stdin;
    let s = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    function aoDigitar(pedaco) {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', aoDigitar);
          process.stdout.write('\n');
          resolve(s);
          return;
        }
        if (ch === '\u0003') process.exit(1);
        if (ch === '\u007f' || ch === '\b') s = s.slice(0, -1);
        else s += ch;
      }
    }
    stdin.on('data', aoDigitar);
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error('Rode num terminal interativo: npm run hash-senha');
    process.exit(1);
  }
  const senha = await perguntarOculto('Senha (mínimo 6 caracteres): ');
  if (senha.length < 6) {
    console.error('Senha curta demais.');
    process.exit(1);
  }
  const conf = await perguntarOculto('Repita a senha: ');
  if (conf !== senha) {
    console.error('As senhas não batem.');
    process.exit(1);
  }
  const hash = carregar().gerarHash(crypto, senha);
  console.log('\nCole na coluna senha_hash da aba USUARIOS:\n\n' + hash + '\n');
})();
