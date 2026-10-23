// ===== adaptador: Finalizar Associação =====
// O subworkflow devolve { associacao: {...} }. Valida, decide e monta as gravações.
// Falha (saída inválida) = erro do nó; a mensagem continua SEM_ASSOCIACAO.
var preparadaFim = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
var pedidoFim = preparadaFim.pedidoAssociador || {};
var saidaAssoc = ($input.first().json || {}).associacao;
var decisao = decidirAssociacaoWhatsapp(pedidoFim, saidaAssoc, {
  agora: new Date().toISOString(),
  gerarId: function () { return 'WA-P-' + texto(pedidoFim.mensagem && pedidoFim.mensagem.id).replace(/^WA-R-/, ''); }
});
if (!decisao.ok) throw new Error('Saída inválida do associador: ' + decisao.erro);
if (!decisao.operacoes.length) return [];
var planilhaAssoc = planilhaDoLote($('Ler Contexto WhatsApp').first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
// A mensagem foi gravada depois da leitura: entra com a linha devolvida pela gravação.
incluirLinhaGravadaWhatsapp(planilhaAssoc, pedidoFim.mensagem, $('Gravar Mensagem Recebida').first().json || {});
return requisicoesDeEscrita(decisao.operacoes, [], planilhaAssoc, PLANILHA_ID).map(function (req, i) {
  return { json: Object.assign({ interpretar: i === 0 ? decisao.interpretar : null }, req) };
});
