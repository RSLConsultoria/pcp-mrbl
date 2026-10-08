// ===== adaptador: Montar Registro =====
// Buscar Contato: 429/5xx ou erro de rede/timeout (item com $json.error e sem
// statusCode) descarta o item (segue PENDENTE, proxima rodada);
// outro nao-2xx (ex. 404) mantem o item e monta o registro sem ContactId.
// Resultado Envio le a mesma lista ($('Montar Registro').all()).
var linhas = $('Selecionar Envio').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < linhas.length; i++) {
  var linha = linhas[i].json.linha;
  var d = decidirContato(resp[i] && resp[i].json);
  if (d.pular) continue;
  saida.push({ json: { linha: linha, registro: montarRegistro(linha, d.contactId) } });
}
return saida;
