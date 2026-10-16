// ===== adaptador: Montar Pedido de Interpretação (workflow da API) =====
// Depois da associação manual gravada: o "Disparar Interpretação" manda só
// { mensagemId, dealId } ao workflow Interpretar WhatsApp, sem esperar.
var pedidoAcao = $('Processar Acao').first().json.interpretar || {};
return [{ json: { mensagemId: texto(pedidoAcao.mensagemId), dealId: texto(pedidoAcao.dealId) } }];
