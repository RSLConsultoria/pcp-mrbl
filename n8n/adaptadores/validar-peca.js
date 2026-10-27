// ===== adaptador: Validar Peça =====
// GET /pcp-peca?q=: sessão, busca e cache (60 s). Pronto = vai direto ao Responder Peça.
var estadoPeca = $getWorkflowStaticData('global');
var entradaPeca = $('Peça').first().json;
return [{ json: validarPedidoPeca(estadoPeca, (entradaPeca.headers || {}).authorization, entradaPeca.query || {}, Date.now()) }];
