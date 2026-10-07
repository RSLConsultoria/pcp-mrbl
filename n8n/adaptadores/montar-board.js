// ===== adaptador: Montar Board =====
var estado = $getWorkflowStaticData('global');
var faltantes = $('Ler FALTANTES').all().map(function (i) { return i.json; });
var ganhas = $('Ler CAIXAS GANHAS').all().map(function (i) { return i.json; });
var extras = {
  caixasPcp: $('Ler CAIXAS_PCP').all().map(function (i) { return i.json; }),
  historico: $('Ler HISTORICO_APP').all().map(function (i) { return i.json; }),
  usuarios: $('Ler USUARIOS Board').all().map(function (i) { return i.json; })
};
return [{ json: montarRespostaBoard(estado, faltantes, ganhas, Date.now(), extras) }];
