// ===== src/api.js =====
// Regras dos dois webhooks do workflow "PCP MRBL - API". "estado" e o
// static data global do workflow: sessoes, tentativas de login e cache do
// board. Funcoes puras sobre "estado" + "agora" (ms), para testar sem n8n.

var VALIDADE_SESSAO_MS = 12 * 3600 * 1000;
var JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
var MAX_TENTATIVAS = 5;
var VALIDADE_CACHE_MS = 55 * 1000;
var VALORES_ATIVO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var DEALS_EDITAVEIS = ['607479158'];  // vazio = todos. Até o go-live, só a OS de teste.
var ACOES_F3_ATIVAS = true;  // false = recusa rapido todas as acoes de pedido/oficina (F3).
var HASH_FICTICIO = 'pbkdf2$120000$00000000000000000000000000000000$' + '0'.repeat(64);

function dealEditavel(dealId) {
  if (!DEALS_EDITAVEIS.length) return true;
  return DEALS_EDITAVEIS.indexOf(texto(dealId)) >= 0;
}

var ERRO_NAO_EDITAVEL = 'Edição liberada em breve para esta caixa.';
var ERRO_F3_DESLIGADA = 'Esta ação ainda não está disponível.';

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

// Nomes das abas FORNECEDORES e RESPONSAVEIS (opcoes do pedido): ativo vazio
// ou SIM conta como ativo; sem repetir (ignora caixa e acento), em ordem pt-BR.
function nomesAtivos(linhas) {
  var vistos = {};
  var out = [];
  (linhas || []).forEach(function (l) {
    if (!l) return;
    var ativo = semAcento(l.ativo);
    if (ativo !== '' && !VALORES_ATIVO[ativo]) return;
    var nome = texto(l.nome);
    if (nome === '' || vistos[semAcento(nome)]) return;
    vistos[semAcento(nome)] = 1;
    out.push(nome);
  });
  return out.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}

function montarRespostaBoard(estado, faltantes, ganhas, agora, extras) {
  extras = extras || {};
  var r = montarCaixas(faltantes, ganhas, new Date(agora), extras);
  var usuarios = (extras.usuarios || [])
    .filter(function (u) { return u && !!VALORES_ATIVO[semAcento(u.ativo)] && texto(u.nome) !== ''; })
    .map(function (u) { return texto(u.nome); })
    .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  var ped = montarPedidos(extras, new Date(agora).getFullYear());
  var fornecedores = nomesAtivos(extras.fornecedores);
  var responsaveis = nomesAtivos(extras.responsaveis);
  var corpo = {
    geradoEm: new Date(agora).toISOString(), caixas: r.caixas, avisos: r.avisos.concat(ped.avisos), usuarios: usuarios,
    dealsEditaveis: DEALS_EDITAVEIS.slice(), pedidos: ped.pedidos, etapasPedido: ped.etapasPedido,
    fornecedores: fornecedores, responsaveis: responsaveis
  };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}

// POST /pcp-acao, antes de ler a planilha: sessao e corpo. Falha devolve o
// mesmo { status, body } que o processarAcao daria (com ok: false para o IF);
// sucesso = { ok: true }. O processarAcao repete as checagens.
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };
  if (corpo && TIPOS_PEDIDO.indexOf(corpo.tipo) >= 0) {
    if (!ACOES_F3_ATIVAS) return { ok: false, status: 400, body: { erro: ERRO_F3_DESLIGADA } };
    if (dealsDoCorpo(corpo).some(function (d) { return !dealEditavel(d); })) {
      return { ok: false, status: 403, body: { erro: ERRO_NAO_EDITAVEL } };
    }
    var vp = validarAcaoPedido(corpo);
    if (!vp.ok) return { ok: false, status: vp.status, body: { erro: vp.erro } };
    if (vp.acao.tipo === 'salvar_etapas' && sessao.perfil !== 'ADM') return { ok: false, status: 403, body: { erro: ERRO_ETAPAS_SO_ADM } };
    return { ok: true };
  }
  if (!dealEditavel(corpo && corpo.dealId)) return { ok: false, status: 403, body: { erro: ERRO_NAO_EDITAVEL } };
  var v = validarAcao(corpo, sessao.perfil);
  if (!v.ok) return { ok: false, status: v.status, body: { erro: v.erro } };
  return { ok: true };
}

function historicoDaResposta(h) {
  return { quando: h.quando, usuario: h.usuario, texto: h.texto, ploomes: 'PENDENTE' };
}

// Saida de sucesso comum: operacoes[] e historicos[] para o workflow (F3) e
// gravacao/historico (primeira operacao / primeira linha) para os
// adaptadores da F2 enquanto o workflow novo nao entra.
function respostaDeAcao(estado, versao, operacoes, historicos, extrasBody) {
  delete estado.board;
  var body = { ok: true, versao: versao, historico: historicos.length ? historicoDaResposta(historicos[0]) : null };
  Object.keys(extrasBody || {}).forEach(function (k) { body[k] = extrasBody[k]; });
  var o = operacoes[0];
  var saida = { status: 200, body: body, operacoes: operacoes, historicos: historicos };
  saida.gravacao = o ? { aba: o.aba, chave: { coluna: o.chave, valor: o.linha[o.chave] }, campos: o.linha } : null;
  saida.historico = historicos.length ? historicos[0] : null;
  return saida;
}

function processarAcaoPedido(estado, sessao, corpo, linhas, agora, gerarId) {
  if (!ACOES_F3_ATIVAS) return { status: 400, body: { erro: ERRO_F3_DESLIGADA } };
  if (dealsDoCorpo(corpo).some(function (d) { return !dealEditavel(d); })) {
    return { status: 403, body: { erro: ERRO_NAO_EDITAVEL } };
  }
  var v = validarAcaoPedido(corpo);
  if (!v.ok) return { status: v.status, body: { erro: v.erro } };
  var r = aplicarAcaoPedido(v.acao, linhas || {}, {
    usuario: sessao.nome, email: sessao.email, perfil: sessao.perfil, agora: new Date(agora).toISOString(), gerarId: gerarId
  });
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };
  var extras = {
    historicos: r.historicos.map(function (h) {
      var x = historicoDaResposta(h);
      x.dealId = h.deal_id;
      return x;
    })
  };
  if (r.pedidoId) extras.pedidoId = r.pedidoId;
  if (r.partes) extras.partes = r.partes;
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, extras);
  // O workflow publicado grava gravacao/historico na aba errada para estes
  // tipos; sem eles nada e escrito ate o workflow novo (operacoes[]) entrar.
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

// POST /pcp-acao. "linhas" = { faltantes, caixasPcp, ganhas?, pedidos?,
// pedidosItens?, etapas? } (linhas da planilha).
// Sucesso: { status, body, operacoes: [{ aba, operacao, chave, linha }],
// historicos: [linhas do HISTORICO_APP], gravacao, historico }.
function processarAcao(estado, cabecalho, corpo, linhas, agora, gerarId) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (!sessao) return { status: 401, body: { erro: 'Sessão expirada.' } };
  if (corpo && TIPOS_PEDIDO.indexOf(corpo.tipo) >= 0) {
    return processarAcaoPedido(estado, sessao, corpo, linhas, agora, gerarId);
  }
  if (!dealEditavel(corpo && corpo.dealId)) return { status: 403, body: { erro: ERRO_NAO_EDITAVEL } };

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

  var campos = r.gravacao.campos;
  var saida = respostaDeAcao(estado, campos.atualizado_em_app || campos.atualizado_em, r.operacoes, r.historicos);
  saida.gravacao = r.gravacao;
  return saida;
}
