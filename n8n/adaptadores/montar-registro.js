// ===== adaptador: Montar Registro =====
// Buscar Contato fora de 2xx (inclusive 429): descarta o item, ele segue PENDENTE
// e entra na proxima rodada. Resultado Envio le a mesma lista ($('Montar Registro').all()).
var linhas = $('Selecionar Envio').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < linhas.length; i++) {
  var linha = linhas[i].json.linha;
  var r = resp[i] && resp[i].json;
  if (!r || !respostaOk(r.statusCode)) continue;
  var v = r.body && r.body.value;
  var contactId = v && v[0] ? v[0].ContactId : null;
  saida.push({ json: { linha: linha, registro: montarRegistro(linha, contactId) } });
}
return saida;
