// ===== adaptador: Preparar Entrada WhatsApp =====
// O webhook recebe o payload bruto, mas somente a mensagem normalizada segue
// para a planilha. O ID interno é determinístico para reduzir duplicatas.
var planilhaEntrada = planilhaDoLote($input.first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
var recebido = $('Receber WhatsApp').first().json || {};
var payloadEntrada = recebido.body && typeof recebido.body === 'object' ? recebido.body : recebido;
var criptoEntrada = require('crypto');
var preparadaEntrada = prepararEntradaWhatsapp(payloadEntrada, {
  oficinas: planilhaEntrada.linhas.OFICINAS,
  producao: planilhaEntrada.linhas.PRODUCAO,
  mensagens: planilhaEntrada.linhas.WHATSAPP_MENSAGENS
}, {
  instancia: 'producao',
  // Até o go-live, o associador só liga a OS liberadas (vazio = todas).
  dealsPermitidos: DEALS_PRODUCAO_EDITAVEIS,
  agora: new Date().toISOString(),
  gerarId: function (evolutionId) {
    return 'WA-R-' + criptoEntrada.createHash('sha256').update(texto(evolutionId)).digest('hex').slice(0, 24);
  }
});

if (!preparadaEntrada.ok) throw new Error(preparadaEntrada.erro || 'Falha ao preparar a entrada do WhatsApp.');
if (preparadaEntrada.ignorada) {
  return [{ json: { gravar: false, precisaInterpretar: false, precisaAssociar: false, motivo: preparadaEntrada.motivo } }];
}

var opMensagem = Object.assign({}, preparadaEntrada.operacoes[0], { operacao: 'appendOrUpdate' });
var reqsEntrada = requisicoesDeEscrita([opMensagem], [], planilhaEntrada, PLANILHA_ID);
if (reqsEntrada.length !== 1) throw new Error('A mensagem recebida deve gerar uma única gravação.');
var reqEntrada = reqsEntrada[0];
return [{ json: {
  gravar: true,
  precisaInterpretar: preparadaEntrada.precisaInterpretar === true,
  // Associador por IA (22/10): lido pelo node "Precisa Associar?".
  precisaAssociar: preparadaEntrada.precisaAssociar === true,
  method: reqEntrada.method,
  url: reqEntrada.url,
  body: reqEntrada.body,
  preparacao: preparadaEntrada
} }];
