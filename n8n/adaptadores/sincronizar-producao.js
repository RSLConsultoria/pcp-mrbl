// ===== adaptador: Montar Sincronizacao de Producao =====
// Consolida as paginas do Ploomes, normaliza OtherProperties e transforma o
// resultado em requisicoes idempotentes para PRODUCAO e OFICINAS.
var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS'];
var planilha = planilhaDoLote($('Ler Snapshot Produção').first().json, LEITURAS_SYNC_PRODUCAO);
var deals = [];
var entradas = $input.all();
entradas.forEach(function (item, indice) {
  var resposta = item && item.json ? item.json : {};
  if (resposta.statusCode === undefined && resposta.body === undefined && Array.isArray(resposta.value)) {
    resposta = { statusCode: 200, body: resposta };
  }
  var pagina = avaliarPaginaProducao(resposta, indice + 1, 100);
  if (!pagina.ok) throw new Error(pagina.erro);
  deals = deals.concat(pagina.itens);
});
// Todas as paginas lidas sem erro: so agora a ausencia de um card encerra a OS.
var separados = separarCardsSincronizacao(deals);
var agora = new Date().toISOString();
var resultado = montarSincronizacaoProducao(separados.cards, planilha.linhas.PRODUCAO, planilha.linhas.OFICINAS, agora, separados.dealsMantidos);
var reqs = requisicoesDeEscrita(resultado.operacoes, [], planilha, PLANILHA_ID);
// Avisos de card pulado vao para ERROS_APP (append, sem retry), so com o deal_id.
separados.avisos.forEach(function (aviso) {
  var linhaAviso = linhaErroApp({
    agora: Date.parse(agora), sessao: { nome: 'sistema' },
    corpo: { tipo: 'sincronizar_producao', dealId: aviso.dealId }, erro: aviso.erro
  });
  reqs.push(requisicaoErroApp(linhaAviso, PLANILHA_ID));
});
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body, repetir: r.repetir === true } };
});
