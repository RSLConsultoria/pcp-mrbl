// ===== adaptador: Processar Acao =====
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
var corpo = entrada.body || {};
var ler = function (nome) { return $(nome).all().map(function (i) { return i.json; }); };
var linhas = {
  faltantes: ler('Ler FALTANTES Acao'),
  caixasPcp: ler('Ler CAIXAS_PCP Acao'),
  ganhas: ler('Ler CAIXAS GANHAS Acao'),
  pedidos: ler('Ler PEDIDOS Acao'),
  pedidosItens: ler('Ler PEDIDOS_ITENS Acao'),
  etapas: ler('Ler ETAPAS_PEDIDO Acao')
};
var gerarId = function () { return require('crypto').randomUUID(); };
return [{ json: processarAcao(estado, cabecalho, corpo, linhas, Date.now(), gerarId) }];
