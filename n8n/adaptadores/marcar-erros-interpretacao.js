// ===== adaptador: Marcar Erros Definitivos (workflow Retentar Interpretação) =====
// Mensagens que esgotaram as 5 tentativas sem sugestão viram ERRO (a conversa
// mostra "Não foi possível interpretar esta mensagem."). Um batchUpdate só.
var planilhaErros = planilhaDoLote($input.first().json || {}, LEITURAS_RETENTAR_INTERPRETACAO);
var escolhaErros = selecionarInterpretacoesPendentesWhatsapp({
  producao: planilhaErros.linhas.PRODUCAO,
  mensagens: planilhaErros.linhas.WHATSAPP_MENSAGENS,
  sugestoes: planilhaErros.linhas.WHATSAPP_SUGESTOES
}, new Date().toISOString());
if (!escolhaErros.erros.length) return [];
var reqsErros = requisicoesDeEscrita(escolhaErros.erros.map(function (l) {
  return { aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id', linha: l };
}), [], planilhaErros, PLANILHA_ID);
return reqsErros.map(function (r) { return { json: r }; });
