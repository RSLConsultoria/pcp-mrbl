// ===== adaptador: Marcar Tentativas (workflow Retentar Interpretação) =====
// Num batchUpdate só: ERRO definitivo nas mensagens que esgotaram as 5
// tentativas (a conversa mostra "Não foi possível interpretar esta mensagem.") e
// a reserva da próxima tentativa (tentativas + 1) nas vencidas que vão ao
// Interpretar WhatsApp. Os pedidos seguem junto, para o disparo usar a mesma escolha.
var planilhaTentativas = planilhaDoLote($input.first().json || {}, LEITURAS_RETENTAR_INTERPRETACAO);
var escolhaTentativas = selecionarInterpretacoesPendentesWhatsapp({
  producao: planilhaTentativas.linhas.PRODUCAO,
  mensagens: planilhaTentativas.linhas.WHATSAPP_MENSAGENS,
  sugestoes: planilhaTentativas.linhas.WHATSAPP_SUGESTOES
}, new Date().toISOString());
var linhasTentativas = escolhaTentativas.erros.concat(escolhaTentativas.reservas);
if (!linhasTentativas.length) return [];
var reqsTentativas = requisicoesDeEscrita(linhasTentativas.map(function (l) {
  return { aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id', linha: l };
}), [], planilhaTentativas, PLANILHA_ID);
if (reqsTentativas.length !== 1) throw new Error('As tentativas devem gerar uma única gravação.');
return [{ json: Object.assign({ pedidos: escolhaTentativas.interpretar }, reqsTentativas[0]) }];
