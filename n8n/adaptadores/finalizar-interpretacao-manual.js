// ===== adaptador: Finalizar Interpretação (workflow Interpretar WhatsApp) =====
// Mesma validação da entrada (concluirEntradaWhatsapp): a sugestão PENDENTE
// tem id determinístico a partir da mensagem e nunca vira resposta ao grupo.
var preparadaManualFinal = $('Preparar Interpretação').first().json.preparacao || {};
var contratoManual = respostaDoInterpreteWhatsapp($input.first().json || {});
if (!contratoManual.ok) throw new Error(contratoManual.erro);
var concluidaManual = concluirEntradaWhatsapp(preparadaManualFinal, contratoManual.interpretacao, {
  agora: new Date().toISOString(),
  gerarId: function () { return idSugestaoWhatsapp(preparadaManualFinal.mensagemId); }
});
if (!concluidaManual.ok) throw new Error(concluidaManual.erro || 'Falha ao concluir a interpretação.');
if (concluidaManual.erroInterpretacao) throw new Error('Saída inválida do intérprete: ' + concluidaManual.erroInterpretacao);
var sugestoesManual = concluidaManual.operacoes.filter(function (o) { return o.aba === 'WHATSAPP_SUGESTOES'; });
if (!sugestoesManual.length) return [];
var planilhaManualFinal = planilhaDoLote($('Ler Contexto da Interpretação').first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
var reqsManual = requisicoesDeEscrita(sugestoesManual, [], planilhaManualFinal, PLANILHA_ID);
if (reqsManual.length !== 1) throw new Error('A interpretação deve gerar uma única gravação de sugestão.');
return [{ json: Object.assign({ gravar: true }, reqsManual[0]) }];
