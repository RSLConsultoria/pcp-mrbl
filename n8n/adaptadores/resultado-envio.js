// ===== adaptador: Resultado Envio =====
// Grupo a grupo: todas as linhas do grupo recebem o mesmo resultado, um item
// por linha do HISTORICO_APP (o Gravar Envio atualiza por id). 429 pula o
// grupo inteiro (fica PENDENTE). Erro de rede/timeout chega como item com
// $json.error e sem statusCode (onError continueRegularOutput): conta como
// tentativa falha.
var base = $('Montar Registro').all();
var resp = $input.all();
var saida = [];
for (var i = 0; i < base.length; i++) {
  var grupo = base[i].json.grupo;
  var r = (resp[i] && resp[i].json) || {};
  resultadoGrupo(grupo, { status: r.statusCode, body: r.body, statusText: r.statusMessage, erro: r.error })
    .forEach(function (res) { saida.push({ json: res }); });
}
return saida;
