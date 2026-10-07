// ===== Code node "Processar Acao" =====
// GERADO por n8n/scripts/gerar-code-nodes.js. Nao edite no n8n.
// Para mudar a logica, edite n8n/src/ e rode: npm run build

// ----- src/util.js -----
// ===== src/util.js =====
// Helpers de leitura das linhas da planilha. Sem import/export: este
// arquivo entra inteiro no texto dos Code nodes do n8n.

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// null = celula vazia; NaN = preenchida com algo que nao e numero.
function numero(v) {
  var t = texto(v).replace(',', '.');
  if (t === '') return null;
  var n = Number(t);
  return isFinite(n) ? n : NaN;
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// Aceita 'aaaa-mm-dd', 'aaaa-mm-dd hh:mm', 'dd/mm/aaaa', 'dd/mm/aa' e
// 'dd/mm' (usa anoPadrao). Devolve 'aaaa-mm-dd' ou '' quando nao reconhece.
function dataISO(v, anoPadrao) {
  var t = texto(v);
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) {
    var ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(anoPadrao);
    return ano + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  }
  return '';
}

function semAcento(s) {
  return texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

// ----- src/auth.js -----
// ===== src/auth.js =====
// Hash de senha e token de sessao. O modulo crypto do Node chega por
// parametro (cripto): no n8n vem de require('crypto') no adaptador, nos
// testes vem direto do Node.
// Formato do hash: pbkdf2$<iteracoes>$<salt hex>$<hash hex> (SHA-256, 32 bytes).

var PBKDF2_ITERACOES = 120000;

function gerarHash(cripto, senha, saltHex) {
  var salt = saltHex || cripto.randomBytes(16).toString('hex');
  var h = cripto.pbkdf2Sync(senha, salt, PBKDF2_ITERACOES, 32, 'sha256').toString('hex');
  return 'pbkdf2$' + PBKDF2_ITERACOES + '$' + salt + '$' + h;
}

function iguaisTempoConstante(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function conferirSenha(cripto, senha, armazenado) {
  var p = texto(armazenado).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  var it = Number(p[1]);
  if (!isFinite(it) || it < 1 || it > 1000000) return false;
  if (!/^[0-9a-f]+$/.test(p[2]) || p[2].length % 2 !== 0 || p[2].length < 32) return false;
  if (!/^[0-9a-f]{64}$/.test(p[3])) return false;
  var h = cripto.pbkdf2Sync(senha, p[2], it, 32, 'sha256').toString('hex');
  return iguaisTempoConstante(h, p[3]);
}

function gerarToken(cripto) {
  return cripto.randomBytes(32).toString('hex');
}

// ----- src/montarCaixas.js -----
// ===== src/montarCaixas.js =====
// Junta as linhas das abas FALTANTES e CAIXAS GANHAS em uma caixa por
// negocio (deal_id) - um card por caixa fisica. Funcao pura.
// Regras (spec da F1):
//  - SUBSTITUIDO nunca vira item (foi trocado pela linha do CORTE).
//  - Se o negocio tem linhas de CORTE, a caixa e CORTE: entram os itens do
//    CORTE e os do PEDIDO ainda abertos (o sync nao mexe em material que
//    nao aparece no corte).
//  - saiu / saiuComFalta / saiuEm vem da CAIXAS GANHAS pelo deal_id.
//  - Caixa so na CAIXAS GANHAS com saiu_com_falta = SIM: itens lidos do
//    texto itens_faltando ("DESC (falta N UN); ...").

var STATUS_ABERTOS = { ABERTO: 1, PARCIAL: 1 };

function tipoDaSecao(v) {
  var n = semAcento(v);
  if (n.indexOf('ACABAMENTO') >= 0) return 'ACABAMENTO';
  if (n.indexOf('COSTURA') >= 0) return 'COSTURA';
  if (n.indexOf('PREPARA') >= 0) return 'PREPARACAO';
  return n;
}

function itemEstaAberto(it) {
  return !!STATUS_ABERTOS[it.status] && (it.resta === null || it.resta > 0);
}

// resta = falta - baixada (null quando a falta nao foi registrada);
// restaG = gramas restantes, proporcional a resta (null sem faltaG).
function restaDe(falta, baixada) {
  return falta === null ? null : arredondar(Math.max(0, falta - baixada));
}
function restaGDe(falta, faltaG, resta) {
  if (faltaG === null || resta === null || falta === null) return null;
  if (falta <= 0) return 0;
  return arredondar(resta * faltaG / falta);
}

// 'aaaa-mm-dd hh:mm' (Brasilia, sem fuso) ou ISO com fuso -> ms; NaN se nao reconhece.
function msDaData(v) {
  var t = texto(v);
  var m = t.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.parse(m[1] + 'T' + (m[2] || '00:00') + ':' + (m[3] || '00') + '-03:00');
  return Date.parse(t);
}

// A coluna manual vale ate algum item da caixa ser atualizado depois dela.
function colunaManualDe(cp, linhas) {
  if (!cp) return null;
  var col = texto(cp.coluna_manual);
  if (!NOMES_COLUNA.hasOwnProperty(col)) return null;
  var desde = Date.parse(texto(cp.coluna_manual_em));
  if (isNaN(desde)) return col;
  var mexeu = (linhas || []).some(function (l) {
    var a = texto(l.atualizado_em_app) === '' ? NaN : Date.parse(texto(l.atualizado_em_app));
    var d = texto(l.data_atualizacao) === '' ? NaN : msDaData(l.data_atualizacao);
    return (!isNaN(a) && a > desde) || (!isNaN(d) && d > desde);
  });
  return mexeu ? null : col;
}

function historicoDoDeal(historico, dealId) {
  return (historico || []).filter(function (h) { return h && texto(h.deal_id) === dealId; })
    .sort(function (a, b) {
      var x = texto(a.quando);
      var y = texto(b.quando);
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .slice(0, 30)
    .map(function (h) {
      return {
        quando: texto(h.quando),
        usuario: texto(h.usuario),
        texto: texto(h.texto),
        ploomes: texto(h.ploomes_status).toUpperCase() || 'PENDENTE'
      };
    });
}

function itemDaLinha(l, ano) {
  var nec = numero(l.qtd_necessaria);
  var sep = numero(l.qtd_separada);
  var falta = numero(l.qtd_falta);
  var faltaG = numero(l.qtd_falta_g);
  var bx = numero(l.qtd_baixada);
  var baixada = bx === null || isNaN(bx) ? 0 : bx;
  faltaG = faltaG === null || isNaN(faltaG) ? null : faltaG;
  var resta = restaDe(falta, baixada);
  return {
    id: texto(l.id),
    nome: texto(l.descricao_item),
    cor: texto(l.nome_cor) || texto(l.cor),
    un: texto(l.unidade),
    necessaria: isNaN(nec) ? null : nec,
    separada: isNaN(sep) ? null : sep,
    falta: falta,
    faltaG: faltaG,
    status: semAcento(l.status),
    baixada: baixada,
    resta: resta,
    restaG: restaGDe(falta, faltaG, resta),
    obsAlmox: texto(l.obs_almoxarifado),
    obsPcp: texto(l.observacao_pcp),
    previsao: dataISO(l.previsao, ano),
    resolvidoEm: dataISO(l.data_resolucao, ano),
    versao: texto(l.atualizado_em_app),
    editavel: true
  };
}

function itensDoTexto(dealId, txt) {
  return texto(txt).split(';')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; })
    .map(function (s, i) {
      var m = s.match(/^(.*?)\s*\(falta ([\d.]+)(?: ([^)]+))?\)\s*$/);
      return {
        id: dealId + '|ganha|' + i,
        nome: m ? m[1].trim() : s,
        cor: '',
        un: m && m[3] ? m[3].trim() : '',
        necessaria: null,
        separada: null,
        falta: m ? Number(m[2]) : null,
        faltaG: null,
        status: 'ABERTO',
        baixada: 0,
        resta: m ? Number(m[2]) : null,
        restaG: null,
        obsAlmox: '',
        obsPcp: '',
        previsao: '',
        resolvidoEm: '',
        versao: '',
        editavel: false
      };
    });
}

function menorData(datas) {
  return datas.filter(function (d) { return d !== ''; }).sort()[0] || '';
}

function montarCaixas(faltantes, ganhas, hoje, extras) {
  extras = extras || {};
  var cpPorDeal = {};
  (extras.caixasPcp || []).forEach(function (c) {
    var id = texto(c && c.deal_id);
    if (id) cpPorDeal[id] = c;
  });
  var ano = hoje.getFullYear();
  var avisos = [];
  var grupos = {};
  var ordem = [];

  (faltantes || []).forEach(function (l, idx) {
    if (!l) return;
    var numLinha = idx + 2; // linha 1 da aba e o cabecalho
    var dealId = texto(l.deal_id);
    var os = texto(l.os);
    if (!dealId || !os) {
      if (texto(l.id)) avisos.push('FALTANTES linha ' + numLinha + ': sem deal_id ou os, ignorada');
      return;
    }
    if (isNaN(numero(l.qtd_falta))) {
      avisos.push('FALTANTES linha ' + numLinha + ' (OS ' + os + '): qtd_falta invalida, ignorada');
      return;
    }
    if (semAcento(l.status) === 'SUBSTITUIDO') return;
    if (!grupos[dealId]) { grupos[dealId] = []; ordem.push(dealId); }
    grupos[dealId].push(l);
  });

  var ganhasPorDeal = {};
  (ganhas || []).forEach(function (g) {
    var id = texto(g && g.deal_id);
    if (id) ganhasPorDeal[id] = g;
  });

  function marcarExtras(caixa, linhas) {
    var cp = cpPorDeal[caixa.dealId];
    caixa.previsao = cp ? dataISO(cp.previsao, ano) : '';
    caixa.observacao = cp ? texto(cp.observacao) : '';
    caixa.colunaManual = colunaManualDe(cp, linhas);
    caixa.versao = cp ? texto(cp.atualizado_em) : '';
    if (cp) caixa.responsavel = texto(cp.responsavel);
    caixa.historico = historicoDoDeal(extras.historico, caixa.dealId);
    return caixa;
  }

  function marcarSaida(caixa, g) {
    caixa.saiu = !!g;
    caixa.saiuComFalta = !!g && semAcento(g.saiu_com_falta) === 'SIM';
    caixa.saiuEm = g ? dataISO(g.data_ganho, ano) : '';
    return caixa;
  }

  var caixas = ordem.map(function (dealId) {
    var linhas = grupos[dealId];
    var temCorte = linhas.some(function (l) { return texto(l.ciclo).toUpperCase() === 'CORTE'; });
    var itens = [];
    linhas.forEach(function (l) {
      var it = itemDaLinha(l, ano);
      var ehCorte = texto(l.ciclo).toUpperCase() === 'CORTE';
      if (!temCorte || ehCorte || itemEstaAberto(it)) itens.push(it);
    });
    var p = linhas[0];
    var resp = '';
    linhas.forEach(function (l) { if (!resp) resp = texto(l.responsavel); });
    return marcarSaida(marcarExtras({
      id: dealId,
      dealId: dealId,
      os: texto(p.os),
      ciclo: temCorte ? 'CORTE' : 'PEDIDO',
      tipo: tipoDaSecao(p.secao),
      referencia: texto(p.referencia),
      peca: texto(p.descricao_peca),
      cliente: texto(p.cliente),
      responsavel: resp,
      registradoEm: menorData(linhas.map(function (l) { return dataISO(l.data_separacao, ano); })),
      itens: itens
    }, linhas), ganhasPorDeal[dealId]);
  });

  Object.keys(ganhasPorDeal).forEach(function (dealId) {
    if (grupos[dealId]) return;
    var g = ganhasPorDeal[dealId];
    var comFalta = semAcento(g.saiu_com_falta) === 'SIM';
    var itensGanha = comFalta ? itensDoTexto(dealId, g.itens_faltando) : [];
    if (comFalta && itensGanha.length === 0) {
      itensGanha.push({
        id: dealId + '|ganha|0', nome: 'Itens não detalhados na planilha', cor: '', un: '',
        necessaria: null, separada: null, falta: null, faltaG: null, status: 'ABERTO',
        baixada: 0, resta: null, restaG: null, obsAlmox: '', obsPcp: '', previsao: '',
        resolvidoEm: '', versao: '', editavel: false
      });
    }
    caixas.push(marcarSaida(marcarExtras({
      id: dealId,
      dealId: dealId,
      os: texto(g.os),
      ciclo: texto(g.conferido_em).toUpperCase() === 'CORTE' ? 'CORTE' : 'PEDIDO',
      tipo: tipoDaSecao(g.caixa),
      referencia: texto(g.referencia),
      peca: texto(g.descricao_peca),
      cliente: texto(g.cliente),
      responsavel: '',
      registradoEm: dataISO(g.data_ganho, ano),
      itens: itensGanha
    }, []), g));
  });

  caixas.sort(function (a, b) {
    if (a.registradoEm !== b.registradoEm) return a.registradoEm < b.registradoEm ? -1 : 1;
    return a.os < b.os ? -1 : a.os > b.os ? 1 : 0;
  });
  return { caixas: caixas, avisos: avisos };
}

// ----- src/acoes.js -----
// ===== src/acoes.js =====
// Regras das acoes de escrita (baixa, previsao, observacao, responsavel,
// mover). Funcoes puras; sem import/export. Depende de util.js.

var TIPOS_ACAO = ['baixa', 'previsao_item', 'obs_item', 'responsavel', 'previsao_caixa', 'obs_caixa', 'mover'];
var TIPOS_ITEM = ['baixa', 'previsao_item', 'obs_item'];

var NOMES_COLUNA = {
  falta_pedido: 'Itens faltando · Pedido',
  completa_pedido: 'Caixa completa · Pedido',
  falta_corte: 'Itens faltando · Corte',
  completa_corte: 'Caixa completa · Corte',
  saiu_com: 'Saiu com faltas',
  saiu_sem: 'Saiu sem faltas'
};

function linhaDeGravacao(gravacao) {
  var linha = Object.assign({}, gravacao.campos);
  var ch = gravacao.chave;
  if (ch && linha[ch.coluna] === undefined) linha[ch.coluna] = ch.valor;
  return linha;
}

function erroAcao(status, erro) {
  return { ok: false, status: status, erro: erro };
}

function dataValida(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  var a = Number(m[1]);
  var mes = Number(m[2]);
  var dia = Number(m[3]);
  var d = new Date(Date.UTC(a, mes - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function validarAcao(corpo, perfil) {
  if (!corpo || typeof corpo !== 'object') return erroAcao(400, 'Corpo inválido.');
  var tipo = corpo.tipo;
  if (TIPOS_ACAO.indexOf(tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var dealId = texto(corpo.dealId);
  if (dealId === '') return erroAcao(400, 'Caixa não informada.');
  var itemId = texto(corpo.itemId);
  if (TIPOS_ITEM.indexOf(tipo) >= 0 && itemId === '') return erroAcao(400, 'Item não informado.');

  var valor = corpo.valor;
  var justificativa = '';
  if (tipo === 'baixa') {
    var n = typeof valor === 'number' ? valor : numero(valor);
    if (n !== null && isFinite(n)) n = arredondar(n);
    if (n === null || !isFinite(n) || n <= 0) return erroAcao(400, 'Informe uma quantidade maior que zero');
    valor = n;
  } else if (tipo === 'previsao_item' || tipo === 'previsao_caixa') {
    valor = valor === null || valor === undefined ? '' : texto(valor);
    if (valor !== '' && !dataValida(valor)) return erroAcao(400, 'Data inválida.');
  } else if (tipo === 'obs_item' || tipo === 'obs_caixa') {
    if (typeof valor !== 'string') return erroAcao(400, 'Texto inválido.');
    valor = valor.trim().replace(/(\r\n|\n|\r)+/g, ' ');
    if (valor.length > 500) return erroAcao(400, 'Texto com no máximo 500 caracteres.');
  } else if (tipo === 'responsavel') {
    if (typeof valor !== 'string') return erroAcao(400, 'Responsável inválido.');
    valor = valor.trim();
    if (valor.length > 100) return erroAcao(400, 'Nome do responsável muito longo.');
  } else if (tipo === 'mover') {
    if (typeof valor !== 'string' || !NOMES_COLUNA.hasOwnProperty(valor)) return erroAcao(400, 'Coluna inválida.');
    justificativa = texto(corpo.justificativa);
    if (justificativa.length > 500) return erroAcao(400, 'Justificativa muito longa (máximo 500 caracteres).');
    if (perfil !== 'ADM' && justificativa.length < 15) {
      return erroAcao(400, 'Justificativa precisa de pelo menos 15 caracteres.');
    }
  }

  var acao = { tipo: tipo, dealId: dealId, valor: valor, versao: texto(corpo.versao) };
  if (TIPOS_ITEM.indexOf(tipo) >= 0) acao.itemId = itemId;
  if (tipo === 'mover') acao.justificativa = justificativa;
  return { ok: true, acao: acao };
}

// 'aaaa-mm-dd' -> 'dd/mm'
function dataCurta(iso) {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

function arredondar(n) {
  return Math.round(n * 1000) / 1000;
}

function formatarQtd(n) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function textoDaAcao(acao, ctx) {
  var u = ctx.usuario;
  var item = ctx.nomeItem;
  switch (acao.tipo) {
    case 'baixa':
      return u + ' deu baixa: ' + formatarQtd(acao.valor) + ' ' + ctx.un + ' de ' + item +
        ' (resta ' + formatarQtd(ctx.resta) + ' ' + ctx.un + ')';
    case 'previsao_item':
      return acao.valor === ''
        ? u + ' removeu a previsão de ' + item
        : u + ' definiu previsão de ' + item + ': ' + dataCurta(acao.valor);
    case 'obs_item':
      return u + ' anotou em ' + item + ': "' + acao.valor + '"';
    case 'responsavel':
      return acao.valor === ''
        ? u + ' removeu o responsável'
        : u + ' definiu responsável: ' + acao.valor;
    case 'previsao_caixa':
      return acao.valor === ''
        ? u + ' removeu a previsão geral da caixa'
        : u + ' definiu previsão geral da caixa: ' + dataCurta(acao.valor);
    case 'obs_caixa':
      return u + ' anotou na caixa: "' + acao.valor + '"';
    case 'mover':
      return u + ' moveu para ' + NOMES_COLUNA[acao.valor] +
        (acao.justificativa ? ' — Justificativa: ' + acao.justificativa : '');
  }
  return '';
}

function aplicarAcao(acao, alvo, contexto) {
  var ehItem = TIPOS_ITEM.indexOf(acao.tipo) >= 0;
  if (ehItem && !alvo) return erroAcao(404, 'Item não encontrado.');

  var versaoAtual = alvo ? texto(ehItem ? alvo.atualizado_em_app : alvo.atualizado_em) : '';
  if (texto(acao.versao) !== versaoAtual) {
    return erroAcao(409, 'Alguém alterou esta caixa agora há pouco.');
  }

  var agora = contexto.agora;
  var campos = {};
  var ctxTexto = {
    usuario: contexto.usuario, nomeItem: contexto.nomeItem, un: contexto.un
  };

  if (acao.tipo === 'baixa') {
    var falta = numero(alvo.qtd_falta);
    var baixada = numero(alvo.qtd_baixada);
    if (baixada === null || isNaN(baixada)) baixada = 0;
    if (falta === null || !isFinite(falta)) {
      return erroAcao(400, 'Item sem quantidade faltante registrada.');
    }
    var resta = arredondar(Math.max(0, falta - baixada));
    if (acao.valor > resta) return erroAcao(400, 'Falta só ' + formatarQtd(resta) + ' ' + contexto.un);
    ctxTexto.resta = arredondar(resta - acao.valor);
    campos.qtd_baixada = arredondar(baixada + acao.valor);
    campos.atualizado_em_app = agora;
  } else if (acao.tipo === 'previsao_item') {
    campos.previsao = acao.valor;
    campos.atualizado_em_app = agora;
  } else if (acao.tipo === 'obs_item') {
    campos.observacao_pcp = acao.valor;
    campos.atualizado_em_app = agora;
  } else {
    campos.deal_id = acao.dealId;
    campos.os = contexto.os;
    if (!alvo && acao.tipo !== 'responsavel') campos.responsavel = texto(contexto.responsavelAtual);
    if (acao.tipo === 'responsavel') campos.responsavel = acao.valor;
    else if (acao.tipo === 'previsao_caixa') campos.previsao = acao.valor;
    else if (acao.tipo === 'obs_caixa') campos.observacao = acao.valor;
    else if (acao.tipo === 'mover') {
      campos.coluna_manual = acao.valor;
      campos.coluna_manual_em = agora;
    }
    campos.atualizado_em = agora;
  }

  var gravacao = ehItem
    ? { aba: 'FALTANTES', chave: { coluna: 'id', valor: acao.itemId }, campos: campos }
    : { aba: 'CAIXAS_PCP', chave: { coluna: 'deal_id', valor: acao.dealId }, campos: campos };

  var historico = {
    id: contexto.gerarId(),
    quando: agora,
    usuario: contexto.usuario,
    email: contexto.email,
    deal_id: acao.dealId,
    os: contexto.os,
    item_id: ehItem ? acao.itemId : '',
    acao: acao.tipo,
    texto: textoDaAcao(acao, ctxTexto),
    ploomes_status: 'PENDENTE',
    ploomes_id: '',
    tentativas: 0,
    erro: ''
  };

  return { ok: true, gravacao: gravacao, historico: historico };
}

// ----- src/envioPloomes.js -----
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
  else m = 'HTTP ' + (resposta ? resposta.status : '?');
  return texto(m).slice(0, 300);
}

function resultadoEnvio(linha, resposta) {
  var status = resposta ? Number(resposta.status) : 0;
  if (status === 429) return { parar: true }; // so esta linha: fica PENDENTE
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

// ----- src/api.js -----
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

// ===== adaptador: Processar Acao =====
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
var corpo = entrada.body || {};
var linhas = {
  faltantes: $('Ler FALTANTES Acao').all().map(function (i) { return i.json; }),
  caixasPcp: $('Ler CAIXAS_PCP Acao').all().map(function (i) { return i.json; }),
  ganhas: $('Ler CAIXAS GANHAS Acao').all().map(function (i) { return i.json; })
};
var gerarId = function () { return require('crypto').randomUUID(); };
return [{ json: processarAcao(estado, cabecalho, corpo, linhas, Date.now(), gerarId) }];
