// ===== adaptador: Montar Board =====
// Entrada: a resposta do values:batchGet do HTTP "Ler Planilha" (abas em
// LEITURAS_BOARD), convertida nas mesmas linhas que o node Sheets entregava.
var estado = $getWorkflowStaticData('global');
var abas = planilhaDoLote($('Ler Planilha').first().json, LEITURAS_BOARD).linhas;
var extras = {
  caixasPcp: abas['CAIXAS_PCP'],
  historico: abas['HISTORICO_APP'],
  usuarios: abas['USUARIOS'],
  pedidos: abas['PEDIDOS'],
  pedidosItens: abas['PEDIDOS_ITENS'],
  etapas: abas['ETAPAS_PEDIDO']
};
return [{ json: montarRespostaBoard(estado, abas['FALTANTES'], abas['CAIXAS GANHAS'], Date.now(), extras) }];
