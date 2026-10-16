// ===== adaptador: Preparar Interpretação (workflow Interpretar WhatsApp) =====
// Recebe { mensagemId, dealId } da API depois da associação manual gravada.
// Mensagem que já tem sugestão, não textual ou que mudou de OS não é interpretada.
var pedidoInterpretacao = $('Receber Pedido de Interpretação').first().json || {};
var planilhaInterpretacao = planilhaDoLote($input.first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
var preparadaManual = prepararInterpretacaoManualWhatsapp({
  producao: planilhaInterpretacao.linhas.PRODUCAO,
  mensagens: planilhaInterpretacao.linhas.WHATSAPP_MENSAGENS,
  sugestoes: planilhaInterpretacao.linhas.WHATSAPP_SUGESTOES,
  faltantes: planilhaInterpretacao.linhas.FALTANTES,
  ganhas: planilhaInterpretacao.linhas['CAIXAS GANHAS']
}, {
  mensagemId: texto(pedidoInterpretacao.mensagemId),
  dealId: texto(pedidoInterpretacao.dealId)
}, dataISOEmSaoPaulo(new Date().toISOString()));
if (!preparadaManual.ok) throw new Error(preparadaManual.erro || 'Falha ao preparar a interpretação.');
if (!preparadaManual.interpretar) return [{ json: { interpretar: false, motivo: preparadaManual.motivo } }];
return [{ json: { interpretar: true, preparacao: preparadaManual.preparacao, entrada: preparadaManual.entrada } }];
