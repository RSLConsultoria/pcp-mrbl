// ===== adaptador: Montar Escritas =====
// operacoes[]/historicos[] do Processar Acao -> um item por requisicao
// ({ method, url, body }), na ordem em que o loop "Gravar Lote" executa.
// Nada a gravar (ou acao com erro) -> um item { vazio: true }, que o IF
// "Tem Escritas?" manda direto ao Responder Acao. Erro de conferencia
// (destino desconhecido, update sem linha) derruba o node antes de gravar.
var resultado = $('Processar Acao').first().json;
if (resultado.status !== 200) return [{ json: { vazio: true } }];
var planilha = planilhaDoLote($('Ler Planilha Acao').first().json, LEITURAS_ACAO);
var reqs = requisicoesDeEscrita(resultado.operacoes || [], resultado.historicos || [], planilha, PLANILHA_ID);
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body } };
});
