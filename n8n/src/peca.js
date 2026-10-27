// ===== src/peca.js =====
// F5a · Visão da peça (27/10): leitura do Ploomes na hora para o dossiê da OS
// (cards em qualquer funil, registros de interação e trocas de etapa), cache
// de 60 s e a ação "anotar_peca". Funções puras; o workflow faz as chamadas HTTP.
// Depende de util.js, previsao.js (funis) e producao.js (campos do Ploomes).

var PECA_PLOOMES = 'https://public-api2.ploomes.com/';
var PECA_URL_CARD = 'https://app10.ploomes.com/deal/';
var PECA_CACHE_MS = 60 * 1000;
var PECA_MAX_CACHE = 50;
var PECA_MAX_CARDS = 5;
var PECA_MAX_EVENTOS = 200;
var PECA_MAX_CARDS_BUSCA = 50;
var PECA_PREFIXO_APP = '[PCP · OS';
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
  var porOs = {};
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
