// Monta o texto de cada Code node: todos os arquivos de src/ (mesma ordem do
// carregador de testes) + o adaptador do node. Saida em build/<node>.js,
// que e o texto colado no n8n.
const fs = require('fs');
const path = require('path');
const { ARQUIVOS } = require('../test/carregar');
const { DESTINOS, codigoFiltrar } = require('./destinos');

const raiz = path.join(__dirname, '..');
const NODES = {
  'processar-login': 'Processar Login',
  'validar-pedido': 'Validar Pedido',
  'montar-board': 'Montar Board',
  'pre-validar-acao': 'Pre Validar Acao',
  'processar-acao': 'Processar Acao',
  'selecionar-envio': 'Selecionar Envio',
  'invalidas-envio': 'Marcar Invalidas',
  'montar-registro': 'Montar Registro',
  'resultado-envio': 'Resultado Envio'
};

const corpo = ARQUIVOS
  .map((f) => '// ----- src/' + f + ' -----\n' + fs.readFileSync(path.join(raiz, 'src', f), 'utf8'))
  .join('\n');

fs.mkdirSync(path.join(raiz, 'build'), { recursive: true });
for (const [arq, nome] of Object.entries(NODES)) {
  const adaptador = fs.readFileSync(path.join(raiz, 'adaptadores', arq + '.js'), 'utf8');
  const txt =
    '// ===== Code node "' + nome + '" =====\n' +
    '// GERADO por n8n/scripts/gerar-code-nodes.js. Nao edite no n8n.\n' +
    '// Para mudar a logica, edite n8n/src/ e rode: npm run build\n\n' +
    corpo + '\n' + adaptador;
  fs.writeFileSync(path.join(raiz, 'build', arq + '.js'), txt);
  console.log('build/' + arq + '.js');
}

// Code nodes "Filtrar <aba> <operacao>" do ramo acao: so o adaptador (nao
// precisam de src/), com o destino embutido.
const template = fs.readFileSync(path.join(raiz, 'adaptadores', 'filtrar-operacoes.js'), 'utf8');
DESTINOS.forEach((d, i) => {
  const txt =
    '// ===== Code node "' + d.filtrar + '" =====\n' +
    '// GERADO por n8n/scripts/gerar-code-nodes.js. Nao edite no n8n.\n\n' +
    codigoFiltrar(template, d, i);
  fs.writeFileSync(path.join(raiz, 'build', d.arquivo + '.js'), txt);
  console.log('build/' + d.arquivo + '.js');
});
