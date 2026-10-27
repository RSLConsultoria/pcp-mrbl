// ===== adaptador: Preparar Referência da Peça =====
// Entrada: resposta do "Buscar Cards por Referência" (fullResponse). Sempre fecha a
// resposta: lista de OS, 404 ou 502.
var estadoPeca = $getWorkflowStaticData('global');
var pedidoPeca = $('Validar Peça').first().json;
return [{ json: prepararReferenciaPeca(pedidoPeca.busca, $input.first().json, Date.now(), estadoPeca) }];
