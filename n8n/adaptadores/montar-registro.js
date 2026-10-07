// ===== adaptador: Montar Registro =====
var linhas = $('Selecionar Envio').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < linhas.length; i++) {
  var linha = linhas[i].json.linha;
  var r = resp[i] && resp[i].json;
  var v = r && r.body && r.body.value;
  var contactId = v && v[0] ? v[0].ContactId : null;
  saida.push({ json: { linha: linha, registro: montarRegistro(linha, contactId) } });
}
return saida;
