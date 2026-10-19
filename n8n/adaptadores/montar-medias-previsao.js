// ===== adaptador: Montar Médias de Previsão =====
// Junta as páginas do Ploomes (registros marcados e negócios), calcula as médias
// (src/previsao.js) e transforma em requisições para a PREVISAO_MEDIAS. Qualquer
// falha de leitura ou de conferência vira uma linha no ERROS_APP e nada mais é
// gravado: as médias anteriores continuam valendo.
var agora = new Date().toISOString();
function lerPaginasPloomes(itens) {
  var lista = [];
  for (var i = 0; i < itens.length; i++) {
    var resposta = itens[i] && itens[i].json ? itens[i].json : {};
    if (resposta.statusCode === undefined && resposta.body === undefined && Array.isArray(resposta.value)) {
      resposta = { statusCode: 200, body: resposta };
    }
    var pagina = avaliarPaginaProducao(resposta, i + 1, 100);
    if (!pagina.ok) return { ok: false, erro: pagina.erro };
    lista = lista.concat(pagina.itens);
  }
  return { ok: true, itens: lista };
}
var reqs;
try {
  var planilha = planilhaDoLote($('Ler Médias Atuais').first().json, LEITURAS_MEDIAS_PREVISAO);
  var registros = lerPaginasPloomes($('Buscar Registros no Ploomes').all());
  var negocios = registros.ok ? lerPaginasPloomes($input.all()) : registros;
  var resultado = !negocios.ok ? negocios
    : montarAtualizacaoMedias(registros.itens, negocios.itens, planilha.linhas.PREVISAO_MEDIAS, hojeSaoPaulo(Date.parse(agora)), agora);
  if (!resultado.ok) throw new Error(resultado.erro);
  reqs = requisicoesDeEscrita(resultado.operacoes, [], planilha, PLANILHA_ID);
} catch (e) {
  var linhaErro = linhaErroApp({ agora: Date.parse(agora), sessao: { nome: 'sistema' }, corpo: { tipo: 'medias_previsao' }, erro: e });
  reqs = [requisicaoErroApp(linhaErro, PLANILHA_ID)];
}
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body, repetir: r.repetir === true } };
});
