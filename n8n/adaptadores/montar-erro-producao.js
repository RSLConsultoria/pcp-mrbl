// ===== adaptador: Montar Erro Producao =====
// Registra somente metadados tecnicos; nunca inclui resposta do Ploomes,
// cabecalhos, credenciais ou linhas da planilha.
function tentarProducao(f) {
  try { return f(); } catch (e) { return undefined; }
}
var erroEntrada = tentarProducao(function () { return $input.first().json; }) || {};
var loteProducao = tentarProducao(function () { return $('Loop Escritas Produção').first().json; }) || {};
var mensagemErro = erroEntrada.error !== undefined ? erroEntrada.error : erroEntrada;
var linhaErro = linhaErroApp({
  agora: Date.now(),
  sessao: { nome: 'sistema' },
  corpo: { tipo: 'sincronizar_producao' },
  lote: loteProducao,
  erro: mensagemErro
});
var reqErro = requisicaoErroApp(linhaErro, PLANILHA_ID);
return [{ json: { method: reqErro.method, url: reqErro.url, body: reqErro.body } }];
