// ===== adaptador: Montar Erro Médias =====
// Registra somente metadados técnicos; nunca inclui resposta do Ploomes,
// cabeçalhos, credenciais ou linhas da planilha.
function tentarMedias(f) {
  try { return f(); } catch (e) { return undefined; }
}
var erroEntrada = tentarMedias(function () { return $input.first().json; }) || {};
var loteMedias = tentarMedias(function () { return $('Loop Escritas Médias').first().json; }) || {};
var linhaErro = linhaErroApp({
  agora: Date.now(),
  sessao: { nome: 'sistema' },
  corpo: { tipo: 'medias_previsao' },
  lote: loteMedias,
  erro: erroEntrada.error !== undefined ? erroEntrada.error : erroEntrada
});
var reqErro = requisicaoErroApp(linhaErro, PLANILHA_ID);
return [{ json: { method: reqErro.method, url: reqErro.url, body: reqErro.body } }];
