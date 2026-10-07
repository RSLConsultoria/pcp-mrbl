// ===== adaptador: Resultado Envio =====
var base = $('Montar Registro').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < base.length; i++) {
  var linha = base[i].json.linha;
  var r = (resp[i] && resp[i].json) || {};
  var res = resultadoEnvio(linha, { status: r.statusCode, body: r.body, statusText: r.statusMessage });
  if (res && res.parar) break;
  saida.push({ json: res });
}
return saida;
