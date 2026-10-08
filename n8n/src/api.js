// ===== src/api.js =====
// Regras dos dois webhooks do workflow "PCP MRBL - API". "estado" e o
// static data global do workflow: sessoes, tentativas de login e cache do
// board. Funcoes puras sobre "estado" + "agora" (ms), para testar sem n8n.

var VALIDADE_SESSAO_MS = 12 * 3600 * 1000;
var JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
var MAX_TENTATIVAS = 5;
var VALIDADE_CACHE_MS = 30 * 1000;
var VALORES_ATIVO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var HASH_FICTICIO = 'pbkdf2$120000$00000000000000000000000000000000$' + '0'.repeat(64);

function proprio(obj, chave) {
  return Object.prototype.hasOwnProperty.call(obj, chave) ? obj[chave] : undefined;
}

function prepararEstado(estado, agora) {
  if (!estado.sessoes) estado.sessoes = Object.create(null);
  if (!estado.tentativas) estado.tentativas = Object.create(null);
  Object.keys(estado.sessoes).forEach(function (t) {
    if (estado.sessoes[t].expira <= agora) delete estado.sessoes[t];
  });
  Object.keys(estado.tentativas).forEach(function (e) {
    var vals = estado.tentativas[e];
    if (Array.isArray(vals)) {
      var ainda = vals.filter(function (ts) { return agora - ts < JANELA_TENTATIVAS_MS; });
      if (ainda.length) estado.tentativas[e] = ainda;
      else delete estado.tentativas[e];
    }
  });
}

function processarLogin(cripto, estado, corpo, usuarios, agora) {
  prepararEstado(estado, agora);
  var email = texto(corpo && corpo.email).toLowerCase();
  var senha = corpo && typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!email || !senha) return { status: 400, body: { erro: 'Informe e-mail e senha.' } };

  var falhas = proprio(estado.tentativas, email) || [];
  if (falhas.length >= MAX_TENTATIVAS) {
    return { status: 429, body: { erro: 'Muitas tentativas. Tente de novo em 15 minutos.' } };
  }

  var u = (usuarios || []).filter(function (x) { return x && texto(x.email).toLowerCase() === email; })[0];
  var ativo = !!u && !!VALORES_ATIVO[semAcento(u.ativo)];
  var ok = conferirSenha(cripto, senha, u && ativo ? u.senha_hash : HASH_FICTICIO);
  if (!ativo || !ok) {
    if (Array.isArray(falhas)) {
      estado.tentativas[email] = falhas.concat([agora]);
    } else {
      estado.tentativas[email] = [agora];
    }
    return { status: 401, body: { erro: 'E-mail ou senha incorretos.' } };
  }

  delete estado.tentativas[email];
  var token = gerarToken(cripto);
  var expira = agora + VALIDADE_SESSAO_MS;
  var perfil = texto(u.perfil).toUpperCase();
  estado.sessoes[token] = { email: email, nome: texto(u.nome), perfil: perfil, expira: expira };
  return {
    status: 200,
    body: { token: token, nome: texto(u.nome), perfil: perfil, expiraEm: new Date(expira).toISOString() }
  };
}

function sessaoDoCabecalho(estado, cabecalho, agora) {
  prepararEstado(estado, agora);
  var m = texto(cabecalho).match(/^Bearer\s+([0-9a-fA-F]{64})$/);
  if (!m) return null;
  return proprio(estado.sessoes, m[1].toLowerCase()) || null;
}

function validarPedidoBoard(estado, cabecalho, agora) {
  if (!sessaoDoCabecalho(estado, cabecalho, agora)) {
    return { status: 401, body: { erro: 'Sessão expirada.' } };
  }
  var c = estado.board;
  if (c && c.corpo && agora - c.guardadoEm < VALIDADE_CACHE_MS) return { status: 200, body: c.corpo };
  return { ler: true };
}

function montarRespostaBoard(estado, faltantes, ganhas, agora, extras) {
  extras = extras || {};
  var r = montarCaixas(faltantes, ganhas, new Date(agora), extras);
  var usuarios = (extras.usuarios || [])
    .filter(function (u) { return u && !!VALORES_ATIVO[semAcento(u.ativo)] && texto(u.nome) !== ''; })
    .map(function (u) { return texto(u.nome); })
    .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  var corpo = { geradoEm: new Date(agora).toISOString(), caixas: r.caixas, avisos: r.avisos, usuarios: usuarios };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}

// POST /pcp-acao, antes de ler a planilha: sessao e corpo. Falha devolve o
// mesmo { status, body } que o processarAcao daria (com ok: false para o IF);
// sucesso = { ok: true }. O processarAcao repete as checagens.
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };
  var v = validarAcao(corpo, sessao.perfil);
  if (!v.ok) return { ok: false, status: v.status, body: { erro: v.erro } };
  return { ok: true };
}

// POST /pcp-acao. "linhas" = { faltantes, caixasPcp, ganhas? } (linhas da planilha).
// Em sucesso devolve tambem "gravacao" e "historico" para os nodes de
// escrita do workflow; o corpo da resposta ao front fica em "body".
function processarAcao(estado, cabecalho, corpo, linhas, agora, gerarId) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (!sessao) return { status: 401, body: { erro: 'Sessão expirada.' } };

  var v = validarAcao(corpo, sessao.perfil);
  if (!v.ok) return { status: v.status, body: { erro: v.erro } };
  var acao = v.acao;
  linhas = linhas || {};
  var faltantes = (linhas.faltantes || []).filter(function (l) { return l && texto(l.deal_id) === acao.dealId; });
  var cpRow = (linhas.caixasPcp || []).filter(function (c) { return c && texto(c.deal_id) === acao.dealId; })[0] || null;

  var ehItem = TIPOS_ITEM.indexOf(acao.tipo) >= 0;
  if (!ehItem && !faltantes.length) {
    var naGanhas = (linhas.ganhas || []).some(function (x) { return x && texto(x.deal_id) === acao.dealId; });
    if (!naGanhas) return { status: 404, body: { erro: 'Caixa não encontrada.' } };
  }
  var alvo = cpRow;
  var linhaItem = null;
  if (ehItem) {
    linhaItem = faltantes.filter(function (l) { return texto(l.id) === acao.itemId; })[0] || null;
    if (!linhaItem) return { status: 404, body: { erro: 'Item não encontrado.' } };
    alvo = linhaItem;
  }

  var os = faltantes.length ? texto(faltantes[0].os) : '';
  if (!os && cpRow) os = texto(cpRow.os);
  if (!os) {
    var g = (linhas.ganhas || []).filter(function (x) { return x && texto(x.deal_id) === acao.dealId; })[0];
    if (g) os = texto(g.os);
  }

  var responsavelAtual = '';
  faltantes.forEach(function (l) { if (!responsavelAtual) responsavelAtual = texto(l.responsavel); });

  var r = aplicarAcao(acao, alvo, {
    responsavelAtual: responsavelAtual,
    usuario: sessao.nome,
    email: sessao.email,
    agora: new Date(agora).toISOString(),
    os: os,
    nomeItem: linhaItem ? texto(linhaItem.descricao_item) : '',
    un: linhaItem ? texto(linhaItem.unidade) : '',
    gerarId: gerarId
  });
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };

  delete estado.board;
  var campos = r.gravacao.campos;
  return {
    status: 200,
    body: {
      ok: true,
      versao: campos.atualizado_em_app || campos.atualizado_em,
      historico: { quando: r.historico.quando, usuario: r.historico.usuario, texto: r.historico.texto, ploomes: 'PENDENTE' }
    },
    gravacao: r.gravacao,
    historico: r.historico
  };
}
