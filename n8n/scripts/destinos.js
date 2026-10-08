// Destinos de escrita do ramo "acao" do workflow PCP MRBL - API, na ordem em
// que sao gravados. Cada destino vira 3 nodes: Code "Filtrar ..." (linhas
// daquele destino, lidas de $('Processar Acao')), IF "Tem ...?" e o Google
// Sheets que grava. Usado por gerar-code-nodes.js, gerar-workflow-sdk.js e testes.
const VERBO = { update: 'Atualizar', append: 'Incluir', appendOrUpdate: 'Gravar' };

const DESTINOS = [
  { aba: 'FALTANTES', operacao: 'update', chave: 'id', fonte: 'operacoes' },
  { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id', fonte: 'operacoes' },
  { aba: 'PEDIDOS', operacao: 'append', chave: 'id', fonte: 'operacoes' },
  { aba: 'PEDIDOS', operacao: 'update', chave: 'id', fonte: 'operacoes' },
  { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', fonte: 'operacoes' },
  { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', fonte: 'operacoes' },
  { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', fonte: 'operacoes' },
  { aba: 'ETAPAS_PEDIDO', operacao: 'update', chave: 'id', fonte: 'operacoes' },
  { aba: 'HISTORICO_APP', operacao: 'append', chave: 'id', fonte: 'historicos' }
].map((d) => Object.assign(d, {
  arquivo: 'filtrar-' + d.aba.toLowerCase().replace(/_/g, '-') + '-' + d.operacao.toLowerCase(),
  filtrar: 'Filtrar ' + d.aba + ' ' + d.operacao,
  tem: 'Tem ' + d.aba + ' ' + d.operacao + '?',
  gravar: VERBO[d.operacao] + ' ' + d.aba
}));

// Texto do Code node "Filtrar ...": o adaptador com as constantes trocadas.
// O primeiro destino tambem confere a lista inteira (CONFERIR) antes de
// qualquer escrita.
function codigoFiltrar(template, d, i) {
  const so = (x) => ({ aba: x.aba, operacao: x.operacao, chave: x.chave, fonte: x.fonte });
  return template
    .replace('/*DESTINO*/null', JSON.stringify(so(d)))
    .replace('/*CONFERIR*/null', i === 0 ? JSON.stringify(DESTINOS.map(so)) : 'null');
}

module.exports = { DESTINOS, codigoFiltrar };
