// ===== adaptador: Resultado Envio =====
// Linha a linha: so a que recebeu 429 e pulada (fica PENDENTE); as demais gravam.
// Erro de rede/timeout chega como item com $json.error e sem statusCode
// (onError continueRegularOutput): conta como tentativa falha.
var base = $('Montar Registro').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < base.length; i++) {
  var linha = base[i].json.linha;
  var r = (resp[i] && resp[i].json) || {};
  var res = resultadoEnvio(linha, { status: r.statusCode, body: r.body, statusText: r.statusMessage, erro: r.error });
  if (res && res.parar) continue;
  saida.push({ json: res });
}
return saida;
