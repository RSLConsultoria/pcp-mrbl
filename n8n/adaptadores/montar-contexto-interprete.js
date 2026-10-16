// ===== adaptador: Montar Contexto do Interprete =====
// O modelo recebe a mensagem, o contexto da OS (peça, prazo, faltas) e a
// conversa recente (montarContextoInterpretacao). JIDs, telefones e nomes de
// participantes não saem deste workflow.
var preparadaModelo = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
var contextoCurto = preparadaModelo.contextoInterpretacao || {};
var planilhaModelo = planilhaDoLote($('Ler Contexto WhatsApp').first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
var contextoModelo = montarContextoInterpretacao({
  producao: planilhaModelo.linhas.PRODUCAO,
  mensagens: planilhaModelo.linhas.WHATSAPP_MENSAGENS,
  faltantes: planilhaModelo.linhas.FALTANTES,
  ganhas: planilhaModelo.linhas['CAIXAS GANHAS']
}, {
  mensagemId: texto(preparadaModelo.mensagemId),
  dealId: texto(preparadaModelo.dealId),
  texto: texto(contextoCurto.texto),
  quando: texto(contextoCurto.quando)
}, dataISOEmSaoPaulo(new Date().toISOString()));
return [{ json: entradaInterpreteWhatsapp(contextoModelo) }];
