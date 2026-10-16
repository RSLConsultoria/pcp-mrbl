// ===== adaptador: Selecionar Interpretações (workflow Retentar Interpretação) =====
// Vencidas, sem sugestão e com menos de 5 tentativas: um item por mensagem, só
// com { mensagemId, dealId }, para o Interpretar WhatsApp (até 10 por rodada).
var planilhaRetentar = planilhaDoLote($input.first().json || {}, LEITURAS_RETENTAR_INTERPRETACAO);
var escolhaRetentar = selecionarInterpretacoesPendentesWhatsapp({
  producao: planilhaRetentar.linhas.PRODUCAO,
  mensagens: planilhaRetentar.linhas.WHATSAPP_MENSAGENS,
  sugestoes: planilhaRetentar.linhas.WHATSAPP_SUGESTOES
}, new Date().toISOString());
return escolhaRetentar.interpretar.map(function (p) { return { json: p }; });
