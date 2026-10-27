// ===== adaptador: Preparar Leituras da Peça =====
// Entrada: resposta do "Buscar Cards da Peça" (fullResponse). Saída pronta (lista de OS,
// 404 ou 502), o pedido da leitura pela referência (número que não é OS) ou as URLs de
// registros, trocas e etapas dos cards da OS.
var estadoPeca = $getWorkflowStaticData('global');
var pedidoPeca = $('Validar Peça').first().json;
return [{ json: prepararLeiturasPeca(pedidoPeca.busca, $input.first().json, Date.now(), estadoPeca) }];
