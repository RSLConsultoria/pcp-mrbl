// ===== adaptador: Selecionar Interpretações (workflow Retentar Interpretação) =====
// Depois de gravadas as tentativas: um item por mensagem reservada, só com
// { mensagemId, dealId, reservada }, para o Interpretar WhatsApp.
return ($('Marcar Tentativas').first().json.pedidos || []).map(function (p) {
  return { json: { mensagemId: texto(p.mensagemId), dealId: texto(p.dealId), reservada: p.reservada === true } };
});
