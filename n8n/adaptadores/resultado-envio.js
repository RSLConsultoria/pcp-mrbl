// ===== adaptador: Resultado Envio =====
// Linha a linha: so a que recebeu 429 e pulada (fica PENDENTE); as demais gravam.
var base = $('Montar Registro').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < base.length; i++) {
  var linha = base[i].json.linha;
  var r = (resp[i] && resp[i].json) || {};
  var res = resultadoEnvio(linha, { status: r.statusCode, body: r.body, statusText: r.statusMessage });
  if (res && res.parar) continue;
  saida.push({ json: res });
}
return saida;
