// ===== src/envioPloomes.js =====
// Regras do workflow "Enviar ao Ploomes": quais linhas do HISTORICO_APP
// enviar, o registro de interacao e o que gravar de volta.

var MAX_TENTATIVAS_PLOOMES = 5;

function tentativasDe(linha) {
  var n = numero(linha && linha.tentativas);
  return n === null || isNaN(n) ? 0 : n;
}

function dealIdValido(linha) {
  var n = numero(linha && linha.deal_id);
  return n !== null && isFinite(n) && n > 0 && Math.floor(n) === n;
}

function linhasInvalidas(linhas) {
  return (linhas || []).filter(function (l) {
    return l && texto(l.ploomes_status) === 'PENDENTE' && !dealIdValido(l);
  }).map(function (l) {
    return { id: l.id, ploomes_status: 'ERRO', tentativas: tentativasDe(l), erro: 'deal_id inválido' };
  });
}

function selecionarPendentes(linhas, max) {
  var limite = max === undefined ? 20 : max;
  var lista = (linhas || []).filter(function (l) {
    return l && texto(l.ploomes_status) === 'PENDENTE' && tentativasDe(l) < MAX_TENTATIVAS_PLOOMES && dealIdValido(l);
  });
  lista.sort(function (a, b) {
    var x = texto(a.quando);
    var y = texto(b.quando);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return lista.slice(0, limite);
}

function respostaOk(status) {
  var n = Number(status);
  return n >= 200 && n < 300;
}

// Status HTTP numerico da resposta, ou null (item de erro de rede/timeout,
// que o node entrega com $json.error e sem statusCode).
function statusHttp(v) {
  if (v === null || v === undefined || texto(v) === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

// Decide o que fazer com a resposta do Buscar Contato: 429/5xx (ou sem
// resposta / sem status) pula o item (segue PENDENTE); qualquer outro
// nao-2xx segue sem ContactId.
function decidirContato(resposta) {
  var st = resposta ? statusHttp(resposta.statusCode) : null;
  if (st === null || st === 429 || st >= 500) return { pular: true, contactId: null };
  if (!respostaOk(st)) return { pular: false, contactId: null };
  var v = resposta.body && resposta.body.value;
  var cid = v && v[0] ? v[0].ContactId : null;
  return { pular: false, contactId: cid === undefined ? null : cid };
}

function montarRegistro(linha, contactId) {
  var reg = { DealId: numero(linha.deal_id) };
  var cid = numero(contactId);
  if (cid !== null && isFinite(cid) && cid > 0) reg.ContactId = cid;
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
  else if (resposta && resposta.erro && resposta.erro.message) m = resposta.erro.message;
  else if (resposta && typeof resposta.erro === 'string' && resposta.erro) m = resposta.erro;
  else if (!resposta || statusHttp(resposta.status) === null) m = 'Sem resposta do Ploomes';
  else m = 'HTTP ' + resposta.status;
  return texto(m).slice(0, 300);
}

// Sem status (erro de rede/timeout) conta como tentativa falha.
function resultadoEnvio(linha, resposta) {
  var status = resposta ? statusHttp(resposta.status) : null;
  if (status === 429) return { parar: true }; // so esta linha: fica PENDENTE
  var tentativas = tentativasDe(linha);
  if (status !== null && status >= 200 && status < 300) {
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
