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
