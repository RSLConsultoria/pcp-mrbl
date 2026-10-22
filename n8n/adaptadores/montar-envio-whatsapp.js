// ===== adaptador: Montar Envio WhatsApp =====
// Fica entre "Conectada?" e "Enviar pela Evolution": nada daqui volta para a planilha.
var selecionadaEnvio = $('Selecionar Saida WhatsApp').first().json || {};
var filaEnvio = $('Ler Fila WhatsApp').all().map(function (i) { return i.json || {}; });
return [{ json: { corpo: corpoEnvioWhatsapp(selecionadaEnvio, filaEnvio) } }];
