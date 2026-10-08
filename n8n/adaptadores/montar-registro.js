// ===== adaptador: Montar Registro =====
// Um registro compilado por grupo. Buscar Contato: 429/5xx ou erro de
// rede/timeout (item com $json.error e sem statusCode) descarta o grupo
// (segue PENDENTE, proxima rodada); outro nao-2xx (ex. 404) mantem o grupo e
// monta o registro sem ContactId. Resultado Envio le a mesma lista
// ($('Montar Registro').all()).
var grupos = $('Selecionar Envio').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < grupos.length; i++) {
  var grupo = grupos[i].json.grupo;
  var d = decidirContato(resp[i] && resp[i].json);
  if (d.pular) continue;
  saida.push({ json: { grupo: grupo, registro: montarRegistroCompilado(grupo, d.contactId) } });
}
return saida;
