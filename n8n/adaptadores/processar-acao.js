// ===== adaptador: Processar Acao =====
// Linhas: resposta do values:batchGet do HTTP "Ler Planilha Acao" (LEITURAS_ACAO).
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
var corpo = entrada.body || {};
var abas = planilhaDoLote($('Ler Planilha Acao').first().json, LEITURAS_ACAO).linhas;
var linhas = {
  faltantes: abas['FALTANTES'],
  caixasPcp: abas['CAIXAS_PCP'],
  ganhas: abas['CAIXAS GANHAS'],
  pedidos: abas['PEDIDOS'],
  pedidosItens: abas['PEDIDOS_ITENS'],
  etapas: abas['ETAPAS_PEDIDO']
};
var gerarId = function () { return require('crypto').randomUUID(); };
return [{ json: processarAcao(estado, cabecalho, corpo, linhas, Date.now(), gerarId) }];
