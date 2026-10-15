// ===== adaptador: Montar Erro WhatsApp Entrada =====
// Nunca copia o payload, o texto ou a saída do modelo para ERROS_APP.
var dealErroEntrada = '';
try {
  var pErroEntrada = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
  dealErroEntrada = texto(pErroEntrada.dealId);
} catch (e) {}
var linhaErroEntrada = linhaErroApp({
  corpo: { tipo: 'WHATSAPP_ENTRADA', dealId: dealErroEntrada },
  erro: 'Falha técnica ao receber ou interpretar uma mensagem do WhatsApp.'
});
var reqErroEntrada = requisicaoErroApp(linhaErroEntrada, PLANILHA_ID);
return [{ json: reqErroEntrada }];
