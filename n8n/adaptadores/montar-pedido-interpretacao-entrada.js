// ===== adaptador: Montar Pedido de Interpretação (Entrada) =====
// Mensagem ligada pelo associador: o "Disparar Interpretação" manda só
// { mensagemId, dealId } ao workflow Interpretar WhatsApp, sem esperar.
// Lê do "Finalizar Associação": a saída do "Gravar Associação" é a resposta do Google.
var pedidoEntrada = ($('Finalizar Associação').first().json || {}).interpretar || {};
return [{ json: { mensagemId: texto(pedidoEntrada.mensagemId), dealId: texto(pedidoEntrada.dealId) } }];
