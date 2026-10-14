// ===== adaptador: Validar Alteracao Ploomes =====
// O HTTP Request usa neverError para que respostas 4xx/5xx cheguem aqui e
// impeçam qualquer escrita na planilha.
var resposta = $input.first().json || {};
var status = Number(resposta.statusCode || 0);
return [{ json: {
  ok: status >= 200 && status < 300,
  status: status,
  erro: status ? 'O Ploomes recusou a alteracao (HTTP ' + status + '). A planilha nao foi alterada.' :
    'Nao foi possivel confirmar a gravacao no Ploomes. A planilha nao foi alterada.'
} }];
