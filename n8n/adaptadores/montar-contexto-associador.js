// ===== adaptador: Montar Contexto do Associador =====
// Manda ao subworkflow só o contexto sem JID, telefone ou nome (contextoAssociadorWhatsapp).
var preparadaAssoc = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
return [{ json: (preparadaAssoc.pedidoAssociador || {}).entrada || {} }];
