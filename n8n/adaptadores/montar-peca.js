// ===== adaptador: Montar Peça =====
// Junta cards, registros, trocas e etapas na resposta do pcp-peca e guarda no cache.
var estadoPeca = $getWorkflowStaticData('global');
var leiturasPeca = $('Preparar Leituras da Peça').first().json;
return [{ json: finalizarPeca(leiturasPeca, {
  registros: $('Buscar Registros da Peça').first().json,
  trocas: $('Buscar Trocas de Etapa').first().json,
  etapas: $('Buscar Etapas do Funil').first().json
}, Date.now(), estadoPeca) }];
