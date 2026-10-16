// ===== adaptador: Montar Erro de Interpretação (workflow Interpretar WhatsApp) =====
// Nunca copia o texto da mensagem nem a saída do modelo para ERROS_APP.
var dealErroManual = '';
try {
  dealErroManual = texto(($('Receber Pedido de Interpretação').first().json || {}).dealId);
} catch (e) {}
var linhaErroManual = linhaErroApp({
  corpo: { tipo: 'WHATSAPP_INTERPRETAR', dealId: dealErroManual },
  erro: 'Falha técnica ao interpretar uma mensagem associada manualmente.'
});
return [{ json: requisicaoErroApp(linhaErroManual, PLANILHA_ID) }];
