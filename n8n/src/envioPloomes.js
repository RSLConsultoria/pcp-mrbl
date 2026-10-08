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

function ordemQuando(a, b) {
  var x = texto(a.quando);
  var y = texto(b.quando);
  return x < y ? -1 : x > y ? 1 : 0;
}

function msQuando(linha) {
  var t = Date.parse(texto(linha && linha.quando));
  return isNaN(t) ? null : t;
}

// Registro compilado: as linhas PENDENTE (deal valido, tentativas < max) por
// deal. O grupo so sai quando a linha mais nova tem esperaMs (10 min) ou mais,
// para juntar a rajada de acoes num registro so. Ate maxLinhas (30) por grupo,
// as mais antigas (o resto vai na proxima rodada); ate maxGrupos (20) por
// rodada, o grupo com a linha mais antiga primeiro. Saida:
// [{ deal_id, os, linhas: [...] }].
function selecionarGrupos(linhas, agora, opcoes) {
  var o = opcoes || {};
  var espera = o.esperaMs === undefined ? 10 * 60 * 1000 : o.esperaMs;
  var maxLinhas = o.maxLinhas === undefined ? 30 : o.maxLinhas;
  var maxGrupos = o.maxGrupos === undefined ? 20 : o.maxGrupos;
  var porDeal = {};
  var ordem = [];
  (linhas || []).forEach(function (l) {
    if (!l || texto(l.ploomes_status) !== 'PENDENTE' || tentativasDe(l) >= MAX_TENTATIVAS_PLOOMES || !dealIdValido(l)) return;
    var d = String(numero(l.deal_id));
    if (!porDeal[d]) {
      porDeal[d] = [];
      ordem.push(d);
    }
    porDeal[d].push(l);
  });
  var grupos = [];
  ordem.forEach(function (d) {
    var ls = porDeal[d].slice().sort(ordemQuando);
    var maisNova = null;
    ls.forEach(function (l) {
      var t = msQuando(l);
      if (t !== null && (maisNova === null || t > maisNova)) maisNova = t;
    });
    if (maisNova !== null && agora - maisNova < espera) return;
    var os = '';
    ls.forEach(function (l) { if (!os) os = texto(l.os); });
    grupos.push({ deal_id: d, os: os, linhas: ls.slice(0, maxLinhas) });
  });
  grupos.sort(function (a, b) { return ordemQuando(a.linhas[0], b.linhas[0]); });
  return grupos.slice(0, maxGrupos);
}

// 'HH:mm' em America/Sao_Paulo ('' se quando nao for data).
function horaSaoPaulo(quando) {
  var t = Date.parse(texto(quando));
  if (isNaN(t)) return '';
  try {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return f.format(new Date(t));
  } catch (e) {
    var d = new Date(t - 3 * 3600 * 1000);  // sem fuso no runtime: UTC-3 (sem horario de verao desde 2019)
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }
}

var PREFIXO_PCP = /^\s*\[PCP · OS [^\]]*\]\s*/;

function montarRegistroCompilado(grupo, contactId) {
  var linhas = grupo.linhas || [];
  var reg = { DealId: numero(grupo.deal_id) };
  var cid = numero(contactId);
  if (cid !== null && isFinite(cid) && cid > 0) reg.ContactId = cid;
  var itens = linhas.map(function (l) {
    var h = horaSaoPaulo(l.quando);
    return '• ' + (h ? h + ' ' : '') + texto(l.texto).replace(PREFIXO_PCP, '');
  });
  reg.Content = '[PCP · OS ' + texto(grupo.os) + '] Atualizações do app PCP\n' + itens.join('\n');
  var data = linhas.length ? linhas[linhas.length - 1].quando : '';
  var maisNova = null;
  linhas.forEach(function (l) {
    var t = msQuando(l);
    if (t !== null && (maisNova === null || t >= maisNova)) { maisNova = t; data = l.quando; }
  });
  reg.Date = data;
  return reg;
}

// Mesmo resultado para todas as linhas do grupo (cada uma com suas
// tentativas). 429 = nenhuma linha gravada (seguem PENDENTE).
function resultadoGrupo(grupo, resposta) {
  var saida = [];
  var linhas = grupo.linhas || [];
  for (var i = 0; i < linhas.length; i++) {
    var r = resultadoEnvio(linhas[i], resposta);
    if (r.parar) return [];
    saida.push(r);
  }
  return saida;
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
