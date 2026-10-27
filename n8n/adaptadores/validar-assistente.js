// ===== adaptador: Validar Assistente =====
// POST /pcp-assistente: sessão, corpo e limite de 30 por hora. Pronto = vai direto ao
// Responder Assistente; senão leva o corpo do pedido ao Groq.
var estadoAssistente = $getWorkflowStaticData('global');
var entradaAssistente = $('Assistente').first().json;
return [{ json: validarPedidoAssistente(estadoAssistente, (entradaAssistente.headers || {}).authorization, entradaAssistente.body || {}, Date.now()) }];
