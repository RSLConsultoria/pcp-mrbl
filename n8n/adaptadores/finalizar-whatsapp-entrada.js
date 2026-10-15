// ===== adaptador: Finalizar Entrada WhatsApp =====
// O subworkflow do modelo deve devolver { interpretacao: {...} }.
// Toda saída passa pela validação pura antes da aba.
var preparadaFinal = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
var respostaModelo = $input.first().json || {};
var contratoModelo = respostaDoInterpreteWhatsapp(respostaModelo);
if (!contratoModelo.ok) throw new Error(contratoModelo.erro);
var concluidaEntrada = concluirEntradaWhatsapp(preparadaFinal, contratoModelo.interpretacao, {
  agora: new Date().toISOString(),
  gerarId: function () { return idSugestaoWhatsapp(preparadaFinal.mensagemId); }
});

if (!concluidaEntrada.ok) throw new Error(concluidaEntrada.erro || 'Falha ao concluir a entrada do WhatsApp.');
if (concluidaEntrada.erroInterpretacao) {
  throw new Error('Saída inválida do intérprete: ' + concluidaEntrada.erroInterpretacao);
}
var sugestoesEntrada = concluidaEntrada.operacoes.filter(function (o) { return o.aba === 'WHATSAPP_SUGESTOES'; });
if (!sugestoesEntrada.length) return [];
var planilhaFinal = planilhaDoLote($('Ler Contexto WhatsApp').first().json || {},
  ['OFICINAS', 'PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES']);
var reqsSugestao = requisicoesDeEscrita(sugestoesEntrada, [], planilhaFinal, PLANILHA_ID);
if (reqsSugestao.length !== 1) throw new Error('A interpretação deve gerar uma única gravação de sugestão.');
return [{ json: Object.assign({ gravar: true }, reqsSugestao[0]) }];
