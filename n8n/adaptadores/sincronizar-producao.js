// ===== adaptador: Montar Sincronizacao de Producao =====
// Consolida as paginas do Ploomes, normaliza OtherProperties e transforma o
// resultado em requisicoes idempotentes para PRODUCAO e OFICINAS.
var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS'];
var planilha = planilhaDoLote($('Ler Snapshot Produção').first().json, LEITURAS_SYNC_PRODUCAO);
var cards = [];
var entradas = $input.all();
entradas.forEach(function (item, indice) {
  var resposta = item && item.json ? item.json : {};
  if (resposta.statusCode === undefined && resposta.body === undefined && Array.isArray(resposta.value)) {
    resposta = { statusCode: 200, body: resposta };
  }
  var pagina = avaliarPaginaProducao(resposta, indice + 1, 100);
  if (!pagina.ok) throw new Error(pagina.erro);
  pagina.itens.forEach(function (deal) {
    var card = normalizarDealProducao(deal);
    if (!card.dealId || !card.os) throw new Error('Negócio da produção sem deal_id ou OS. Sincronização cancelada.');
    cards.push(card);
  });
});
var agora = new Date().toISOString();
var resultado = montarSincronizacaoProducao(cards, planilha.linhas.PRODUCAO, planilha.linhas.OFICINAS, agora);
var reqs = requisicoesDeEscrita(resultado.operacoes, [], planilha, PLANILHA_ID);
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body, repetir: r.repetir === true } };
});
