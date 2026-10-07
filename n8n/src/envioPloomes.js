// ===== src/envioPloomes.js =====
// Regras do workflow "Enviar ao Ploomes": quais linhas do HISTORICO_APP
// enviar, o registro de interacao e o que gravar de volta.

var MAX_TENTATIVAS_PLOOMES = 5;

function tentativasDe(linha) {
  var n = numero(linha && linha.tentativas);
  return n === null || isNaN(n) ? 0 : n;
}

function selecionarPendentes(linhas, max) {
  var limite = max === undefined ? 20 : max;
  var lista = (linhas || []).filter(function (l) {
    return l && texto(l.ploomes_status) === 'PENDENTE' && tentativasDe(l) < MAX_TENTATIVAS_PLOOMES;
  });
  lista.sort(function (a, b) {
    var x = texto(a.quando);
    var y = texto(b.quando);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return lista.slice(0, limite);
}

function montarRegistro(linha, contactId) {
  var reg = { DealId: Number(linha.deal_id) };
  if (contactId !== null && contactId !== undefined && contactId !== '' && Number(contactId) !== 0) {
    reg.ContactId = Number(contactId);
  }
  reg.Content = '[PCP · OS ' + texto(linha.os) + '] ' + texto(linha.texto);
  reg.Date = linha.quando;
  return reg;
}

function mensagemErroPloomes(resposta) {
  var b = resposta && resposta.body;
  var m = '';
  if (b && b.error && b.error.message) m = b.error.message;
  else if (b && b.message) m = b.message;
  else if (resposta && resposta.statusText) m = resposta.statusText;
  else m = 'HTTP ' + (resposta ? resposta.status : '?');
  return texto(m).slice(0, 300);
}

function resultadoEnvio(linha, resposta) {
  var status = resposta ? Number(resposta.status) : 0;
  if (status === 429) return { parar: true };
  var tentativas = tentativasDe(linha);
  if (status >= 200 && status < 300) {
    var b = resposta.body;
    var id = b && b.Id !== undefined ? b.Id
      : b && b.value && b.value[0] && b.value[0].Id !== undefined ? b.value[0].Id : '';
    return { id: linha.id, ploomes_status: 'ENVIADO', ploomes_id: String(id), tentativas: tentativas, erro: '' };
  }
  tentativas += 1;
  return {
    id: linha.id,
    ploomes_status: tentativas >= MAX_TENTATIVAS_PLOOMES ? 'ERRO' : 'PENDENTE',
    tentativas: tentativas,
    erro: mensagemErroPloomes(resposta)
  };
}
