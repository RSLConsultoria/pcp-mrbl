// Carrega os arquivos de src/ num contexto vm, do mesmo jeito que o n8n
// enxerga o texto do Code node: tudo no mesmo escopo, sem import/export.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVOS = ['util.js', 'auth.js', 'montarCaixas.js', 'acoes.js', 'envioPloomes.js', 'api.js'];

function carregar() {
  const ctx = vm.createContext({});
  for (const f of ARQUIVOS) {
    const caminho = path.join(__dirname, '..', 'src', f);
    if (!fs.existsSync(caminho)) continue;
    vm.runInContext(fs.readFileSync(caminho, 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// Objetos criados dentro do vm tem outro prototipo; a ida e volta por JSON
// deixa o deepStrictEqual comparar so os dados.
function limpo(x) {
  return JSON.parse(JSON.stringify(x));
}

module.exports = { carregar, ARQUIVOS, limpo };
