// ===== src/previsao.js =====
// Motor de previsão das etapas 12 a 19, fiel ao modelo Power BI do dono
// (spec 2026-10-19-visao-futuro-carga-design.md, seção 3). Funções puras, ES5,
// sem import/export. Datas são 'aaaa-mm-dd' no fuso de São Paulo; o cálculo
// carrega frações de dia e a data exibida corta a fração para baixo.

var MARCADOR_HISTORICO_PREVISAO = 60151285;
var FUNIL_PCP = 60011710;
var FUNIL_PRODUCAO = 60015827;
var ETAPA_ENCAIXE = 12;
var ETAPA_PRIMEIRA_PECA = 16;
var ETAPA_COSTURA = 17;
var ETAPA_ULTIMA_PREVISTA = 16;  // a previsão mostra OS de 12 (Encaixe) a 16 (Primeira Peça)
var ETAPAS_FILA_PREVISAO = [14, 15, 17, 18, 19];
var ETAPAS_MARCO_PREVISAO = { 14: 1, 19: 1 };
var JANELA_HISTORICO_DIAS = 180;
var LIMITE_DIAS_PREVISAO = 180;
var MINIMO_CARDS_FILA_FAIXA = 5;
var FAIXAS_VOLUME = [
  { ate: 50, nome: '01. Pequeno' },
  { ate: 150, nome: '02. Médio' },
  { ate: 300, nome: '03. Grande' },
  { ate: 450, nome: '04. Industrial' }
];
var FAIXA_MAIOR = '05. Industrial+';

// ---------- datas (dia = número de dias desde 1970-01-01, pode ter fração) ----------

function diaNumero(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(iso));
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

// Corta a fração para baixo, como o Gantt do BI.
function isoDoDia(n) {
  if (n === null || n === undefined || !isFinite(n)) return '';
  return new Date(Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

// São Paulo não tem horário de verão desde 2019: UTC−3 fixo.
function hojeSaoPaulo(agoraMs) {
  return new Date(agoraMs - 3 * 3600000).toISOString().slice(0, 10);
}

// Data de campo do Ploomes ('2026-10-25T03:00:00Z', '2026-10-25T00:00:00-03:00',
// '25/10/2026' ou '2026-10-25') -> 'aaaa-mm-dd' em São Paulo; '' se não reconhece.
function dataSaoPaulo(v) {
  var t = texto(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    var ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : t + 'Z');
    return isFinite(ms) ? hojeSaoPaulo(ms) : '';
  }
  var d = dataISO(t, 0);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d.indexOf('0-') !== 0 ? d : '';
}

// ---------- estatística ----------

function numerosValidos(valores) {
  return (valores || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
}

// PERCENTILE.INC do Excel/DAX: interpolação linear entre as posições (n−1)·p.
function percentilInc(valores, p) {
  var v = numerosValidos(valores).slice().sort(function (a, b) { return a - b; });
  if (!v.length) return null;
  var h = (v.length - 1) * p;
  var baixo = Math.floor(h);
  var alto = Math.min(baixo + 1, v.length - 1);
  return v[baixo] + (h - baixo) * (v[alto] - v[baixo]);
}

// Remove o que fica fora de Q1 − 1,5·IQR … Q3 + 1,5·IQR (limites inclusos).
function filtrarIqr(valores) {
  var v = numerosValidos(valores);
  if (!v.length) return [];
  var q1 = percentilInc(v, 0.25);
  var q3 = percentilInc(v, 0.75);
  var iqr = q3 - q1;
  var min = q1 - 1.5 * iqr;
  var max = q3 + 1.5 * iqr;
  return v.filter(function (x) { return x >= min && x <= max; });
}

function mediaSimples(valores) {
  var v = numerosValidos(valores);
  if (!v.length) return null;
  return v.reduce(function (s, x) { return s + x; }, 0) / v.length;
}

function mediana(valores) {
  return percentilInc(valores, 0.5);
}

function arredondar4(n) {
  return Math.round(n * 10000) / 10000;
}

// ---------- faixa, etapa e campos ----------

// Peças do corte real; se em branco, do pedido; senão 0.
function pecasPrevisao(pecasCorte, pecasPedido) {
  var corte = numero(pecasCorte);
  if (corte !== null && !isNaN(corte)) return corte;
  var pedido = numero(pecasPedido);
  if (pedido !== null && !isNaN(pedido)) return pedido;
  return 0;
}

function faixaVolume(pecas) {
  var n = Number(pecas) || 0;
  for (var i = 0; i < FAIXAS_VOLUME.length; i++) {
    if (n <= FAIXAS_VOLUME[i].ate) return FAIXAS_VOLUME[i].nome;
  }
  return FAIXA_MAIOR;
}

// "12. Encaixe" -> 12; sem número antes do "." -> null.
function numeroEtapa(nome) {
  var m = /^\s*(\d{1,2})\s*\./.exec(texto(nome));
  return m ? Number(m[1]) : null;
}
// ---------- projeção (sync da produção) ----------

// Linhas da aba -> { 'TIPO|etapa|faixa|oficina': valor }; valor vazio fica de fora.
function tabelaMedias(linhas) {
  var t = {};
  (linhas || []).forEach(function (l) {
    var v = numero(l && l.valor);
    if (v === null || isNaN(v)) return;
    t[semAcento(l.tipo) + '|' + texto(l.etapa) + '|' + texto(l.faixa) + '|' + texto(l.oficina_id)] = { valor: v, amostra: Number(numero(l.amostra)) || 0 };
  });
  return t;
}

function valorMedia(t, tipo, etapa, faixa, oficinaId) {
  var x = t && t[tipo + '|' + etapa + '|' + (faixa || '') + '|' + (oficinaId || '')];
  return x ? x : null;
}

function temMedias(t) {
  return !!t && Object.keys(t).length > 0;
}

function duracaoEtapaPrevisao(t, etapa, faixa) {
  if (ETAPAS_MARCO_PREVISAO[etapa]) return 1;
  var x = etapa <= ETAPA_ENCAIXE ? valorMedia(t, 'DURACAO_PCP', etapa) : valorMedia(t, 'DURACAO', etapa, faixa);
  if (x) return x.valor;
  x = valorMedia(t, 'DURACAO_GERAL', etapa);
  return x ? x.valor : 1;
}

function filaEtapaPrevisao(t, etapa, faixa) {
  if (ETAPAS_FILA_PREVISAO.indexOf(etapa) < 0) return 0;
  var x = valorMedia(t, 'FILA', etapa, faixa);
  if (x && x.amostra >= MINIMO_CARDS_FILA_FAIXA) return x.valor;
  x = valorMedia(t, 'FILA_GERAL', etapa);
  return x ? x.valor : 0;
}

// os = { etapa, dtInicio, chegada, pecas, oficinaId }. Devolve
// { inicioCostura, fimCostura } ('aaaa-mm-dd', fração cortada) ou null
// (etapa fora de 12–16 ou OS sem peças, que não recebe previsão a partir da 14).
function projetarOs(os, t, hojeISO) {
  os = os || {};
  var s = Number(os.etapa);
  if (!(s >= ETAPA_ENCAIXE && s <= ETAPA_ULTIMA_PREVISTA)) return null;
  if (!(Number(os.pecas) > 0)) return null;
  var faixa = faixaVolume(os.pecas);
  var hoje = diaNumero(hojeISO);
  var dtInicio = diaNumero(os.dtInicio);
  var chegada = diaNumero(os.chegada);
  var inicioEfetivo = dtInicio !== null ? dtInicio : Math.max(chegada !== null ? chegada : hoje, hoje) + filaEtapaPrevisao(t, s, faixa);
  var fimBase = Math.max(inicioEfetivo + duracaoEtapaPrevisao(t, s, faixa), hoje);
  var meio = 0;
  for (var o = s + 1; o < ETAPA_COSTURA; o++) {
    if (o === ETAPA_PRIMEIRA_PECA) continue;
    meio += duracaoEtapaPrevisao(t, o, faixa) + filaEtapaPrevisao(t, o, faixa);
  }
  var inicio = fimBase + meio + filaEtapaPrevisao(t, ETAPA_COSTURA, faixa);
  var oficina = texto(os.oficinaId);
  var porOficina = oficina && semAcento(oficina) !== 'ALOCAR' ? valorMedia(t, 'COSTURA_OFICINA', ETAPA_COSTURA, faixa, oficina) : null;
  var fim = inicio + (porOficina ? porOficina.valor : duracaoEtapaPrevisao(t, ETAPA_COSTURA, faixa));
  return { inicioCostura: isoDoDia(inicio), fimCostura: isoDoDia(fim) };
}

// ---------- registros do Ploomes e médias (workflow diário) ----------

// FieldKeys ainda não conferidas numa leitura real (spec, seção 8). Enquanto
// começarem por CONFIGURAR_, o campo é lido como vazio: a previsão cai no
// fallback do BI e o workflow de médias não grava nada. Trocar pela chave real
// (não é segredo) na homologação, rodar npm test && npm run build e commitar.
var CAMPO_PECAS_PEDIDO = 'CONFIGURAR_CAMPO_PECAS_PEDIDO';
var CAMPO_PCP_COMPLETO = 'CONFIGURAR_CAMPO_PCP_COMPLETO';
var CAMPO_REGISTRO_INICIO = 'CONFIGURAR_CAMPO_REGISTRO_INICIO';
var CAMPO_REGISTRO_TERMINO = 'CONFIGURAR_CAMPO_REGISTRO_TERMINO';
var CAMPOS_ENTRADA_ETAPA = {
  12: 'CONFIGURAR_CAMPO_ENTRADA_12',
  13: 'CONFIGURAR_CAMPO_ENTRADA_13',
  14: 'CONFIGURAR_CAMPO_ENTRADA_14',
  15: 'CONFIGURAR_CAMPO_ENTRADA_15',
  16: 'CONFIGURAR_CAMPO_ENTRADA_16'
};

function campoConfigurado(chave) {
  return texto(chave) !== '' && texto(chave).indexOf('CONFIGURAR_') !== 0;
}


// Número da etapa no texto do registro de interação. O formato real ainda será
// confirmado numa leitura na homologação (spec, seção 8): por isso o parser é
// tolerante e isolado. Aceita "Etapa: 17", "Estágio 17", "17. Costura" e
// "Etapa 17. Costura" (com ou sem HTML); devolve null quando não acha 1–30.
function etapaDoTextoRegistro(conteudo) {
  var t = texto(conteudo).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  var m = /(?:etapa|est[aá]gio)\s*:?\s*(\d{1,2})(?!\d)/i.exec(t);
  if (!m) m = /(?:^|[^\d])(\d{1,2})\s*\.\s*[A-Za-zÀ-ÿ]/.exec(t);
  if (!m) return null;
  var n = Number(m[1]);
  return n >= 1 && n <= 30 ? n : null;
}

// Sim/não do Ploomes: campo booleano (BoolValue) ou texto "Sim".
function simNaoPloomes(prop) {
  if (!prop) return false;
  if (prop.BoolValue === true) return true;
  var v = semAcento(valorPropriedadePloomes(prop));
  return v === 'SIM' || v === 'S' || v === 'TRUE' || v === '1';
}

function valorCampoDeal(deal, chave) {
  if (!campoConfigurado(chave)) return '';
  return valorPropriedadePloomes(propriedadeDoDeal(deal, chave));
}

// Registro de interação marcado -> { dealId, etapa, inicio, termino }.
function normalizarRegistroPrevisao(reg) {
  reg = reg || {};
  return {
    dealId: texto(reg.DealId),
    etapa: etapaDoTextoRegistro(reg.Content),
    inicio: dataSaoPaulo(valorCampoDeal(reg, CAMPO_REGISTRO_INICIO)),
    termino: dataSaoPaulo(valorCampoDeal(reg, CAMPO_REGISTRO_TERMINO))
  };
}

// Negócio -> { dealId, pecas, oficinaId, pcpCompleto } para as médias.
function normalizarDealPrevisao(deal) {
  deal = deal || {};
  var oficina = propriedadeDoDeal(deal, CAMPO_OFICINA_PLOOMES);
  var nomeOficina = semAcento(oficina && (oficina.UserValueName || oficina.ObjectValueName));
  return {
    dealId: texto(deal.Id),
    pecas: pecasPrevisao(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_PECAS_CORTE)), valorCampoDeal(deal, CAMPO_PECAS_PEDIDO)),
    oficinaId: nomeOficina === 'ALOCAR' ? '' : idObjetoPloomes(oficina),
    pcpCompleto: campoConfigurado(CAMPO_PCP_COMPLETO) && simNaoPloomes(propriedadeDoDeal(deal, CAMPO_PCP_COMPLETO))
  };
}

// ---------- médias (workflow diário) ----------

function juntarEm(mapa, chave, valor) {
  if (!mapa[chave]) mapa[chave] = [];
  mapa[chave].push(valor);
}

// registros: [{ dealId, etapa, inicio, termino }]; deals: { dealId: { pecas, oficinaId, pcpCompleto } }.
// Devolve as linhas da PREVISAO_MEDIAS (sem calculado_em/chave), em ordem fixa.
function calcularMediasPrevisao(registros, deals, hojeISO) {
  var hoje = diaNumero(hojeISO);
  var inicioJanela = hoje - JANELA_HISTORICO_DIAS;
  deals = deals || {};
  var validos = (registros || []).filter(function (r) {
    return r && texto(r.dealId) && typeof r.etapa === 'number' && diaNumero(r.inicio) !== null;
  });
  var passouProducao = {};
  var porDeal = {};
  validos.forEach(function (r) {
    if (r.etapa >= 14 && r.etapa <= 18) passouProducao[r.dealId] = 1;
    juntarEm(porDeal, r.dealId, r);
  });
  var dur = {};
  var durGeral = {};
  var durPcp = {};
  var costura = {};
  validos.forEach(function (r) {
    if (diaNumero(r.termino) === null) return;
    var d = Math.max(0, diaNumero(r.termino) - diaNumero(r.inicio));
    var deal = deals[r.dealId] || null;
    var faixa = deal ? faixaVolume(deal.pecas) : '';
    // Média de Costura por oficina: sem janela e sem IQR, como no BI.
    if (r.etapa === ETAPA_COSTURA && d >= 1 && d <= LIMITE_DIAS_PREVISAO && deal && texto(deal.oficinaId)) {
      juntarEm(costura, faixa + '|' + texto(deal.oficinaId), d);
    }
    if (diaNumero(r.inicio) < inicioJanela) return;
    if (!ETAPAS_MARCO_PREVISAO[r.etapa] && (d < 1 || d > LIMITE_DIAS_PREVISAO)) return;
    if (r.etapa === 19 && !passouProducao[r.dealId]) return;
    juntarEm(durGeral, String(r.etapa), d);
    if (faixa) juntarEm(dur, r.etapa + '|' + faixa, d);
    if (deal && deal.pcpCompleto) juntarEm(durPcp, String(r.etapa), d);
  });

  // Fila: um card por (deal, destino) — a passagem mais recente na janela.
  var destinos = {};
  validos.forEach(function (r) {
    if (ETAPAS_FILA_PREVISAO.indexOf(r.etapa) < 0) return;
    if (diaNumero(r.inicio) < inicioJanela) return;
    if (r.etapa === 19 && !passouProducao[r.dealId]) return;
    var chave = r.dealId + '|' + r.etapa;
    if (!destinos[chave] || diaNumero(r.inicio) > diaNumero(destinos[chave].inicio)) destinos[chave] = r;
  });
  var fila = {};
  var filaGeral = {};
  Object.keys(destinos).forEach(function (chave) {
    var r = destinos[chave];
    var anterior = null;
    porDeal[r.dealId].forEach(function (x) {
      if (x.etapa >= r.etapa || x.etapa === ETAPA_PRIMEIRA_PECA || diaNumero(x.termino) === null) return;
      if (anterior === null || diaNumero(x.termino) > anterior) anterior = diaNumero(x.termino);
    });
    if (anterior === null) return;
    var gap = diaNumero(r.inicio) - anterior;
    if (gap < 0 || gap > LIMITE_DIAS_PREVISAO) return;
    var deal = deals[r.dealId] || null;
    juntarEm(filaGeral, String(r.etapa), gap);
    if (deal) juntarEm(fila, r.etapa + '|' + faixaVolume(deal.pecas), gap);
  });

  var linhas = [];
  function linha(tipo, etapa, faixa, oficinaId, valor, amostra) {
    if (valor === null) return;
    linhas.push({ tipo: tipo, etapa: Number(etapa), faixa: faixa, oficina_id: oficinaId, valor: arredondar4(valor), amostra: amostra });
  }
  Object.keys(dur).forEach(function (k) {
    var p = k.split('|');
    var v = filtrarIqr(dur[k]);
    linha('DURACAO', p[0], p[1], '', mediaSimples(v), v.length);
  });
  Object.keys(durGeral).forEach(function (k) {
    var v = filtrarIqr(durGeral[k]);
    linha('DURACAO_GERAL', k, '', '', mediaSimples(v), v.length);
  });
  Object.keys(durPcp).forEach(function (k) {
    var v = filtrarIqr(durPcp[k]);
    linha('DURACAO_PCP', k, '', '', mediaSimples(v), v.length);
  });
  Object.keys(fila).forEach(function (k) {
    var p = k.split('|');
    linha('FILA', p[0], p[1], '', mediana(fila[k]), fila[k].length);
  });
  Object.keys(filaGeral).forEach(function (k) {
    linha('FILA_GERAL', k, '', '', mediana(filaGeral[k]), filaGeral[k].length);
  });
  Object.keys(costura).forEach(function (k) {
    var p = k.split('|');
    linha('COSTURA_OFICINA', ETAPA_COSTURA, p[0], p[1], mediaSimples(costura[k]), costura[k].length);
  });
  return linhas.sort(function (a, b) {
    if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
    if (a.etapa !== b.etapa) return a.etapa - b.etapa;
    var ca = chaveMediaPrevisao(a);
    var cb = chaveMediaPrevisao(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}

// Chave da linha na aba: tipo|etapa|faixa|oficina_id (coluna chave, no fim).
function chaveMediaPrevisao(l) {
  return [semAcento(l && l.tipo), texto(l && l.etapa), texto(l && l.faixa), texto(l && l.oficina_id)].join('|');
}

// Linhas novas x aba atual: chave existente = update só de valor/amostra/calculado_em;
// chave nova = append; chave que sumiu do cálculo = valor vazio e amostra 0 (nunca apaga).
function operacoesMediasPrevisao(novas, atuais, calculadoEm) {
  var existentes = {};
  (atuais || []).forEach(function (l) {
    var c = texto(l && l.chave);
    if (c) existentes[c] = l;
  });
  var vistas = {};
  var ops = [];
  (novas || []).forEach(function (l) {
    var chave = chaveMediaPrevisao(l);
    vistas[chave] = 1;
    if (existentes[chave]) {
      ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave',
        linha: { chave: chave, valor: l.valor, amostra: l.amostra, calculado_em: calculadoEm } });
      return;
    }
    ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave', linha: {
      tipo: l.tipo, etapa: l.etapa, faixa: l.faixa, oficina_id: l.oficina_id, valor: l.valor,
      amostra: l.amostra, calculado_em: calculadoEm, chave: chave
    } });
  });
  Object.keys(existentes).forEach(function (chave) {
    if (vistas[chave] || texto(existentes[chave].valor) === '') return;
    ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave',
      linha: { chave: chave, valor: '', amostra: 0, calculado_em: calculadoEm } });
  });
  return ops;
}

// Ploomes cru -> operações da PREVISAO_MEDIAS. Sem nenhum registro reconhecido
// (FieldKeys por configurar, texto em outro formato, leitura vazia) não grava
// nada: as médias anteriores ficam e o adaptador registra o aviso no ERROS_APP.
function montarAtualizacaoMedias(registrosPloomes, dealsPloomes, linhasAtuais, hojeISO, calculadoEm) {
  var registros = (registrosPloomes || []).map(normalizarRegistroPrevisao).filter(function (r) {
    return r.dealId && r.etapa !== null && r.inicio;
  });
  if (!registros.length) {
    return { ok: false, erro: 'Nenhum registro de etapa reconhecido no Ploomes; médias anteriores mantidas.' };
  }
  var deals = {};
  (dealsPloomes || []).forEach(function (d) {
    var n = normalizarDealPrevisao(d);
    if (n.dealId) deals[n.dealId] = n;
  });
  var medias = calcularMediasPrevisao(registros, deals, hojeISO);
  return { ok: true, registros: registros.length, operacoes: operacoesMediasPrevisao(medias, linhasAtuais, calculadoEm) };
}
