// ===== adaptador: Resultado WhatsApp =====
var mensagem = $('Selecionar Saida WhatsApp').first().json || {};
var resposta = $input.first().json || {};
return [{ json: resultadoSaidaWhatsapp(mensagem, resposta) }];
