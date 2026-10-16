// Monta o texto de cada Code node: todos os arquivos de src/ (mesma ordem do
// carregador de testes) + o adaptador do node. Saida em build/<node>.js,
// que e o texto colado no n8n.
const fs = require('fs');
const path = require('path');
const { ARQUIVOS } = require('../test/carregar');

const raiz = path.join(__dirname, '..');
const NODES = {
  'processar-login': 'Processar Login',
  'validar-pedido': 'Validar Pedido',
  'montar-board': 'Montar Board',
  'pre-validar-acao': 'Pre Validar Acao',
  'processar-acao': 'Processar Acao',
  'montar-alteracao-ploomes': 'Montar Alteracao Ploomes',
  'validar-alteracao-ploomes': 'Validar Alteracao Ploomes',
  'montar-escritas': 'Montar Escritas',
  'limpar-cache': 'Limpar Cache',
  'montar-erro': 'Montar Erro',
  'selecionar-envio': 'Selecionar Envio',
  'invalidas-envio': 'Marcar Invalidas',
  'montar-registro': 'Montar Registro',
  'resultado-envio': 'Resultado Envio',
  'selecionar-whatsapp-saida': 'Selecionar Saida WhatsApp',
  'resultado-whatsapp-saida': 'Resultado WhatsApp',
  'preparar-whatsapp-entrada': 'Preparar Entrada WhatsApp',
  'montar-contexto-interprete': 'Montar Contexto do Intérprete',
  'finalizar-whatsapp-entrada': 'Finalizar Entrada WhatsApp',
  'montar-erro-whatsapp-entrada': 'Montar Erro WhatsApp Entrada',
  'sincronizar-producao': 'Montar Sincronização',
  'montar-erro-producao': 'Montar Erro Produção',
  'montar-pedido-interpretacao': 'Montar Pedido de Interpretação',
  'preparar-interpretacao-manual': 'Preparar Interpretação',
  'montar-contexto-interpretacao-manual': 'Montar Contexto do Intérprete (Interpretar WhatsApp)',
  'finalizar-interpretacao-manual': 'Finalizar Interpretação',
  'montar-erro-interpretacao-manual': 'Montar Erro de Interpretação (Interpretar WhatsApp)',
  'selecionar-interpretacoes-pendentes': 'Selecionar Interpretações',
  'marcar-erros-interpretacao': 'Marcar Erros Definitivos'
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

