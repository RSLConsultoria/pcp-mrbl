// ===== src/peca.js =====
// F5a · Visão da peça (27/10): leitura do Ploomes na hora para o dossiê da OS
// (cards em qualquer funil, registros de interação e trocas de etapa), cache
// de 60 s e a ação "anotar_peca". Funções puras; o workflow faz as chamadas HTTP.
// Depende de util.js, previsao.js (funis) e producao.js (campos do Ploomes).

var PECA_PLOOMES = 'https://public-api2.ploomes.com/';
var PECA_URL_CARD = 'https://app10.ploomes.com/deal/';
var PECA_CACHE_MS = 60 * 1000;
var PECA_MAX_CACHE = 20;
var PECA_MAX_CARDS = 5;
var PECA_MAX_EVENTOS = 200;
var PECA_MAX_CARDS_BUSCA = 50;
var PECA_MAX_TEXTO_EVENTO = 500;
var PECA_ERRO_PLOOMES = 'Não foi possível ler o Ploomes agora.';
var PECA_ERRO_NADA = 'Nenhuma OS encontrada no Ploomes.';
var PECA_ERRO_BUSCA = 'Informe a OS ou a referência.';
// Caminhos da API do Ploomes (conferidos em 27/10 no card de teste 607612577):
// as etapas do funil vêm de "Deals@Stages" (não "DealsStages").
var PECA_CAMINHO_REGISTROS = 'InteractionRecords';
var PECA_CAMINHO_TROCAS = 'DealsStagesHistory';
var PECA_CAMINHO_ETAPAS = 'Deals@Stages';

function nomeFunilPeca(id) {
  var n = numeroOuNulo(id);
  if (n === FUNIL_PRODUCAO) return 'Produção';
  if (n === FUNIL_PCP) return 'PCP';
  return 'Funil ' + texto(id);
}

// OS (só dígitos) ou referência: letras, números, espaço, ponto, traço, barra e sublinhado.
function normalizarBuscaPeca(q) {
  var v = texto(q).replace(/\s+/g, ' ');
  if (!v || v.length > 60 || !/^[0-9A-Za-zÀ-ÿ ._\/-]+$/.test(v)) return { ok: false, status: 400, erro: PECA_ERRO_BUSCA };
  return { ok: true, q: v, chave: semAcento(v), numerica: /^\d+$/.test(v) };
}

function literalODataPeca(v) {
  return "'" + encodeURIComponent(texto(v).split("'").join("''")) + "'";
}

// Partes "$param=valor" unidas por &; os espaços do OData viram %20.
function urlODataPeca(caminho, partes) {
  return PECA_PLOOMES + caminho + '?' + partes.join('&').split(' ').join('%20');
}

// "(A or B)" com mais de um termo; o termo puro quando é um só.
function ouPeca(termos) {
  return termos.length > 1 ? '(' + termos.join(' or ') + ')' : termos[0];
}

function urlDealsPeca(filtro) {
  var campos = [CAMPO_OS_PRODUCAO, CAMPO_REFERENCIA, CAMPO_DESCRICAO_PECA].map(function (c) {
    return "FieldKey eq '" + c + "'";
  }).join(' or ');
  return urlODataPeca('Deals', [
    '$filter=' + filtro,
    '$expand=OtherProperties($filter=' + campos + '),Stage($select=Id,Name)',
    '$select=Id,Title,ContactName,PipelineId,StageId,StatusId,LastUpdateDate,CreateDate',
    '$orderby=LastUpdateDate desc',
    '$top=' + PECA_MAX_CARDS_BUSCA
  ]);
}

// Cards pela referência (campo de texto).
function urlReferenciaPeca(busca) {
  return urlDealsPeca("OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REFERENCIA + "' and o/StringValue eq " + literalODataPeca(busca.q) + ')');
}

// Busca numérica: cards pela OS. O campo OS é texto no Ploomes (StringValue, conferido
// em 27/10); o filtro tem um termo só, sem "or" nem IntegerValue. Se nenhum card tiver
// essa OS, o workflow faz a segunda leitura pela referência (urlReferenciaPeca).
function urlCardsPeca(busca) {
  if (!busca.numerica) return urlReferenciaPeca(busca);
  return urlDealsPeca("OtherProperties/any(o: o/FieldKey eq '" + CAMPO_OS_PRODUCAO + "' and o/StringValue eq " + literalODataPeca(busca.q) + ')');
}

function cardPecaDoDeal(deal) {
  deal = deal || {};
  var dealId = texto(deal.Id);
  return {
    dealId: dealId,
    funilId: numeroOuNulo(deal.PipelineId),
    funil: nomeFunilPeca(deal.PipelineId),
    etapaId: numeroOuNulo(deal.StageId),
    etapa: texto(deal.Stage && deal.Stage.Name),
    etapaOrdem: null,
    titulo: texto(deal.Title),
    cliente: texto(deal.ContactName),
    peca: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DESCRICAO_PECA))) || texto(deal.Title),
    referencia: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_REFERENCIA))),
    os: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_OS_PRODUCAO))),
    atualizadoEm: texto(deal.LastUpdateDate) || texto(deal.CreateDate),
    link: PECA_URL_CARD + dealId
  };
}

function respostaPloomesPecaOk(resposta) {
  var st = Number(resposta && resposta.statusCode);
  return st >= 200 && st < 300 && !!resposta.body && Array.isArray(resposta.body.value);
}

function msPeca(v) {
  var t = Date.parse(texto(v));
  return isNaN(t) ? 0 : t;
}

function ordenarCardsPeca(cards) {
  return (cards || []).slice().sort(function (a, b) { return msPeca(b.atualizadoEm) - msPeca(a.atualizadoEm); });
}

// Busca numérica: os cards com essa OS (até 5, os mais recentes). Senão, a lista de
// OS com essa referência (uma linha por OS) para a tela escolher.
function resolverCardsPeca(busca, resposta) {
  if (!respostaPloomesPecaOk(resposta)) return { ok: false, status: 502, erro: PECA_ERRO_PLOOMES };
  var cards = ordenarCardsPeca(resposta.body.value.map(cardPecaDoDeal).filter(function (c) { return !!c.dealId; }));
  var daOs = busca.numerica ? cards.filter(function (c) { return c.os === busca.q; }) : [];
  if (daOs.length) return { ok: true, os: busca.q, cards: daOs.slice(0, PECA_MAX_CARDS) };
  var porOs = Object.create(null);
  var ordem = [];
  cards.forEach(function (c) {
    if (!c.os || semAcento(c.referencia) !== busca.chave || porOs[c.os]) return;
    porOs[c.os] = c;
    ordem.push(c.os);
  });
  if (!ordem.length) return { ok: false, status: 404, erro: PECA_ERRO_NADA };
  return {
    ok: true, os: '', cards: [],
    candidatos: ordem.map(function (os) {
      var c = porOs[os];
      return { os: os, peca: c.peca, etapa: c.etapa, funil: c.funil, dealId: c.dealId };
    })
  };
}

function urlsDetalhesPeca(cards) {
  var deals = ouPeca(cards.map(function (c) { return 'DealId eq ' + Number(c.dealId); }));
  var funis = [];
  cards.forEach(function (c) {
    var f = c.funilId === null || c.funilId === undefined ? FUNIL_PRODUCAO : c.funilId;
    if (funis.indexOf(f) < 0) funis.push(f);
  });
  return {
    registros: urlODataPeca(PECA_CAMINHO_REGISTROS, ['$filter=' + deals, '$expand=Creator($select=Name)',
      '$select=Id,DealId,Date,CreateDate,Content,TypeId', '$orderby=Date desc', '$top=' + PECA_MAX_EVENTOS]),
    // CreateDate = entrada na etapa de origem; UpdateDate = hora da troca (usada no evento).
    trocas: urlODataPeca(PECA_CAMINHO_TROCAS, ['$filter=' + deals,
      '$select=Id,DealId,StageId,NewStageId,CreateDate,UpdateDate,CreatorId,Undone,Days', '$orderby=CreateDate desc', '$top=' + PECA_MAX_EVENTOS]),
    etapas: urlODataPeca(PECA_CAMINHO_ETAPAS, ['$filter=' + ouPeca(funis.map(function (f) { return 'PipelineId eq ' + f; })),
      '$select=Id,Name,Ordination,PipelineId', '$top=300'])
  };
}

// Produção > PCP > o mais recente. É o card da trilha e o padrão da anotação no front.
function cardPrincipalPeca(cards) {
  var lista = ordenarCardsPeca(cards);
  return lista.filter(function (c) { return c.funilId === FUNIL_PRODUCAO; })[0] ||
    lista.filter(function (c) { return c.funilId === FUNIL_PCP; })[0] || lista[0] || null;
}

// Etapas de Deals@Stages (Ordination é 0-based).
function etapasPorIdPeca(etapas) {
  var mapa = {};
  (etapas || []).forEach(function (e) {
    if (!e || texto(e.Id) === '') return;
    mapa[texto(e.Id)] = { id: texto(e.Id), nome: texto(e.Name), ordem: numeroOuNulo(e.Ordination), funilId: numeroOuNulo(e.PipelineId) };
  });
  return mapa;
}

var ORDEM_FONTE_PECA = { ETAPA: 0, PLOOMES: 1 };

function ordemFontePeca(fonte) {
  return ORDEM_FONTE_PECA[fonte] === undefined ? 2 : ORDEM_FONTE_PECA[fonte];
}

// Registros de interação (menos os criados pelo envio do app, que começam com
// "[PCP · OS") e trocas de etapa. Cada linha do DealsStagesHistory é a passagem por
// uma etapa: StageId = origem, NewStageId = destino, UpdateDate = hora da troca
// (CreateDate é a entrada na origem). A linha da etapa atual (NewStageId nulo) não é
// troca: fica de fora (a trilha mostra a atual). Undone = troca desfeita.
// Mais novo primeiro; empate: Etapa, Ploomes.
// Registro compilado do próprio app: a mesma regra PREFIXO_PCP do envio (envioPloomes.js),
// tolerando espaços, &nbsp; e tags HTML antes do prefixo (o Ploomes pode guardar em HTML).
function registroDoAppPeca(conteudo) {
  var limpo = texto(conteudo).replace(/&middot;|&#183;/gi, '·').replace(/^(?:\s|&nbsp;|<[^>]*>)+/i, '');
  return PREFIXO_PCP.test(limpo);
}

function eventosPloomesPeca(registros, trocas, etapas, cards) {
  var porId = etapasPorIdPeca(etapas);
  var funilDoDeal = {};
  (cards || []).forEach(function (c) { funilDoDeal[texto(c.dealId)] = c.funil; });
  var nomeEtapa = function (id) { return porId[texto(id)] ? porId[texto(id)].nome : 'Etapa ' + texto(id); };
  var eventos = [];
  (registros || []).forEach(function (r) {
    var conteudo = texto(r && r.Content);
    if (!conteudo || registroDoAppPeca(conteudo)) return;
    eventos.push({
      quando: texto(r.Date) || texto(r.CreateDate), fonte: 'PLOOMES', texto: conteudo.slice(0, PECA_MAX_TEXTO_EVENTO),
      autor: texto(r.Creator && r.Creator.Name), dealId: texto(r.DealId)
    });
  });
  (trocas || []).forEach(function (t) {
    if (!t || texto(t.NewStageId) === '') return;
    var funil = funilDoDeal[texto(t.DealId)];
    var e = {
      quando: texto(t.UpdateDate) || texto(t.CreateDate), fonte: 'ETAPA',
      texto: (funil ? funil + ': ' : '') + nomeEtapa(t.StageId) + ' → ' + nomeEtapa(t.NewStageId),
      autor: '', dealId: texto(t.DealId)
    };
    if (t.Undone === true) e.desfeita = true;
    eventos.push(e);
  });
  return eventos.sort(function (a, b) {
    return (msPeca(b.quando) - msPeca(a.quando)) || (ordemFontePeca(a.fonte) - ordemFontePeca(b.fonte));
  }).slice(0, PECA_MAX_EVENTOS);
}

function trilhaPeca(cards, etapas) {
  var p = cardPrincipalPeca(cards);
  if (!p) return null;
  var porId = etapasPorIdPeca(etapas);
  var lista = Object.keys(porId).map(function (k) { return porId[k]; }).filter(function (e) {
    return e.funilId === p.funilId;
  }).sort(function (a, b) {
    return (a.ordem === null ? 9999 : a.ordem) - (b.ordem === null ? 9999 : b.ordem);
  }).map(function (e) { return { id: e.id, nome: e.nome, ordem: e.ordem }; });
  return { funil: p.funil, dealId: p.dealId, etapas: lista, atualId: p.etapaId === null ? '' : String(p.etapaId) };
}

function pecaDoCache(estado, chave, agora) {
  var c = estado && estado.pecas ? estado.pecas[chave] : null;
  return c && agora - c.guardadoEm < PECA_CACHE_MS ? c.corpo : null;
}

// Só respostas 200 entram (erro do Ploomes e 404 não). No máximo 20 buscas.
function guardarPecaNoCache(estado, chave, corpo, agora) {
  if (!estado.pecas) estado.pecas = Object.create(null);
  Object.keys(estado.pecas).forEach(function (k) {
    if (agora - estado.pecas[k].guardadoEm >= PECA_CACHE_MS) delete estado.pecas[k];
  });
  var chaves = Object.keys(estado.pecas).sort(function (a, b) { return estado.pecas[a].guardadoEm - estado.pecas[b].guardadoEm; });
  while (chaves.length >= PECA_MAX_CACHE) delete estado.pecas[chaves.shift()];
  estado.pecas[chave] = { corpo: corpo, guardadoEm: agora };
}

// GET /pcp-peca?q=: sessão como o board; busca do cache (60 s) ou a URL dos cards.
function validarPedidoPeca(estado, cabecalho, query, agora) {
  if (!sessaoDoCabecalho(estado, cabecalho, agora)) return { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } };
  var busca = normalizarBuscaPeca(query && query.q);
  if (!busca.ok) return { pronto: true, status: 400, body: { erro: busca.erro } };
  var cache = pecaDoCache(estado, busca.chave, agora);
  if (cache) return { pronto: true, status: 200, body: cache };
  return { pronto: false, busca: busca, url: urlCardsPeca(busca) };
}

// Lista de OS (escolha na tela): pronta e no cache.
function respostaCandidatosPeca(busca, candidatos, agora, estado) {
  var corpo = { geradoEm: new Date(agora).toISOString(), os: '', candidatos: candidatos, cards: [], trilha: null, eventos: [] };
  guardarPecaNoCache(estado, busca.chave, corpo, agora);
  return { pronto: true, status: 200, body: corpo };
}

// Depois do "Buscar Cards da Peça". Saídas:
// - pronta (lista de OS, 404 ou 502);
// - { pronto: false, buscarReferencia: true, url }: número sem card com essa OS; o
//   workflow lê de novo pela referência e fecha em prepararReferenciaPeca;
// - { pronto: false, buscarReferencia: false, os, cards, urls }: segue para os detalhes.
function prepararLeiturasPeca(busca, respostaCards, agora, estado) {
  var r = resolverCardsPeca(busca, respostaCards);
  if (!r.ok && r.status === 404 && busca.numerica) {
    return { pronto: false, buscarReferencia: true, busca: busca, url: urlReferenciaPeca(busca) };
  }
  if (!r.ok) return { pronto: true, status: r.status, body: { erro: r.erro } };
  if (r.candidatos) return respostaCandidatosPeca(busca, r.candidatos, agora, estado);
  return { pronto: false, buscarReferencia: false, busca: busca, os: r.os, cards: r.cards, urls: urlsDetalhesPeca(r.cards) };
}

// Segunda leitura (número que não é OS): sempre fecha a resposta.
function prepararReferenciaPeca(busca, resposta, agora, estado) {
  var r = resolverCardsPeca({ ok: true, q: busca.q, chave: busca.chave, numerica: false }, resposta);
  if (!r.ok) return { pronto: true, status: r.status, body: { erro: r.erro } };
  return respostaCandidatosPeca(busca, r.candidatos, agora, estado);
}

function finalizarPeca(leituras, respostas, agora, estado) {
  respostas = respostas || {};
  if (!respostaPloomesPecaOk(respostas.registros) || !respostaPloomesPecaOk(respostas.trocas) || !respostaPloomesPecaOk(respostas.etapas)) {
    return { status: 502, body: { erro: PECA_ERRO_PLOOMES } };
  }
  var etapas = respostas.etapas.body.value;
  var porId = etapasPorIdPeca(etapas);
  var cards = (leituras.cards || []).map(function (c) {
    var e = porId[texto(c.etapaId)];
    var x = Object.assign({}, c);
    x.etapaOrdem = e ? e.ordem : null;
    if (!x.etapa && e) x.etapa = e.nome;
    return x;
  });
  var corpo = {
    geradoEm: new Date(agora).toISOString(), os: leituras.os, cards: cards, trilha: trilhaPeca(cards, etapas),
    eventos: eventosPloomesPeca(respostas.registros.body.value, respostas.trocas.body.value, etapas, cards)
  };
  guardarPecaNoCache(estado, leituras.busca.chave, corpo, agora);
  return { status: 200, body: corpo };
}

// ---------- anotação (única escrita da Visão da peça) ----------
var TIPO_ANOTAR_PECA = 'anotar_peca';
var ACAO_ANOTACAO = 'ANOTACAO';
var PECA_MAX_ANOTACOES_POR_OS = 30;
var PECA_MAX_ANOTACOES_BOARD = 2000;
var ERRO_CARD_OUTRA_OS = 'Este card não é desta OS.';

// Texto obrigatório, até 500 caracteres, sem linha em branco; quebras simples viram espaço.
function validarAnotacaoPeca(corpo) {
  corpo = corpo || {};
  // A OS aceita os mesmos caracteres da busca (normalizarBuscaPeca), inclusive espaço.
  var buscaOs = normalizarBuscaPeca(corpo.os);
  if (!buscaOs.ok) return erroAcao(400, 'Informe a OS.');
  var os = buscaOs.q;
  var dealId = texto(corpo.dealId);
  if (!/^\d{1,20}$/.test(dealId)) return erroAcao(400, 'Informe o card do Ploomes.');
  if (typeof corpo.texto !== 'string') return erroAcao(400, 'Escreva a anotação.');
  var bruto = corpo.texto.replace(/\r\n?/g, '\n').trim();
  if (/\n[ \t]*\n/.test(bruto)) return erroAcao(400, 'A anotação não pode ter linha em branco.');
  var t = bruto.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');
  if (!t) return erroAcao(400, 'Escreva a anotação.');
  if (t.length > 500) return erroAcao(400, 'Anotação com no máximo 500 caracteres.');
  return { ok: true, acao: { os: os, dealId: dealId, texto: t } };
}

function osIgualPeca(a, b) {
  return texto(a).replace(/\s+/g, ' ') === texto(b).replace(/\s+/g, ' ');
}

// O card da anotação tem de ser desta OS: aparece com ela no board em cache (caixas ou
// produção) ou numa resposta do pcp-peca em cache. A validade do cache não conta aqui:
// a ligação card–OS não muda em minutos, e o site sempre abre a peça (o que guarda a
// resposta) antes de anotar; o board é refeito a cada leitura do site (60 s).
function dealDaOsPeca(estado, os, dealId) {
  estado = estado || {};
  var bate = function (x) { return !!x && texto(x.dealId) === texto(dealId) && osIgualPeca(x.os, os); };
  var b = estado.board && estado.board.corpo;
  if (b && ((b.caixas || []).some(bate) || (b.producao || []).some(bate))) return true;
  var pecas = estado.pecas || {};
  return Object.keys(pecas).some(function (k) {
    var c = pecas[k] && pecas[k].corpo;
    return !!c && (c.cards || []).some(bate);
  });
}

// Uma linha no HISTORICO_APP; o Enviar ao Ploomes junta no registro compilado do deal.
function processarAnotacaoPeca(acao, ctx) {
  var h = historicoProducao(ctx, acao.dealId, acao.os, ACAO_ANOTACAO, ctx.usuario + ' anotou: "' + acao.texto + '"');
  return { ok: true, versao: ctx.agora, operacoes: [], historicos: [h], anotacaoId: h.id };
}

// Anotações de qualquer card (o deal da anotação pode não ser caixa nem produção):
// o front cruza pela OS. Mais novas primeiro: até 30 por OS (uma OS com muitas anotações
// não esconde as das outras) e no máximo 2000 no total.
function anotacoesDoBoard(historico) {
  var porOs = Object.create(null);
  return (historico || []).filter(function (h) {
    return h && semAcento(h.acao) === ACAO_ANOTACAO && texto(h.os) !== '';
  }).sort(function (a, b) {
    var x = texto(a.quando);
    var y = texto(b.quando);
    return x < y ? 1 : x > y ? -1 : 0;
  }).filter(function (h) {
    var os = texto(h.os);
    porOs[os] = (porOs[os] || 0) + 1;
    return porOs[os] <= PECA_MAX_ANOTACOES_POR_OS;
  }).slice(0, PECA_MAX_ANOTACOES_BOARD).map(function (h) {
    return {
      id: texto(h.id), quando: texto(h.quando), usuario: texto(h.usuario), texto: texto(h.texto),
      ploomes: texto(h.ploomes_status).toUpperCase() || 'PENDENTE', dealId: texto(h.deal_id), os: texto(h.os)
    };
  });
}
