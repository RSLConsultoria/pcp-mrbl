// ===== adaptador: Fechar Perguntas Vencidas =====
// Pergunta do associador com mais de 24 h fecha; a original volta para SEM_ASSOCIACAO
// e aparece em "aguardando associação" no app.
var planilhaVencidas = planilhaDoLote($('Ler Interpretações Pendentes').first().json || {}, LEITURAS_RETENTAR_INTERPRETACAO);
var vencidas = fecharPerguntasVencidasWhatsapp(planilhaVencidas.linhas.WHATSAPP_MENSAGENS, new Date().toISOString());
if (!vencidas.operacoes.length) return [];
return requisicoesDeEscrita(vencidas.operacoes, [], planilhaVencidas, PLANILHA_ID).map(function (r) { return { json: r }; });
