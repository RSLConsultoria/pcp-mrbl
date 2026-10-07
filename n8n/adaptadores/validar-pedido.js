// ===== adaptador: Validar Pedido =====
var estado = $getWorkflowStaticData('global');
var cabecalhos = $('Board').first().json.headers || {};
return [{ json: validarPedidoBoard(estado, cabecalhos.authorization, Date.now()) }];
