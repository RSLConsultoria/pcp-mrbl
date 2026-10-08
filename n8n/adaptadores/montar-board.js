// ===== adaptador: Montar Board =====
var estado = $getWorkflowStaticData('global');
var ler = function (nome) { return $(nome).all().map(function (i) { return i.json; }); };
var faltantes = ler('Ler FALTANTES');
var ganhas = ler('Ler CAIXAS GANHAS');
var extras = {
  caixasPcp: ler('Ler CAIXAS_PCP'),
  historico: ler('Ler HISTORICO_APP'),
  usuarios: ler('Ler USUARIOS Board'),
  pedidos: ler('Ler PEDIDOS'),
  pedidosItens: ler('Ler PEDIDOS_ITENS'),
  etapas: ler('Ler ETAPAS_PEDIDO')
};
return [{ json: montarRespostaBoard(estado, faltantes, ganhas, Date.now(), extras) }];
