// ===== Code node "Preparar Interpretação" =====
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

function historicoDoDeal(historico, dealId) {
  return (historico || []).filter(function (h) { return h && texto(h.deal_id) === dealId; })
    .sort(function (a, b) {
      var x = texto(a.quando);
      var y = texto(b.quando);
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .slice(0, 30)
    .map(function (h) {
      var e = {
        quando: texto(h.quando),
        usuario: texto(h.usuario),
        texto: texto(h.texto),
        ploomes: texto(h.ploomes_status).toUpperCase() || 'PENDENTE'
      };
      // Visão da peça (F5a): id evita evento repetido; acao diz a fonte na linha do tempo.
      if (texto(h.id)) e.id = texto(h.id);
      if (texto(h.acao)) e.acao = texto(h.acao);
      return e;
    });
}

function itemDaLinha(l, ano) {
  var nec = numero(l.qtd_necessaria);
  var sep = numero(l.qtd_separada);
  var falta = numero(l.qtd_falta);
  var faltaG = numero(l.qtd_falta_g);
  var bx = numero(l.qtd_baixada);
  var bxIlegivel = bx !== null && isNaN(bx);
  var baixada = bx === null || bxIlegivel ? 0 : bx;
  faltaG = faltaG === null || isNaN(faltaG) ? null : faltaG;
  // qtd_baixada ilegivel: nao da para saber quanto resta (montarCaixas avisa).
  var resta = bxIlegivel ? null : restaDe(falta, baixada);
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
    editavel: true,
    posSaida: semAcento(l.origem) === 'POS_SAIDA'
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
        editavel: false,
        posSaida: false
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
  // F3: item -> pedido aberto que o contem (o pedido feito antes do corte segue o item do CORTE).
  var abertosPorItem = pedidosAbertosPorItem(lerPedidos(extras.pedidos, extras.pedidosItens, faltantes || []));
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
    if (isNaN(numero(l.qtd_baixada))) {
      avisos.push('FALTANTES linha ' + numLinha + ' (OS ' + os + '): qtd_baixada ilegivel');
    }
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
    caixa.versao = cp ? texto(cp.atualizado_em) : '';
    if (cp) caixa.responsavel = texto(cp.responsavel);
    caixa.itens.forEach(function (it) {
      it.pedidoIds = (abertosPorItem[it.id] || []).slice();
      it.pedidoId = it.pedidoIds[0] || '';
    });
    caixa.historico = historicoDoDeal(extras.historico, caixa.dealId);
    return caixa;
  }

  function marcarSaida(caixa, g) {
    caixa.saiu = !!g;
    caixa.saiuComFalta = !!g && semAcento(g.saiu_com_falta) === 'SIM';
    caixa.saiuEm = g ? dataISO(g.data_ganho, ano) : '';
    return caixa;
  }

  // Itens da falta registrada em texto na CAIXAS GANHAS (ou o item generico).
  function itensDaGanha(dealId, g) {
    var comFalta = semAcento(g.saiu_com_falta) === 'SIM';
    var itensGanha = comFalta ? itensDoTexto(dealId, g.itens_faltando) : [];
    if (comFalta && itensGanha.length === 0) {
      itensGanha.push({
        id: dealId + '|ganha|0', nome: 'Itens não detalhados na planilha', cor: '', un: '',
        necessaria: null, separada: null, falta: null, faltaG: null, status: 'ABERTO',
        baixada: 0, resta: null, restaG: null, obsAlmox: '', obsPcp: '', previsao: '',
        resolvidoEm: '', versao: '', editavel: false, posSaida: false
      });
    }
    return itensGanha;
  }

  var caixas = ordem.map(function (dealId) {
    var linhas = grupos[dealId];
    // Caixa conhecida so pela GANHAS que depois recebeu demanda pos-saida: o texto da falta
    // original continua valendo e a data/ciclo vem da GANHAS.
    var gTexto = ganhasPorDeal[dealId];
    var soPosSaida = !!gTexto && linhas.every(function (l) { return semAcento(l.origem) === 'POS_SAIDA'; });
    if (!soPosSaida) gTexto = null;
    var temCorte = linhas.some(function (l) { return texto(l.ciclo).toUpperCase() === 'CORTE'; });
    var itens = [];
    linhas.forEach(function (l) {
      var it = itemDaLinha(l, ano);
      var ehCorte = texto(l.ciclo).toUpperCase() === 'CORTE';
      // item pos-saida fica sempre (o sync do corte nao o conhece)
      if (!temCorte || ehCorte || it.posSaida || itemEstaAberto(it)) itens.push(it);
    });
    if (gTexto) itens = itensDaGanha(dealId, gTexto).concat(itens);
    var p = linhas[0];
    var resp = '';
    linhas.forEach(function (l) { if (!resp) resp = texto(l.responsavel); });
    return marcarSaida(marcarExtras({
      id: dealId,
      dealId: dealId,
      os: texto(p.os),
      ciclo: gTexto ? (texto(gTexto.conferido_em).toUpperCase() === 'CORTE' ? 'CORTE' : 'PEDIDO') : (temCorte ? 'CORTE' : 'PEDIDO'),
      tipo: tipoDaSecao(p.secao),
      referencia: texto(p.referencia),
      peca: texto(p.descricao_peca),
      cliente: texto(p.cliente),
      responsavel: resp,
      registradoEm: gTexto ? dataISO(gTexto.data_ganho, ano) : menorData(linhas.map(function (l) { return dataISO(l.data_separacao, ano); })),
      itens: itens
    }, linhas), ganhasPorDeal[dealId]);
  });

  Object.keys(ganhasPorDeal).forEach(function (dealId) {
    if (grupos[dealId]) return;
    var g = ganhasPorDeal[dealId];
    var itensGanha = itensDaGanha(dealId, g);
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
// Regras das acoes de escrita (baixa, previsao, observacao, responsavel). Funcoes puras; sem import/export. Depende de util.js.

var TIPOS_ACAO = ['baixa', 'previsao_item', 'obs_item', 'responsavel', 'previsao_caixa', 'obs_caixa'];
var TIPOS_ITEM = ['baixa', 'previsao_item', 'obs_item'];

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
  if (tipo === 'mover') return erroAcao(400, 'Mover caixa foi desativado: as etapas vêm do Ploomes.');
  if (TIPOS_ACAO.indexOf(tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var dealId = texto(corpo.dealId);
  if (dealId === '') return erroAcao(400, 'Caixa não informada.');
  var itemId = texto(corpo.itemId);
  if (TIPOS_ITEM.indexOf(tipo) >= 0 && itemId === '') return erroAcao(400, 'Item não informado.');

  var valor = corpo.valor;
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
  }

  var acao = { tipo: tipo, dealId: dealId, valor: valor, versao: texto(corpo.versao) };
  if (TIPOS_ITEM.indexOf(tipo) >= 0) acao.itemId = itemId;
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
    if (baixada !== null && isNaN(baixada)) return erroAcao(400, 'Baixa registrada ilegível na planilha.');
    if (baixada === null) baixada = 0;
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

  // F3: a mesma gravacao como lista de operacoes (FALTANTES = update por id;
  // CAIXAS_PCP = appendOrUpdate por deal_id). gravacao/historico ficam por
  // compatibilidade com os adaptadores da F2.
  var operacao = {
    aba: gravacao.aba,
    operacao: ehItem ? 'update' : 'appendOrUpdate',
    chave: gravacao.chave.coluna,
    linha: linhaDeGravacao(gravacao)
  };
  return { ok: true, gravacao: gravacao, historico: historico, operacoes: [operacao], historicos: [historico] };
}

// ----- src/pedidos.js -----
// ===== src/pedidos.js =====
// F3: solicitacoes de faltas (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO) e a demanda
// pos-saida (itens novos na FALTANTES depois que a caixa saiu). As duas ultimas
// etapas (pela ordem) sao fixas: a penultima ("Enviado ao destino final") da a baixa
// do pedido nas caixas; a ultima ("Concluido": o destino confirmou que recebeu)
// finaliza o pedido. Funcoes puras; sem import/export. Depende de util.js,
// montarCaixas.js e acoes.js.
// Cada acao devolve { operacoes: [{ aba, operacao, chave, linha }], historicos }.

var TIPOS_PEDIDO = ['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido',
  'dividir_pedido', 'dividir_por_previsao', 'salvar_etapas', 'nova_demanda'];
var ETAPAS_PADRAO = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  // id 'entregue' mantido para os dados existentes: e a etapa que da a baixa.
  { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
  { id: 'concluido', nome: 'Concluído', ordem: 5 }
];
var ORIGENS = { FORNECEDOR: 'Fornecedor', CLIENTE: 'Cliente' };
var LOCAIS = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
var ERRO_VERSAO_PEDIDO = 'Alguém alterou este pedido agora há pouco.';
var ERRO_ETAPA_PELO_CARD = 'Para mudar a etapa, arraste o card.';
// Site antigo aberto numa aba depois do deploy: manda corpo que a API nova entenderia
// de outro jeito (baixa sem confirmacao, divisao para outra etapa). Recarregar resolve.
var ERRO_SITE_ANTIGO = 'Atualize a página: o site mudou.';
var NOMES_CAIXA = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento' };
var MAX_ITENS_DEMANDA = 30;
var CAMPOS_PEDIDO = ['origem', 'quem', 'local', 'previsao', 'responsavel'];
var NOMES_CAMPO = { origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };

// ---------- leitura das abas ----------

// PED-nnnn (pedido original) ou PED-nnnn.k (parte k de uma divisao).
var RE_PEDIDO = /^PED-(\d+)(?:\.(\d+))?$/;

function numeroDoPedido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return m ? Number(m[1]) : 0;
}

// Numero da parte (PED-0002.3 -> 3); 0 no pedido original.
function parteDoPedido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return m && m[2] !== undefined ? Number(m[2]) : 0;
}

// Pedido valido: numero > 0 (PED-0000 e a linha-semente) e, se for parte, k > 0.
function pedidoValido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return !!m && Number(m[1]) > 0 && (m[2] === undefined || Number(m[2]) > 0);
}

// Familia: PED-0002.3 -> PED-0002.
function raizDoPedido(id) {
  return texto(id).split('.')[0];
}

function compararPedidos(a, b) {
  return (numeroDoPedido(a) - numeroDoPedido(b)) || (parteDoPedido(a) - parteDoPedido(b));
}

function proximoIdPedido(pedidos) {
  var max = 0;
  (pedidos || []).forEach(function (p) {
    // a parte PED-0005.1 conta como 5: o proximo original nunca colide com uma familia
    var n = numeroDoPedido(p && p.id);
    if (n > max) max = n;
  });
  var s = String(max + 1);
  while (s.length < 4) s = '0' + s;
  return 'PED-' + s;
}

// Proxima parte da familia: maior k existente (aberta ou nao) + 1.
function proximoIdFilho(pedidos, raiz) {
  var max = 0;
  (pedidos || []).forEach(function (p) {
    var id = texto(p && p.id);
    if (!pedidoValido(id) || raizDoPedido(id) !== raiz) return;
    var k = parteDoPedido(id);
    if (k > max) max = k;
  });
  return raiz + '.' + (max + 1);
}

var ID_ETAPA_CONCLUIDO = 'concluido';

// Etapas validas (com id e nome), ordenadas; aba vazia = padrao. Sem a etapa de id
// `concluido` (aba antiga, de 4 linhas, de antes das etapas novas) entra uma etapa
// virtual Concluido no fim (maior ordem + 1): a penultima passa a ser a ultima da
// aba (`entregue`), que da a baixa, e o deploy nao depende de mexer na aba antes.
// O salvar_etapas grava a linha que falta.
function lerEtapas(linhas) {
  var e = lerEtapasDaAba(linhas);
  if (e.some(function (x) { return x.id === ID_ETAPA_CONCLUIDO; })) return e;
  var max = 0;
  e.forEach(function (x) { if (x.ordem > max) max = x.ordem; });
  return e.concat([{ id: ID_ETAPA_CONCLUIDO, nome: 'Concluído', ordem: max + 1 }]);
}

function lerEtapasDaAba(linhas) {
  var lidas = (linhas || []).filter(function (e) { return e && texto(e.id) !== '' && texto(e.nome) !== ''; })
    .map(function (e) {
      var o = numero(e.ordem);
      return { id: texto(e.id), nome: texto(e.nome), ordem: o === null || isNaN(o) ? Infinity : o };
    })
    .sort(function (a, b) {
      if (a.ordem !== b.ordem) return a.ordem < b.ordem ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  if (!lidas.length) return ETAPAS_PADRAO.map(function (e) { return { id: e.id, nome: e.nome, ordem: e.ordem }; });
  return lidas.map(function (e, i) { return { id: e.id, nome: e.nome, ordem: e.ordem === Infinity ? i + 1 : e.ordem }; });
}

// ---------- "pedido acompanha o corte" ----------
// Id do item na FALTANTES: <deal_id>|<CICLO>|<cod_item>|<cor>|<tamanho>. A conferencia
// pos-corte (Sync Faltantes) grava as linhas CORTE e marca SUBSTITUIDO as do PEDIDO que
// reaparecem no corte. O pedido feito antes continua com o item_id do PEDIDO na
// PEDIDOS_ITENS; a leitura troca pelo item do CORTE correspondente. A planilha nao e
// reescrita. O id do CORTE nao segue o do PEDIDO (o sync grava descricao|cor|n), entao o
// item correspondente e achado pelos campos (correspondenteNoCorte). Sem correspondente (o
// material saiu no corte) fica o item antigo, marcado item_mudou: nao recebe baixa (a linha
// SUBSTITUIDO nao esta aberta) e o board avisa.

// { porId, cortePorDeal: { deal: [linhas CORTE atuais] } }
function indexarCorte(faltantes) {
  var cortePorDeal = {};
  (faltantes || []).forEach(function (l) {
    if (!l || texto(l.ciclo).toUpperCase() !== 'CORTE' || linhaSubstituida(l)) return;
    var d = texto(l.deal_id);
    (cortePorDeal[d] = cortePorDeal[d] || []).push(l);
  });
  return { porId: indexarFaltantes(faltantes), cortePorDeal: cortePorDeal };
}

function textoComparavel(v) {
  return semAcento(v).replace(/\s+/g, ' ');
}

// Codigo da cor como numero sem zeros a esquerda: '5', '00005 fundo preto' -> '5'; '' sem codigo.
function codigoCor(v) {
  var t = texto(v).split(/\s+/)[0];
  return /^\d+$/.test(t) ? String(Number(t)) : '';
}

// Nome da cor: o texto da cor sem o codigo ('00005 fundo preto' -> 'FUNDO PRETO').
function nomeDaCor(v) {
  var t = texto(v);
  return textoComparavel(codigoCor(t) ? t.replace(/^\S+\s*/, '') : t);
}

// Linha CORTE atual do mesmo deal com a mesma descricao (sem acento, caixa e espacos extras)
// e o mesmo codigo de cor quando os dois lados tem. Mais de uma: prefere o codigo de cor igual
// e depois o nome da cor (nome_cor do PEDIDO). Ainda ambiguo ou nenhuma: null.
function correspondenteNoCorte(antiga, idx) {
  var desc = textoComparavel(antiga.descricao_item);
  var cor = codigoCor(antiga.cor);
  var cands = (idx.cortePorDeal[texto(antiga.deal_id)] || []).filter(function (l) {
    if (textoComparavel(l.descricao_item) !== desc) return false;
    var c = codigoCor(l.cor);
    return !(cor && c && c !== cor);
  });
  if (cands.length > 1 && cor) {
    var mesmaCor = cands.filter(function (l) { return codigoCor(l.cor) === cor; });
    if (mesmaCor.length) cands = mesmaCor;
  }
  var nomeCor = textoComparavel(antiga.nome_cor);
  if (cands.length > 1 && nomeCor) {
    var mesmoNome = cands.filter(function (l) { return nomeDaCor(l.cor) === nomeCor; });
    if (mesmoNome.length) cands = mesmoNome;
  }
  return cands.length === 1 ? cands[0] : null;
}

function indexarFaltantes(faltantes) {
  var m = {};
  (faltantes || []).forEach(function (l) {
    var id = texto(l && l.id);
    if (id && !m[id]) m[id] = l;
  });
  return m;
}

function idNoCorte(itemId) {
  var partes = texto(itemId).split('|');
  if (partes.length < 3 || partes[1].toUpperCase() !== 'PEDIDO') return '';
  partes[1] = 'CORTE';
  return partes.join('|');
}

function linhaSubstituida(l) {
  return !!l && semAcento(l.status) === 'SUBSTITUIDO';
}

// Linha da PEDIDOS_ITENS como vale agora: item_id do CORTE (com nome e unidade da linha
// do CORTE) ou item_mudou. item_id_gravado guarda o id que esta na planilha.
// idx = indexarCorte(faltantes). Primeiro o id com CICLO = CORTE (se existir igual), depois
// os campos (correspondenteNoCorte).
function itemDoPedidoAtual(it, idx) {
  var id = texto(it.item_id);
  var atual = idx.porId[id];
  if (atual && !linhaSubstituida(atual)) return it;
  var corte = idx.porId[idNoCorte(id)];
  if (!corte || linhaSubstituida(corte)) corte = atual ? correspondenteNoCorte(atual, idx) : null;
  if (corte) {
    return Object.assign({}, it, {
      item_id: texto(corte.id), item_id_gravado: id,
      nome: texto(corte.descricao_item) || texto(it.nome), un: texto(corte.unidade) || texto(it.un)
    });
  }
  if (linhaSubstituida(atual)) return Object.assign({}, it, { item_mudou: true });
  return it;
}

// Id que a PEDIDOS_ITENS grava para este item (o do CORTE resolvido nao e gravado).
function idGravado(it) {
  return texto(it.item_id_gravado) || texto(it.item_id);
}

// O item do pedido pelo id que o site mandou: o atual ou (site aberto antes do corte) o gravado.
function itemDoPedidoPorId(itens, itemId) {
  return itens.filter(function (x) { return texto(x.item_id) === itemId; })[0] ||
    itens.filter(function (x) { return idGravado(x) === itemId; })[0];
}

function textoItemMudou(nome) {
  return nome + ' mudou no corte e não tem correspondente';
}

// [{ linha, id, itens: [linhas de PEDIDOS_ITENS] }], sem sementes. Com faltantes, os
// itens ja vem resolvidos para o ciclo atual (itemDoPedidoAtual).
function lerPedidos(pedidos, itens, faltantes) {
  var idxCorte = faltantes ? indexarCorte(faltantes) : null;
  var porId = {};
  var lista = [];
  (pedidos || []).forEach(function (p) {
    if (!p || !pedidoValido(p.id)) return;
    var id = texto(p.id);
    if (porId[id]) return;
    porId[id] = { linha: p, id: id, itens: [] };
    lista.push(porId[id]);
  });
  (itens || []).forEach(function (it) {
    if (!it) return;
    var pid = texto(it.pedido_id);
    if (!porId[pid] || texto(it.item_id) === '' || texto(it.deal_id) === '' || texto(it.deal_id) === '0') return;
    // qtd 0 = item que foi todo para uma parte do pedido (dividir_pedido).
    if (numero(it.qtd) === 0) return;
    porId[pid].itens.push(idxCorte ? itemDoPedidoAtual(it, idxCorte) : it);
  });
  return lista;
}

// Avisos de dados inconsistentes (corrida na geracao de ids, item em 2 pedidos).
function avisosPedidos(pedidos, itens, lista) {
  var avisos = [];
  var vistos = {};
  var jaAvisou = {};
  (pedidos || []).forEach(function (p) {
    if (!p || !pedidoValido(p.id)) return;
    var id = texto(p.id);
    if (vistos[id] && !jaAvisou[id]) {
      jaAvisou[id] = 1;
      avisos.push('Pedido ' + id + ' duplicado na planilha (gerado ao mesmo tempo?). Revise a aba PEDIDOS.');
    }
    vistos[id] = 1;
  });
  var porItem = {};
  var ordem = [];
  lista.forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      var k = texto(it.item_id);
      var fam = raizDoPedido(p.id);
      if (!porItem[k]) { porItem[k] = { ids: {}, n: 0, it: it }; ordem.push(k); }
      if (!porItem[k].ids[fam]) { porItem[k].ids[fam] = 1; porItem[k].n++; }
    });
  });
  ordem.forEach(function (k) {
    if (porItem[k].n > 1) {
      avisos.push('Item ' + texto(porItem[k].it.nome) + ' (OS ' + texto(porItem[k].it.os) + ') está em mais de um pedido aberto.');
    }
  });
  lista.forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      if (it.item_mudou) {
        avisos.push(p.id + ': ' + textoItemMudou(texto(it.nome) + ' (OS ' + texto(it.os) + ')') + ': confira o pedido.');
      }
    });
  });
  return avisos;
}

function pedidoAberto(p) {
  return texto(p.linha.baixado_em) === '';
}

// Pedido com baixa dada (entrou na etapa da baixa). Nao prende mais o item.
function pedidoBaixado(p) {
  return texto(p.linha.baixado_em) !== '';
}

// Pedido concluido (o destino confirmou o recebimento): finalizado, nao muda mais.
// Tambem conta o pedido que a API antiga levou para a ultima etapa (ela dava a baixa
// la e nao gravava concluido_em): etapa final + baixado_em, sem concluido_em.
function pedidoConcluido(p, etapas) {
  return texto(p.linha.concluido_em) !== '' || concluidoPelaApiAntiga(p.linha, etapas);
}

function concluidoPelaApiAntiga(linha, etapas) {
  var final = etapas && etapas.length ? etapaFinal(etapas) : null;
  return !!final && texto(linha.concluido_em) === '' && texto(linha.baixado_em) !== '' && texto(linha.etapa) === final.id;
}

// Etapas ja ordenadas (lerEtapas). Penultima: entrar nela da a baixa.
function etapaDaBaixa(etapas) {
  return etapas.length >= 2 ? etapas[etapas.length - 2] : null;
}

// Ultima: o destino confirmou o recebimento.
function etapaFinal(etapas) {
  return etapas[etapas.length - 1];
}

// Antepenultima ("Aguardando entrega"): so dela se divide um pedido.
function etapaDeDividir(etapas) {
  return etapas.length >= 3 ? etapas[etapas.length - 3] : null;
}

// item_id -> ids dos pedidos abertos que o contem, em ordem de numero
// (o pedido original e as partes dele podem ter o mesmo item).
function pedidosAbertosPorItem(lista) {
  var m = {};
  lista.slice().sort(function (a, b) { return compararPedidos(a.id, b.id); }).forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      var k = texto(it.item_id);
      m[k] = m[k] || [];
      if (m[k].indexOf(p.id) < 0) m[k].push(p.id);
    });
  });
  return m;
}

// item_id -> primeiro pedido aberto que o contem.
function pedidoAbertoPorItem(lista) {
  var todos = pedidosAbertosPorItem(lista);
  var m = {};
  Object.keys(todos).forEach(function (k) { m[k] = todos[k][0]; });
  return m;
}

// Datas distintas em ordem (aaaa-mm-dd ordena como texto); '' (sem previsao) por ultimo.
function previsoesDistintas(lista) {
  var vistas = {};
  var out = [];
  lista.forEach(function (d) { if (!vistas['_' + d]) { vistas['_' + d] = 1; out.push(d); } });
  return out.sort(function (a, b) {
    if (a === b) return 0;
    if (a === '') return 1;
    if (b === '') return -1;
    return a < b ? -1 : 1;
  });
}

// Previsao efetiva de uma linha da PEDIDOS_ITENS: a do item ou a do pedido.
function previsaoDoItem(it, linhaPedido, ano) {
  return dataISO(it.previsao, ano) || dataISO(linhaPedido.previsao, ano) || '';
}

// Board: pedidos, etapasPedido e o mapa item -> pedido aberto.
// faltantes: linhas da FALTANTES, para os itens seguirem o corte (itemDoPedidoAtual).
function montarPedidos(extras, ano, faltantes) {
  extras = extras || {};
  var etapas = lerEtapas(extras.etapas);
  var lista = lerPedidos(extras.pedidos, extras.pedidosItens, faltantes);
  var pedidos = lista.slice().sort(function (a, b) { return compararPedidos(a.id, b.id); })
    .map(function (p) {
      var l = p.linha;
      var baixadoEm = texto(l.baixado_em);
      // concluido pela API antiga: a data da baixa faz as vezes da conclusao
      var concluidoEm = texto(l.concluido_em) || (concluidoPelaApiAntiga(l, etapas) ? baixadoEm : '');
      var etapa = texto(l.etapa);
      var previsao = dataISO(l.previsao, ano);
      var itens = p.itens.map(function (it) {
        var q = numero(it.qtd);
        var item = {
          itemId: texto(it.item_id),
          dealId: texto(it.deal_id),
          os: texto(it.os),
          nome: texto(it.nome),
          un: texto(it.un),
          qtd: q === null || isNaN(q) ? null : q,
          fornecedor: texto(it.fornecedor),
          // previsao efetiva: a do item ou, vazia, a do pedido
          previsao: dataISO(it.previsao, ano) || previsao
        };
        // o item saiu no corte e nao tem correspondente: fica sem baixa
        if (it.item_mudou) item.itemMudou = true;
        return item;
      });
      var datas = previsoesDistintas(itens.map(function (i) { return i.previsao; }));
      return {
        id: p.id,
        pai: texto(l.pai),
        etapa: etapa,
        origem: semAcento(l.origem),
        quem: texto(l.quem),
        local: semAcento(l.local).replace(/\s+/g, '_'),
        previsao: previsao,
        previsaoMaisProxima: datas.length && datas[0] !== '' ? datas[0] : previsao,
        previsoesDiferentes: datas.length > 1,
        responsavel: texto(l.responsavel),
        criadoEm: texto(l.criado_em),
        baixadoEm: baixadoEm,
        concluidoEm: concluidoEm,
        versao: texto(l.atualizado_em),
        // finalizado = concluido (o destino confirmou); com so a baixa o pedido segue aberto
        finalizado: concluidoEm !== '',
        itens: itens
      };
    });
  return { pedidos: pedidos, etapasPedido: etapas, abertoPorItem: pedidoAbertoPorItem(lista),
    avisos: avisosPedidos(extras.pedidos, extras.pedidosItens, lista) };
}

// ---------- validacao do corpo ----------

function textoCurto(v, max, erro) {
  if (v === undefined || v === null) return { ok: true, valor: '' };
  if (typeof v !== 'string') return { ok: false, erro: erro };
  var t = v.trim().replace(/(\r\n|\n|\r)+/g, ' ');
  if (t.length > max) return { ok: false, erro: erro };
  return { ok: true, valor: t };
}

function qtdValida(v) {
  var n = typeof v === 'number' ? v : numero(v);
  if (n === null || !isFinite(n)) return null;
  n = arredondar(n);
  return n > 0 ? n : null;
}

// Fornecedor (ou cliente) e responsavel sao obrigatorios no pedido.
var ERRO_SEM_RESPONSAVEL = 'Informe o responsável.';
function erroQuemVazio(origem) {
  return origem === 'CLIENTE' ? 'Informe o cliente.' : 'Informe o fornecedor.';
}

// Normaliza um campo do pedido; { ok, valor } ou { ok: false, erro }.
function campoPedido(nome, v) {
  if (nome === 'origem') {
    var o = semAcento(v);
    return ORIGENS[o] ? { ok: true, valor: o } : { ok: false, erro: 'Origem inválida.' };
  }
  if (nome === 'local') {
    var l = semAcento(v).replace(/\s+/g, '_');
    return LOCAIS[l] ? { ok: true, valor: l } : { ok: false, erro: 'Local inválido.' };
  }
  if (nome === 'previsao') {
    var p = v === null || v === undefined ? '' : texto(v);
    return p === '' || dataValida(p) ? { ok: true, valor: p } : { ok: false, erro: 'Data inválida.' };
  }
  if (nome === 'quem') return textoCurto(v, 100, 'Fornecedor/cliente inválido.');
  return textoCurto(v, 100, 'Responsável inválido.');
}

// Deals citados no proprio corpo (para o 403 antes de ler a planilha).
function dealsDoCorpo(corpo) {
  if (!corpo || typeof corpo !== 'object') return [];
  if (corpo.tipo === 'gerar_pedido') {
    return (Array.isArray(corpo.itens) ? corpo.itens : []).map(function (i) { return texto(i && i.dealId); })
      .filter(function (d) { return d !== ''; });
  }
  return [];
}

function validarAcaoPedido(corpo) {
  if (!corpo || typeof corpo !== 'object') return erroAcao(400, 'Corpo inválido.');
  var tipo = corpo.tipo;
  if (TIPOS_PEDIDO.indexOf(tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var acao = { tipo: tipo };
  var r;
  var i;

  if (tipo === 'nova_demanda') {
    acao.os = texto(corpo.os);
    if (!acao.os) return erroAcao(400, 'Informe a OS.');
    acao.caixa = semAcento(corpo.caixa);
    if (!NOMES_CAIXA[acao.caixa]) return erroAcao(400, 'Escolha o tipo de caixa.');
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) return erroAcao(400, 'Informe ao menos um item.');
    if (corpo.itens.length > MAX_ITENS_DEMANDA) return erroAcao(400, 'No máximo 30 itens por demanda.');
    acao.itens = [];
    for (i = 0; i < corpo.itens.length; i++) {
      var d = corpo.itens[i] || {};
      var rn = textoCurto(d.nome, 100, 'Nome do item muito longo.');
      if (!rn.ok) return erroAcao(400, rn.erro);
      if (!rn.valor) return erroAcao(400, 'Informe o nome do item.');
      var rc = textoCurto(d.cor, 40, 'Cor muito longa.');
      if (!rc.ok) return erroAcao(400, rc.erro);
      var qn = qtdValida(d.qtd);
      if (qn === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      var ru = textoCurto(d.un, 10, 'Unidade muito longa.');
      if (!ru.ok) return erroAcao(400, ru.erro);
      if (!ru.valor) return erroAcao(400, 'Informe a unidade do item.');
      acao.itens.push({ nome: rn.valor, cor: rc.valor, qtd: qn, un: ru.valor });
    }
    return { ok: true, acao: acao };
  }

  if (tipo === 'salvar_etapas') {
    if (!Array.isArray(corpo.etapas)) return erroAcao(400, 'Etapas inválidas.');
    var vistosNome = {};
    var vistosId = {};
    acao.etapas = [];
    for (i = 0; i < corpo.etapas.length; i++) {
      var e = corpo.etapas[i] || {};
      var nome = typeof e.nome === 'string' ? e.nome.trim() : '';
      if (!nome) return erroAcao(400, 'Toda etapa precisa de um nome.');
      if (nome.length > 60) return erroAcao(400, 'Nome de etapa muito longo.');
      var chave = semAcento(nome);
      if (vistosNome[chave]) return erroAcao(400, 'Já existe uma etapa com o nome ' + nome + '.');
      vistosNome[chave] = 1;
      var id = texto(e.id);
      if (id) {
        if (vistosId[id]) return erroAcao(400, 'Etapa repetida.');
        vistosId[id] = 1;
      }
      acao.etapas.push({ id: id, nome: nome });
    }
    if (acao.etapas.length < 3) return erroAcao(400, 'O quadro precisa de pelo menos 3 etapas.');
    return { ok: true, acao: acao };
  }

  if (tipo === 'gerar_pedido') {
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) return erroAcao(400, 'Selecione ao menos um item.');
    acao.itens = [];
    var vistos = {};
    for (i = 0; i < corpo.itens.length; i++) {
      var it = corpo.itens[i] || {};
      var itemId = texto(it.itemId);
      var dealId = texto(it.dealId);
      if (!itemId || !dealId) return erroAcao(400, 'Item não informado.');
      if (vistos[itemId]) return erroAcao(400, 'Item repetido no pedido.');
      vistos[itemId] = 1;
      var q = qtdValida(it.qtd);
      if (q === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      r = textoCurto(it.fornecedor, 100, 'Fornecedor inválido.');
      if (!r.ok) return erroAcao(400, r.erro);
      var rp = campoPedido('previsao', it.previsao);
      if (!rp.ok) return erroAcao(400, rp.erro);
      acao.itens.push({ itemId: itemId, dealId: dealId, qtd: q, fornecedor: r.valor, previsao: rp.valor });
    }
    acao.campos = {};
    var nomes = ['origem', 'quem', 'local', 'previsao', 'responsavel'];
    for (i = 0; i < nomes.length; i++) {
      r = campoPedido(nomes[i], corpo[nomes[i]]);
      if (!r.ok) return erroAcao(400, r.erro);
      acao.campos[nomes[i]] = r.valor;
    }
    if (!acao.campos.quem) return erroAcao(400, erroQuemVazio(acao.campos.origem));
    if (!acao.campos.responsavel) return erroAcao(400, ERRO_SEM_RESPONSAVEL);
    return { ok: true, acao: acao };
  }

  acao.pedidoId = texto(corpo.pedidoId);
  if (!acao.pedidoId) return erroAcao(400, 'Pedido não informado.');
  acao.versao = texto(corpo.versao);
  // O site novo so manda confirmouBaixa: true depois da confirmacao da baixa.
  acao.confirmouBaixa = corpo.confirmouBaixa === true;

  if (tipo === 'mover_pedido') {
    acao.etapa = texto(corpo.etapa);
    if (!acao.etapa) return erroAcao(400, 'Etapa inválida.');
  } else if (tipo === 'dividir_pedido') {
    // A parte vai sempre para a etapa da baixa. O site novo nao manda "etapa"; o antigo
    // mandava a etapa escolhida, recusada (409) se nao for a da baixa (aplicarDivisao).
    if (corpo.etapa !== undefined && corpo.etapa !== null) acao.etapaDoCorpo = texto(corpo.etapa);
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) return erroAcao(400, 'Itens inválidos.');
    if (!corpo.itens || !corpo.itens.length) return erroAcao(400, 'Marque ao menos um item que chegou.');
    acao.itens = [];
    var vistosD = {};
    for (i = 0; i < corpo.itens.length; i++) {
      var idv = corpo.itens[i] || {};
      var did = texto(idv.itemId);
      if (!did) return erroAcao(400, 'Item não informado.');
      if (vistosD[did]) return erroAcao(400, 'Item repetido no pedido.');
      vistosD[did] = 1;
      var qd = qtdValida(idv.qtd);
      if (qd === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      acao.itens.push({ itemId: did, qtd: qd });
    }
  } else if (tipo === 'editar_pedido') {
    var campos = corpo.campos && typeof corpo.campos === 'object' ? corpo.campos : {};
    if (Object.prototype.hasOwnProperty.call(campos, 'etapa')) return erroAcao(400, ERRO_ETAPA_PELO_CARD);
    acao.campos = {};
    for (i = 0; i < CAMPOS_PEDIDO.length; i++) {
      var n = CAMPOS_PEDIDO[i];
      if (!Object.prototype.hasOwnProperty.call(campos, n)) continue;
      r = campoPedido(n, campos[n]);
      if (!r.ok) return erroAcao(400, r.erro);
      acao.campos[n] = r.valor;
    }
    acao.itens = [];
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) return erroAcao(400, 'Itens inválidos.');
    var vistosE = {};
    for (i = 0; i < (corpo.itens || []).length; i++) {
      var ie = corpo.itens[i] || {};
      var iid = texto(ie.itemId);
      if (!iid) return erroAcao(400, 'Item não informado.');
      if (vistosE[iid]) return erroAcao(400, 'Item repetido no pedido.');
      vistosE[iid] = 1;
      var mud = { itemId: iid };
      if (ie.qtd !== undefined) {
        var qe = qtdValida(ie.qtd);
        if (qe === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
        mud.qtd = qe;
      }
      if (ie.fornecedor !== undefined) {
        r = textoCurto(ie.fornecedor, 100, 'Fornecedor inválido.');
        if (!r.ok) return erroAcao(400, r.erro);
        mud.fornecedor = r.valor;
      }
      if (ie.previsao !== undefined) {
        r = campoPedido('previsao', ie.previsao);
        if (!r.ok) return erroAcao(400, r.erro);
        mud.previsao = r.valor;
      }
      acao.itens.push(mud);
    }
    if (!Object.keys(acao.campos).length && !acao.itens.length) return erroAcao(400, 'Nada alterado.');
  }
  return { ok: true, acao: acao };
}

// ---------- aplicacao ----------

function restaDaLinha(l) {
  var falta = numero(l.qtd_falta);
  var bx = numero(l.qtd_baixada);
  if (falta === null || isNaN(falta) || (bx !== null && isNaN(bx))) return null;
  return arredondar(Math.max(0, falta - (bx || 0)));
}

function linhaHistorico(ctx, dealId, os, itemId, tipo, txt) {
  return {
    id: ctx.gerarId(),
    quando: ctx.agora,
    usuario: ctx.usuario,
    email: ctx.email,
    deal_id: dealId,
    os: os,
    item_id: itemId || '',
    acao: tipo,
    texto: txt,
    ploomes_status: 'PENDENTE',
    ploomes_id: '',
    tentativas: 0,
    erro: ''
  };
}

// Agrupa por deal_id, na ordem em que aparecem: [{ dealId, os, itens }].
function porOS(itens, dealDe, osDe) {
  var grupos = {};
  var ordem = [];
  itens.forEach(function (it) {
    var d = dealDe(it);
    if (!grupos[d]) { grupos[d] = { dealId: d, os: osDe(it), itens: [] }; ordem.push(d); }
    grupos[d].itens.push(it);
  });
  return ordem.map(function (d) { return grupos[d]; });
}

function op(aba, operacao, chave, linha) {
  return { aba: aba, operacao: operacao, chave: chave, linha: linha };
}

function primeiroNaoEditavel(deals) {
  for (var i = 0; i < deals.length; i++) if (!dealEditavel(deals[i])) return deals[i];
  return null;
}

function mostrarCampo(nome, v, etapas) {
  if (v === '') return '—';
  if (nome === 'etapa') {
    var e = etapas.filter(function (x) { return x.id === v; })[0];
    return e ? e.nome : v;
  }
  if (nome === 'origem') return ORIGENS[v] || v;
  if (nome === 'local') return LOCAIS[v] || v;
  if (nome === 'previsao') return dataValida(v) ? dataCurta(v) : v;
  return v;
}

function valorAtualCampo(linha, nome, ano) {
  if (nome === 'origem') return semAcento(linha.origem);
  if (nome === 'local') return semAcento(linha.local).replace(/\s+/g, '_');
  if (nome === 'previsao') return dataISO(linha.previsao, ano) || texto(linha.previsao);
  return texto(linha[nome]);
}

// linhas = { faltantes, caixasPcp, ganhas, pedidos, pedidosItens, etapas }
// ctx = { usuario, email, agora (ISO), gerarId }
function aplicarAcaoPedido(acao, linhas, ctx) {
  linhas = linhas || {};
  var u = ctx.usuario;
  var agora = ctx.agora;
  var faltantesPorId = indexarFaltantes(linhas.faltantes);
  var etapas = lerEtapas(linhas.etapas);
  // itens ja no ciclo atual: o pedido feito antes do corte da baixa no item do CORTE
  var lista = lerPedidos(linhas.pedidos, linhas.pedidosItens, linhas.faltantes || []);
  var abertos = pedidoAbertoPorItem(lista);
  var tipo = acao.tipo;

  if (tipo === 'salvar_etapas') return aplicarEtapas(acao, linhas, ctx, lista);
  if (tipo === 'nova_demanda') return aplicarNovaDemanda(acao, linhas, ctx);

  if (tipo === 'gerar_pedido') {
    var deals = acao.itens.map(function (i) { return i.dealId; });
    if (primeiroNaoEditavel(deals) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
    var pid = proximoIdPedido(linhas.pedidos);
    var linhasItens = [];
    for (var i = 0; i < acao.itens.length; i++) {
      var it = acao.itens[i];
      var l = faltantesPorId[it.itemId];
      if (!l || texto(l.deal_id) !== it.dealId || semAcento(l.status) === 'SUBSTITUIDO') {
        return erroAcao(409, 'Item não encontrado.');
      }
      if (abertos[it.itemId]) return erroAcao(409, 'Item já está no ' + abertos[it.itemId] + '.');
      if (!STATUS_ABERTOS[semAcento(l.status)]) return erroAcao(409, 'Item já resolvido.');
      var resta = restaDaLinha(l);
      if (resta === null) return erroAcao(400, 'Item sem quantidade faltante registrada.');
      if (resta <= 0) return erroAcao(409, 'Item já resolvido.');
      if (it.qtd > resta) {
        return erroAcao(400, 'Falta só ' + formatarQtd(resta) + ' ' + texto(l.unidade) + ' de ' + texto(l.descricao_item));
      }
      linhasItens.push({
        id: pid + '|' + it.itemId, pedido_id: pid, item_id: it.itemId, deal_id: it.dealId, os: texto(l.os),
        nome: texto(l.descricao_item), un: texto(l.unidade), qtd: it.qtd, fornecedor: it.fornecedor, previsao: it.previsao
      });
    }
    var c = acao.campos;
    var operacoes = [op('PEDIDOS', 'append', 'id', {
      id: pid, etapa: etapas[0].id, origem: c.origem, quem: c.quem, local: c.local, previsao: c.previsao,
      responsavel: c.responsavel, criado_em: agora, criado_por: u, baixado_em: '', atualizado_em: agora
    })].concat(linhasItens.map(function (li) { return op('PEDIDOS_ITENS', 'append', 'id', li); }));
    var historicos = porOS(linhasItens, function (x) { return x.deal_id; }, function (x) { return x.os; })
      .map(function (g) {
        var n = g.itens.length;
        var txt = u + ' gerou ' + pid + ' · ' + n + (n === 1 ? ' item' : ' itens') + ' desta OS · ' +
          ORIGENS[c.origem] + (c.quem ? ' ' + c.quem : '');
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, txt);
      });
    return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: pid };
  }

  // editar / mover / baixar / dividir: pedido existente
  var p = lista.filter(function (x) { return x.id === acao.pedidoId; })[0];
  if (!p) return erroAcao(404, 'Pedido não encontrado.');
  if (!p.itens.length) return erroAcao(409, 'Pedido sem itens válidos.');
  var dealsP = p.itens.map(function (x) { return texto(x.deal_id); });
  if (primeiroNaoEditavel(dealsP) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
  if (pedidoConcluido(p, etapas)) return erroAcao(409, 'Pedido finalizado não pode ser alterado.');
  var baixa = etapaDaBaixa(etapas);
  var final = etapaFinal(etapas);
  // Com a baixa dada o pedido so anda para a etapa final (o destino confirmou).
  if (pedidoBaixado(p) && !(tipo === 'mover_pedido' && acao.etapa === final.id)) {
    return erroAcao(409, 'Pedido com baixa só pode ir para ' + final.nome + '.');
  }
  // Site antigo: baixa sem a confirmacao do site novo, ou divisao para outra etapa.
  var entraNaBaixa = !!baixa && ((tipo === 'mover_pedido' && acao.etapa === baixa.id) || tipo === 'baixar_pedido');
  if (entraNaBaixa && !acao.confirmouBaixa) return erroAcao(409, ERRO_SITE_ANTIGO);
  if (tipo === 'dividir_pedido' && acao.etapaDoCorpo !== undefined && (!baixa || acao.etapaDoCorpo !== baixa.id)) {
    return erroAcao(409, ERRO_SITE_ANTIGO);
  }
  if (acao.versao !== texto(p.linha.atualizado_em)) return erroAcao(409, ERRO_VERSAO_PEDIDO);
  var grupos = porOS(p.itens, function (x) { return texto(x.deal_id); }, function (x) { return texto(x.os); });
  function existeEtapa(id) { return etapas.some(function (e) { return e.id === id; }); }

  if (tipo === 'dividir_pedido') return aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId);
  if (tipo === 'dividir_por_previsao') return aplicarDivisaoPorPrevisao(acao, linhas, ctx, p);

  if (tipo === 'mover_pedido') {
    if (!existeEtapa(acao.etapa)) return erroAcao(400, 'Etapa inválida.');
    if (acao.etapa === texto(p.linha.etapa)) return erroAcao(400, 'O pedido já está nessa etapa.');
    var nomeEtapa = mostrarCampo('etapa', acao.etapa, etapas);
    var linhaMov = { id: p.id, etapa: acao.etapa, atualizado_em: agora };
    var bxM = { operacoes: [], partes: {} };
    if (acao.etapa === final.id) {
      // Etapa final: o destino confirmou. A baixa ja foi dada na etapa anterior.
      if (!pedidoBaixado(p)) return erroAcao(400, 'Mova o pedido primeiro para ' + (baixa ? baixa.nome : final.nome) + '.');
      linhaMov = { id: p.id, etapa: acao.etapa, concluido_em: agora, atualizado_em: agora };
    } else if (baixa && acao.etapa === baixa.id) {
      // Entrar na etapa da baixa (Enviado ao destino final) da a baixa nas caixas.
      bxM = baixaDosItens(p.itens, faltantesPorId, agora);
      if (!bxM.ok) return bxM;
      linhaMov = { id: p.id, etapa: acao.etapa, baixado_em: agora, atualizado_em: agora };
    }
    return {
      ok: true,
      operacoes: bxM.operacoes.concat([op('PEDIDOS', 'update', 'id', linhaMov)]),
      historicos: grupos.map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' moveu ' + p.id + ' para ' + nomeEtapa +
          textoBaixa(bxM.partes[g.dealId], (bxM.mudados || {})[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  if (tipo === 'baixar_pedido') {
    // Mantido por compatibilidade; o app da baixa movendo para a etapa da baixa.
    if (!baixa || texto(p.linha.etapa) !== baixa.id) return erroAcao(400, 'Dar baixa só na etapa ' + (baixa ? baixa.nome : final.nome) + '.');
    var bx = baixaDosItens(p.itens, faltantesPorId, agora);
    if (!bx.ok) return bx;
    return {
      ok: true,
      operacoes: bx.operacoes.concat([op('PEDIDOS', 'update', 'id', { id: p.id, baixado_em: agora, atualizado_em: agora })]),
      historicos: grupos.filter(function (g) { return bx.partes[g.dealId] || bx.mudados[g.dealId]; }).map(function (g) {
        var feitas = bx.partes[g.dealId] ? bx.partes[g.dealId].join('; ') : 'nenhum item';
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' deu baixa do ' + p.id + ': ' + feitas + textoSemBaixa(bx.mudados[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  // editar_pedido
  var mudPedido = {};
  var resumoPedido = [];
  var erroCampo = '';
  CAMPOS_PEDIDO.forEach(function (n) {
    if (!Object.prototype.hasOwnProperty.call(acao.campos, n)) return;
    var antes = valorAtualCampo(p.linha, n, new Date(agora).getFullYear());
    var depois = acao.campos[n];
    if (antes === depois) return;
    // nao deixa limpar o fornecedor/cliente nem o responsavel
    if (depois === '' && n === 'quem') {
      erroCampo = erroQuemVazio(acao.campos.origem || valorAtualCampo(p.linha, 'origem', new Date(agora).getFullYear()));
    } else if (depois === '' && n === 'responsavel') {
      erroCampo = ERRO_SEM_RESPONSAVEL;
    }
    mudPedido[n] = depois;
    resumoPedido.push(NOMES_CAMPO[n] + ': ' + mostrarCampo(n, antes, etapas) + ' → ' + mostrarCampo(n, depois, etapas));
  });
  if (erroCampo) return erroAcao(400, erroCampo);
  var ano = new Date(agora).getFullYear();
  var previsaoPedidoDepois = mudPedido.previsao !== undefined ? mudPedido.previsao : valorAtualCampo(p.linha, 'previsao', ano);
  var opsItens = [];
  var resumoItens = {};
  for (var j = 0; j < acao.itens.length; j++) {
    var mi = acao.itens[j];
    var linhaPi = itemDoPedidoPorId(p.itens, mi.itemId);
    if (!linhaPi) return erroAcao(400, 'Item não está no pedido.');
    var nomeItem = texto(linhaPi.nome);
    var mud = {};
    var res = [];
    var qAntes = numero(linhaPi.qtd);
    if (mi.qtd !== undefined && mi.qtd !== qAntes) {
      // sem item atual nao ha resta para conferir
      if (linhaPi.item_mudou) return erroAcao(409, textoItemMudou(nomeItem) + ': a quantidade não pode mudar.');
      var lfe = faltantesPorId[texto(linhaPi.item_id)];
      if (!lfe) return erroAcao(409, 'Item não encontrado.');
      var re = restaDaLinha(lfe);
      if (re === null) return erroAcao(400, 'Item sem quantidade faltante registrada.');
      if (mi.qtd > re) return erroAcao(400, 'Falta só ' + formatarQtd(re) + ' ' + texto(lfe.unidade) + ' de ' + nomeItem);
      mud.qtd = mi.qtd;
      res.push('qtd de ' + nomeItem + ': ' + (qAntes === null || isNaN(qAntes) ? '—' : formatarQtd(qAntes)) + ' → ' + formatarQtd(mi.qtd));
    }
    var fAntes = texto(linhaPi.fornecedor);
    if (mi.fornecedor !== undefined && mi.fornecedor !== fAntes) {
      mud.fornecedor = mi.fornecedor;
      res.push('fornecedor de ' + nomeItem + ': ' + (fAntes || '—') + ' → ' + (mi.fornecedor || '—'));
    }
    if (mi.previsao !== undefined) {
      // compara a previsao efetiva (vazia = a do pedido, ja com a mudanca deste editar)
      var pvAntes = previsaoDoItem(linhaPi, p.linha, ano);
      var pvDepois = mi.previsao || previsaoPedidoDepois;
      if (pvAntes !== pvDepois) {
        mud.previsao = mi.previsao;
        res.push('previsão de ' + nomeItem + ': ' + mostrarCampo('previsao', pvAntes, etapas) + ' → ' + mostrarCampo('previsao', pvDepois, etapas));
      }
    }
    if (!res.length) continue;
    opsItens.push(op('PEDIDOS_ITENS', 'update', 'id', Object.assign({ id: texto(linhaPi.id) || p.id + '|' + idGravado(linhaPi) }, mud)));
    var dd = texto(linhaPi.deal_id);
    resumoItens[dd] = (resumoItens[dd] || []).concat(res);
  }
  if (!resumoPedido.length && !opsItens.length) return erroAcao(400, 'Nada alterado.');
  return {
    ok: true,
    operacoes: [op('PEDIDOS', 'update', 'id', Object.assign({ id: p.id }, mudPedido, { atualizado_em: agora }))].concat(opsItens),
    historicos: grupos.map(function (g) {
      var resumo = resumoPedido.concat(resumoItens[g.dealId] || []);
      return resumo.length ? linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' alterou ' + p.id + ': ' + resumo.join(', ')) : null;
    }).filter(function (h) { return h; }),
    versao: agora,
    pedidoId: p.id
  };
}

// Baixa dos itens de um pedido na FALTANTES: soma min(qtd, resta) em qtd_baixada
// (pula SUBSTITUIDO e quem nao tem falta registrada). itens = linhas da
// PEDIDOS_ITENS ja no ciclo atual (lerPedidos com faltantes). Devolve { ok, operacoes,
// partes: { dealId: ['20 MT de VIÉS (resta 80 MT)'] }, mudados: { dealId: ['LINHA'] } }
// ou o erro. mudados = itens que sairam no corte sem correspondente: ficam sem baixa
// (a linha antiga SUBSTITUIDO nao recebe nada) e o historico diz isso.
function baixaDosItens(itens, faltantesPorId, agora) {
  var operacoes = [];
  var partes = {};
  var mudados = {};
  for (var k = 0; k < itens.length; k++) {
    var pi = itens[k];
    if (pi.item_mudou) {
      var dm = texto(pi.deal_id);
      (mudados[dm] = mudados[dm] || []).push(texto(pi.nome));
      continue;
    }
    var lf = faltantesPorId[texto(pi.item_id)];
    if (!lf || !STATUS_ABERTOS[semAcento(lf.status)]) continue;
    var falta = numero(lf.qtd_falta);
    var bx = numero(lf.qtd_baixada);
    if (bx !== null && isNaN(bx)) return erroAcao(400, 'Baixa registrada ilegível na planilha.');
    if (falta === null || isNaN(falta)) continue;
    bx = bx || 0;
    var r0 = arredondar(Math.max(0, falta - bx));
    var q = numero(pi.qtd);
    q = q === null || isNaN(q) ? 0 : q;
    var dar = arredondar(Math.min(q, r0));
    if (dar <= 0) continue;
    operacoes.push(op('FALTANTES', 'update', 'id', { id: texto(lf.id), qtd_baixada: arredondar(bx + dar), atualizado_em_app: agora }));
    var un = texto(lf.unidade);
    var d = texto(pi.deal_id);
    (partes[d] = partes[d] || []).push(formatarQtd(dar) + ' ' + un + ' de ' + texto(lf.descricao_item) +
      ' (resta ' + formatarQtd(arredondar(r0 - dar)) + ' ' + un + ')');
  }
  return { ok: true, operacoes: operacoes, partes: partes, mudados: mudados };
}

// " e deu baixa: 20 MT de VIÉS (resta 80 MT)" ou '' quando a OS nao teve baixa; mais
// " · sem baixa: LINHA mudou no corte e não tem correspondente" com item que mudou.
function textoBaixa(partes, mudados) {
  return (partes && partes.length ? ' e deu baixa: ' + partes.join('; ') : '') + textoSemBaixa(mudados);
}

function textoSemBaixa(mudados) {
  return mudados && mudados.length ? ' · sem baixa: ' + mudados.map(textoItemMudou).join('; ') : '';
}

// Linha da parte nova na PEDIDOS, copiando os dados do pedido.
function linhaParte(p, filho, raiz, etapaId, previsao, agora, u, baixado) {
  var l = p.linha;
  var ano = new Date(agora).getFullYear();
  return op('PEDIDOS', 'append', 'id', {
    id: filho, etapa: etapaId, origem: valorAtualCampo(l, 'origem', ano), quem: texto(l.quem),
    local: valorAtualCampo(l, 'local', ano), previsao: previsao, responsavel: texto(l.responsavel),
    criado_em: agora, criado_por: u, baixado_em: baixado ? agora : '', atualizado_em: agora, pai: raiz
  });
}

// Linha do item na parte nova (leva a previsao propria do item).
function linhaItemParte(x, filho, qtd, ano) {
  return op('PEDIDOS_ITENS', 'append', 'id', {
    id: filho + '|' + texto(x.item_id), pedido_id: filho, item_id: texto(x.item_id), deal_id: texto(x.deal_id), os: texto(x.os),
    nome: texto(x.nome), un: texto(x.un), qtd: qtd, fornecedor: texto(x.fornecedor), previsao: dataISO(x.previsao, ano) || ''
  });
}

// dividir_pedido: o que chegou (itens ou parte da quantidade) vira um pedido novo da
// mesma familia (PED-0002 -> PED-0002.k), ja na etapa da baixa e com a baixa nas caixas.
// So da etapa anterior a da baixa ("Aguardando entrega"). O pedido dividido fica com o
// resto; linha com qtd 0 e ignorada na leitura. Dividir uma parte cria outra parte da raiz.
function aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var de = etapaDeDividir(etapas);
  var baixa = etapaDaBaixa(etapas);
  if (!de || !baixa || texto(p.linha.etapa) !== de.id) {
    return erroAcao(400, 'Dividir só com o pedido em ' + (de ? de.nome : 'Aguardando entrega') + '.');
  }
  var porItem = {};
  p.itens.forEach(function (x) { if (!porItem[texto(x.item_id)]) porItem[texto(x.item_id)] = x; });
  var movidos = [];
  for (var i = 0; i < acao.itens.length; i++) {
    var mi = acao.itens[i];
    var li = porItem[mi.itemId] || itemDoPedidoPorId(p.itens, mi.itemId);
    if (!li) return erroAcao(400, 'Item não está no pedido.');
    var q = numero(li.qtd);
    if (q === null || isNaN(q)) return erroAcao(400, 'Item sem quantidade no pedido.');
    if (mi.qtd > q) return erroAcao(400, 'O pedido tem só ' + formatarQtd(q) + ' ' + texto(li.un) + ' de ' + texto(li.nome) + '.');
    movidos.push({ linha: li, qtd: mi.qtd, resta: arredondar(q - mi.qtd) });
  }
  var sobra = p.itens.some(function (x) {
    var m = movidos.filter(function (y) { return y.linha === x; })[0];
    return !m || m.resta > 0;
  });
  if (!sobra) return erroAcao(400, 'Para mover o pedido inteiro, arraste o card.');

  var bx = baixaDosItens(movidos.map(function (m) { return Object.assign({}, m.linha, { qtd: m.qtd }); }), faltantesPorId, agora);
  if (!bx.ok) return bx;
  var raiz = raizDoPedido(p.id);
  var filho = proximoIdFilho(linhas.pedidos, raiz);
  var ano = new Date(agora).getFullYear();
  var operacoes = [linhaParte(p, filho, raiz, baixa.id, valorAtualCampo(p.linha, 'previsao', ano), agora, u, true)];
  movidos.forEach(function (m) { operacoes.push(linhaItemParte(m.linha, filho, m.qtd, ano)); });
  movidos.forEach(function (m) {
    operacoes.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(m.linha.id) || p.id + '|' + idGravado(m.linha), qtd: m.resta }));
  });
  operacoes.push(op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora }));
  operacoes = operacoes.concat(bx.operacoes);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var partes = g.itens.map(function (m) { return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome); });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo,
        u + ' dividiu ' + p.id + ': ' + partes.join('; ') + ' foram para ' + filho + ' (' + baixa.nome + ')' +
          textoBaixa(bx.partes[g.dealId], bx.mudados[g.dealId]));
    });
  return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: filho };
}

// dividir_por_previsao: agrupa os itens pela previsao efetiva; o grupo da data
// mais proxima fica no pedido e cada outra data vira uma parte (na etapa do
// pedido, com a previsao do grupo). Sem data vai por ultimo.
function aplicarDivisaoPorPrevisao(acao, linhas, ctx, p) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var ano = new Date(agora).getFullYear();
  var datas = previsoesDistintas(p.itens.map(function (x) { return previsaoDoItem(x, p.linha, ano); }));
  if (datas.length < 2) return erroAcao(400, 'Os itens têm a mesma previsão.');
  var raiz = raizDoPedido(p.id);
  var existentes = (linhas.pedidos || []).slice();
  var operacoes = [];
  var zerar = [];
  var movidos = [];
  var partes = [];
  datas.slice(1).forEach(function (d) {
    var filho = proximoIdFilho(existentes, raiz);
    existentes.push({ id: filho });
    partes.push(filho);
    operacoes.push(linhaParte(p, filho, raiz, texto(p.linha.etapa), d, agora, u, false));
    p.itens.forEach(function (x) {
      if (previsaoDoItem(x, p.linha, ano) !== d) return;
      var q = numero(x.qtd);
      q = q === null || isNaN(q) ? 0 : q;
      operacoes.push(linhaItemParte(x, filho, q, ano));
      zerar.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(x.id) || p.id + '|' + idGravado(x), qtd: 0 }));
      movidos.push({ linha: x, qtd: q, filho: filho, data: d });
    });
  });
  operacoes = operacoes.concat(zerar, [op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora })]);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var txt = g.itens.map(function (m) {
        return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome) + ' foram para ' + m.filho +
          ' (' + (m.data ? 'previsão ' + dataCurta(m.data) : 'sem previsão') + ')';
      });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo, u + ' dividiu ' + p.id + ' por previsão: ' + txt.join('; '));
    });
  return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: partes[0], partes: partes };
}

function slugEtapa(nome) {
  var s = semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'etapa';
}

var ERRO_ETAPAS_SO_ADM = 'Só administradores podem alterar as etapas do quadro.';

function aplicarEtapas(acao, linhas, ctx, lista) {
  if (texto(ctx.perfil).toUpperCase() !== 'ADM') return erroAcao(403, ERRO_ETAPAS_SO_ADM);
  var temLinhas = (linhas.etapas || []).some(function (e) { return e && texto(e.id) !== '' && texto(e.nome) !== ''; });
  var atuais = lerEtapas(linhas.etapas);
  var idsAtuais = {};
  atuais.forEach(function (e) { idsAtuais[e.id] = e; });
  var usados = {};
  atuais.forEach(function (e) { usados[e.id] = 1; });
  var i;
  for (i = 0; i < acao.etapas.length; i++) {
    if (acao.etapas[i].id && !idsAtuais[acao.etapas[i].id]) return erroAcao(400, 'Etapa inválida.');
  }
  // As duas ultimas (a da baixa e a final) ficam sempre no fim, nessa ordem.
  var n = acao.etapas.length;
  if (atuais.length >= 2) {
    var baixaAtual = atuais[atuais.length - 2];
    var finalAtual = atuais[atuais.length - 1];
    if (acao.etapas[n - 2].id !== baixaAtual.id || acao.etapas[n - 1].id !== finalAtual.id) {
      return erroAcao(400, 'As etapas ' + baixaAtual.nome + ' e ' + finalAtual.nome + ' precisam continuar no fim, nessa ordem.');
    }
  }
  var mantidas = {};
  acao.etapas.forEach(function (e) { if (e.id) mantidas[e.id] = 1; });
  var removidas = atuais.filter(function (e) { return !mantidas[e.id]; });
  for (i = 0; i < removidas.length; i++) {
    var rid = removidas[i].id;
    var comPedido = lista.some(function (p) { return !pedidoConcluido(p, atuais) && texto(p.linha.etapa) === rid; });
    if (comPedido) return erroAcao(409, 'A etapa ' + removidas[i].nome + ' tem pedidos abertos.');
  }
  var operacoes = acao.etapas.map(function (e, idx) {
    var id = e.id;
    if (!id) {
      var base = slugEtapa(e.nome);
      id = base;
      var n = 2;
      while (usados[id]) id = base + '_' + (n++);
      usados[id] = 1;
    }
    return op('ETAPAS_PEDIDO', 'appendOrUpdate', 'id', { id: id, nome: e.nome, ordem: idx + 1 });
  });
  // Removidas: a linha fica com nome e ordem vazios (a leitura ignora).
  if (temLinhas) {
    removidas.forEach(function (e) {
      operacoes.push(op('ETAPAS_PEDIDO', 'update', 'id', { id: e.id, nome: '', ordem: '' }));
    });
  }
  return { ok: true, operacoes: operacoes, historicos: [], versao: ctx.agora };
}

// 'aaaa-mm-dd hh:mm' no horario de Brasilia (como o Sync Faltantes grava data_separacao).
function dataHoraBrasilia(iso) {
  var d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return d.slice(0, 10) + ' ' + d.slice(11, 16);
}

// nova_demanda: falta descoberta depois que a caixa saiu. A caixa e achada na CAIXAS
// GANHAS pela OS + tipo; sem caixa, ou caixa que ainda nao saiu, recusa sem gravar nada.
// Os itens entram na FALTANTES com ciclo e origem POS_SAIDA e id <deal>|POS_SAIDA|<uuid>:
// o Sync Faltantes so mexe nas linhas do mesmo deal com ciclo PEDIDO/CORTE e casa por id.
function aplicarNovaDemanda(acao, linhas, ctx) {
  var rotulo = 'OS ' + acao.os + ' (' + NOMES_CAIXA[acao.caixa] + ')';
  var ganhas = (linhas.ganhas || []).filter(function (g) {
    return g && texto(g.os) === acao.os && tipoDaSecao(g.caixa) === acao.caixa && texto(g.deal_id) !== '';
  });
  var deals = {};
  ganhas.forEach(function (g) { deals[texto(g.deal_id)] = 1; });
  if (Object.keys(deals).length > 1) return erroAcao(409, 'Mais de uma caixa da ' + rotulo + ' saiu. Fale com o PCP.');
  if (!ganhas.length) {
    var noAlmox = (linhas.faltantes || []).some(function (l) {
      return l && texto(l.os) === acao.os && tipoDaSecao(l.secao) === acao.caixa;
    });
    return noAlmox ? erroAcao(409, 'A caixa da ' + rotulo + ' ainda não saiu.') : erroAcao(404, 'Caixa da ' + rotulo + ' não encontrada.');
  }
  var g = ganhas[0];
  var dealId = texto(g.deal_id);
  if (!dealEditavel(dealId)) return erroAcao(403, ERRO_NAO_EDITAVEL);
  var agora = ctx.agora;
  var quando = dataHoraBrasilia(agora);
  var os = texto(g.os);
  var operacoes = acao.itens.map(function (it) {
    return op('FALTANTES', 'append', 'id', {
      id: dealId + '|POS_SAIDA|' + ctx.gerarId(), os: os, ciclo: 'POS_SAIDA', origem: 'POS_SAIDA',
      referencia: texto(g.referencia), descricao_peca: texto(g.descricao_peca), cliente: texto(g.cliente), secao: acao.caixa,
      descricao_item: it.nome, nome_cor: it.cor, unidade: it.un, qtd_falta: it.qtd, qtd_baixada: 0, status: 'ABERTO',
      data_separacao: quando, deal_id: dealId, atualizado_em_app: agora
    });
  });
  var partes = acao.itens.map(function (it) {
    return formatarQtd(it.qtd) + ' ' + it.un + ' de ' + it.nome + (it.cor ? ' ' + it.cor : '');
  });
  return {
    ok: true,
    operacoes: operacoes,
    historicos: [linhaHistorico(ctx, dealId, os, '', acao.tipo, ctx.usuario + ' criou demanda pós-saída: ' + partes.join('; '))],
    versao: agora,
    itemIds: operacoes.map(function (o) { return o.linha.id; })
  };
}

// ----- src/previsao.js -----
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
  // Decisão do dono (19/10): na etapa 16 a duração dela não entra; a fila até a Costura já parte do término da 15 e contém esse tempo.
  var durAtual = s === ETAPA_PRIMEIRA_PECA ? 0 : duracaoEtapaPrevisao(t, s, faixa);
  var fimBase = Math.max(inicioEfetivo + durAtual, hoje);
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

// FieldKeys conferidas numa leitura real do Ploomes em 19/10/2026 (não são
// segredo). Se uma chave ficar vazia ou começar por CONFIGURAR_ (campo
// recriado, ambiente sem o campo), ela é lida como vazia: a previsão cai no
// fallback do BI (duração 1, fila 0) e o workflow de médias não grava nada.
var CAMPO_PECAS_PEDIDO = 'deal_3535D5CD-A8A7-425D-AECE-4D7F1F884489';
var CAMPO_PCP_COMPLETO = 'deal_64F15A50-2136-43A1-AA13-DDB49905A8C9';
var CAMPO_REGISTRO_INICIO = 'interaction_record_F162EE12-FC0C-4BDD-9C1D-873101371462';
var CAMPO_REGISTRO_TERMINO = 'interaction_record_63FD8E8F-E6E9-4D58-91D6-B2587FA9ED82';
var CAMPOS_ENTRADA_ETAPA = {
  12: 'deal_399B29F0-8A52-4EA2-B4FD-B8F41F3332E6',
  13: 'deal_DB678558-34C4-4414-B4A6-749E3860E3B6',
  14: 'deal_074B7ADD-94B0-46E4-90A5-FC9C9E49B0ED',
  15: 'deal_EB30D399-E64C-42A0-8161-AEB9DA9DDAE1',
  16: 'deal_181CB9F8-4B3D-43BE-BD25-174D52A5A7BF'
};

function campoConfigurado(chave) {
  return texto(chave) !== '' && texto(chave).indexOf('CONFIGURAR_') !== 0;
}


// FieldKeys que cada consulta ao Ploomes precisa trazer em OtherProperties (o gerador
// monta o $expand filtrado com elas). Derivadas das constantes acima e das de producao.js:
// campo novo lido pelas funções de normalização entra aqui, senão vira dado vazio.
// Chave por configurar (CONFIGURAR_) fica de fora.
function fieldKeysConsulta(consulta) {
  var producao = [CAMPO_OFICINA_PLOOMES, CAMPO_DATA_COMBINADA_PLOOMES, CAMPO_OS_PRODUCAO, CAMPO_INICIO_COSTURA,
    CAMPO_LEAD_TIME, CAMPO_PECAS_CORTE, CAMPO_DESCRICAO_PECA, CAMPO_REFERENCIA, CAMPO_VALOR_CORTE];
  var entradas = [12, 13, 14, 15, 16].map(function (e) { return CAMPOS_ENTRADA_ETAPA[e]; });
  var chaves;
  if (consulta === 'costura') chaves = producao;
  else if (consulta === 'previstas') chaves = producao.concat(entradas, [CAMPO_PCP_COMPLETO, CAMPO_PECAS_PEDIDO]);
  else if (consulta === 'negocios_previsao') chaves = [CAMPO_OFICINA_PLOOMES, CAMPO_PECAS_CORTE, CAMPO_PECAS_PEDIDO, CAMPO_PCP_COMPLETO];
  else if (consulta === 'registros_previsao') chaves = [CAMPO_REGISTRO_INICIO, CAMPO_REGISTRO_TERMINO];
  else throw new Error('Consulta desconhecida: ' + consulta);
  return chaves.filter(function (c, i) { return campoConfigurado(c) && chaves.indexOf(c) === i; });
}


// Número da etapa no texto do registro de interação. Formato real confirmado em
// 19/10/2026 ("Dado data 12. Encaixe"); o parser continua tolerante e isolado. Aceita "Etapa: 17", "Estágio 17", "17. Costura" e
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

// ----- src/producao.js -----
// ===== src/producao.js =====
// Regras puras da F4: snapshot da producao, prazo, ordenacao, alteracoes e
// modelos de WhatsApp. Sem I/O e sem import/export para rodar nos Code nodes.

var STATUS_ITEM_ABERTO_PRODUCAO = { ABERTO: 1, PARCIAL: 1 };
var VALORES_ATIVO_PRODUCAO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var TIPOS_PRODUCAO = ['alterar_producao', 'associar_whatsapp', 'aceitar_sugestao_whatsapp', 'ignorar_sugestao_whatsapp', 'enviar_whatsapp', 'reenviar_whatsapp'];
// Material enviado saiu da F4 por decisão do dono (16/10): o modelo é recusado.
var MODELOS_WHATSAPP = { COBRANCA_PRAZO: 1, CONFIRMAR_DATA: 1 };
var CAMPO_OFICINA_PLOOMES = 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4';
var CAMPO_DATA_COMBINADA_PLOOMES = 'deal_E53BDEC3-F829-413D-9421-91D5D7411349';
var CAMPO_OS_PRODUCAO = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
var CAMPO_INICIO_COSTURA = 'deal_92FBE0E7-E136-41BF-AE47-1E427B178727';
var CAMPO_LEAD_TIME = 'deal_1B168E7F-E71D-4895-8A37-D7DB6FD3418D';
var CAMPO_PECAS_CORTE = 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD';
var CAMPO_DESCRICAO_PECA = 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7';
var CAMPO_REFERENCIA = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';
// "Valor Total - Corte Real": campo de moeda no Ploomes (DecimalValue).
var CAMPO_VALOR_CORTE = 'deal_A974EF64-47C5-4E6A-B7BD-30B7B15A437C';

// Número ou null (vazio ou inválido): para peças e valores vindos do Ploomes ou da planilha.
function numeroOuNulo(v) {
  var n = numero(v);
  return n === null || isNaN(n) ? null : n;
}

// Chave do clique no site (crypto.randomUUID): o reenvio da mesma acao pela
// fila manda a mesma chave, e o id da mensagem sai dela de forma deterministica.
var CHAVE_ENVIO_WHATSAPP = /^[A-Za-z0-9-]{8,64}$/;

function idEnvioWhatsapp(chave) {
  return 'WA-E-' + texto(chave);
}

// Um reenvio por mensagem original: o id do reenvio sai do id da original, e a
// linha existente com esse id e o vinculo (sem coluna nova na planilha).
function idReenvioWhatsapp(idOriginal) {
  return 'WA-RE-' + texto(idOriginal);
}

function propriedadeDoDeal(deal, campo) {
  var props = deal && Array.isArray(deal.OtherProperties) ? deal.OtherProperties : [];
  return props.filter(function (p) { return p && texto(p.FieldKey) === campo; })[0] || null;
}

function valorPropriedadePloomes(prop) {
  if (!prop) return '';
  var candidatos = [prop.StringValue, prop.BigStringValue, prop.UserValueName, prop.ObjectValueName, prop.IntegerValue,
    prop.DecimalValue, prop.DateTimeValue];
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i] !== null && candidatos[i] !== undefined && texto(candidatos[i]) !== '') return candidatos[i];
  }
  return '';
}

function idObjetoPloomes(prop) {
  if (!prop) return '';
  var candidatos = [prop.UserValueId, prop.ObjectValueId, prop.IntegerValue, prop.StringValue];
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i] !== null && candidatos[i] !== undefined && texto(candidatos[i]) !== '') return texto(candidatos[i]);
  }
  return '';
}

// O contrato de OtherProperties foi conferido no workflow existente do Ploomes:
// cada campo informa FieldKey e o valor tipado (String/Integer/Decimal/DateTime/Object).
function normalizarDealProducao(deal) {
  deal = deal || {};
  var oficina = propriedadeDoDeal(deal, CAMPO_OFICINA_PLOOMES);
  var pecas = valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_PECAS_CORTE));
  var nPecas = numero(pecas);
  return {
    dealId: texto(deal.Id),
    os: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_OS_PRODUCAO))),
    oficinaId: idObjetoPloomes(oficina),
    // "Será produzido por" é campo de usuário no Ploomes; "ALOCAR" é um usuário de lá.
    oficina: texto(oficina && (oficina.UserValueName || oficina.ObjectValueName)),
    inicioCostura: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_INICIO_COSTURA))),
    dataCombinada: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DATA_COMBINADA_PLOOMES))),
    leadTime: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_LEAD_TIME))),
    pecas: nPecas === null || isNaN(nPecas) ? '' : nPecas,
    cliente: texto(deal.ContactName),
    peca: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DESCRICAO_PECA))) || texto(deal.Title),
    referencia: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_REFERENCIA))),
    versao: texto(deal.LastUpdateDate) || texto(deal.UpdatedAt),
    valorCorte: numeroOuNulo(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_VALOR_CORTE)))
  };
}

function linhaProducao(p, sincronizadoEm) {
  p = p || {};
  var pecas = numero(p.pecas);
  return {
    deal_id: texto(p.dealId),
    os: texto(p.os),
    oficina_id: texto(p.oficinaId),
    oficina_nome: texto(p.oficina) || 'ALOCAR',
    inicio_costura: dataISO(p.inicioCostura, new Date(sincronizadoEm).getUTCFullYear()),
    data_combinada: dataISO(p.dataCombinada, new Date(sincronizadoEm).getUTCFullYear()),
    lead_time: dataISO(p.leadTime, new Date(sincronizadoEm).getUTCFullYear()),
    pecas: pecas === null || isNaN(pecas) ? '' : pecas,
    cliente: texto(p.cliente),
    peca: texto(p.peca),
    referencia: texto(p.referencia),
    em_costura: 'SIM',
    atualizado_em_ploomes: texto(p.versao),
    sincronizado_em: texto(sincronizadoEm),
    // Coluna acrescentada no fim do contrato da aba (16/10).
    valor_corte: numeroOuNulo(p.valorCorte) === null ? '' : numeroOuNulo(p.valorCorte),
    // Visão de futuro (19/10), no fim da aba. OS na Costura segue a regra atual
    // (combinada ou lead time): as colunas de previsão ficam vazias.
    etapa_ordem: ETAPA_COSTURA,
    etapa_nome: ETAPA_NOME_COSTURA,
    etapa_inicio: '',
    prevista: 'NAO',
    inicio_costura_previsto: '',
    fim_costura_previsto: ''
  };
}

var ETAPA_NOME_COSTURA = '17. Costura';

// Card dos funis PCP e Produção nas etapas 12 a 16: o card da produção mais a
// etapa (pelo nome do estágio), a data de entrada nela, o "PCP completo pelo
// Ploomes?" e as peças usadas na faixa (corte, senão pedido).
function normalizarDealPrevisto(deal) {
  deal = deal || {};
  var card = normalizarDealProducao(deal);
  var etapaNome = texto(deal.Stage && deal.Stage.Name);
  var etapa = numeroEtapa(etapaNome);
  card.etapaOrdem = etapa;
  card.etapaNome = etapaNome;
  card.etapaInicio = etapa !== null && CAMPOS_ENTRADA_ETAPA[etapa] ? dataSaoPaulo(valorCampoDeal(deal, CAMPOS_ENTRADA_ETAPA[etapa])) : '';
  card.pcpCompleto = campoConfigurado(CAMPO_PCP_COMPLETO) && simNaoPloomes(propriedadeDoDeal(deal, CAMPO_PCP_COMPLETO));
  card.pecasPrevisao = pecasPrevisao(card.pecas, valorCampoDeal(deal, CAMPO_PECAS_PEDIDO));
  return card;
}

// Entram as etapas 12 a 16; nas 12 e 13 só com "PCP completo pelo Ploomes?" = sim
// (como no BI). Card que já veio na consulta da Costura fica de fora. Card sem OS é
// pulado sem aviso (o funil PCP tem muitos) e, se já tinha linha, não é encerrado.
function separarPrevistas(deals, dealsCostura) {
  var costura = Object.create(null);
  (dealsCostura || []).forEach(function (id) { if (texto(id)) costura[texto(id)] = 1; });
  var cards = [];
  var mantidos = [];
  (deals || []).forEach(function (deal) {
    var card = normalizarDealPrevisto(deal);
    if (!card.dealId || costura[card.dealId]) return;
    var etapa = card.etapaOrdem;
    if (!(etapa >= ETAPA_ENCAIXE && etapa <= ETAPA_ULTIMA_PREVISTA)) return;
    if (etapa <= 13 && !card.pcpCompleto) return;
    if (!card.os) {
      mantidos.push(card.dealId);
      return;
    }
    cards.push(card);
  });
  return { cards: cards, dealsMantidos: mantidos };
}

// Linha da PRODUCAO de uma OS prevista: em_costura NAO, prevista SIM e as datas
// da projeção (vazias para OS sem peças).
function linhaPrevista(card, medias, hojeISO, sincronizadoEm) {
  var linha = linhaProducao(card, sincronizadoEm);
  var semOficina = !texto(card.oficinaId) || semAcento(card.oficina) === 'ALOCAR';
  // O sync nao passa `chegada` a projetarOs (nao le os registros a cada 5 min): equivale ao spec 3.6, salvo chegada futura.
  var projecao = projetarOs({
    etapa: card.etapaOrdem, dtInicio: card.etapaInicio, pecas: card.pecasPrevisao,
    oficinaId: semOficina ? '' : texto(card.oficinaId)
  }, medias, hojeISO);
  linha.pecas = card.pecasPrevisao > 0 ? card.pecasPrevisao : '';
  linha.em_costura = 'NAO';
  linha.etapa_ordem = card.etapaOrdem;
  linha.etapa_nome = texto(card.etapaNome);
  linha.etapa_inicio = texto(card.etapaInicio);
  linha.prevista = 'SIM';
  linha.inicio_costura_previsto = projecao ? projecao.inicioCostura : '';
  linha.fim_costura_previsto = projecao ? projecao.fimCostura : '';
  return linha;
}

function avaliarPaginaProducao(resposta, pagina, tamanhoPagina) {
  resposta = resposta || {};
  var status = Number(resposta.statusCode !== undefined ? resposta.statusCode : resposta.status);
  if (status === 429 || status >= 500) {
    var headers = resposta.headers || {};
    var espera = Number(headers['retry-after'] || headers['Retry-After']);
    if (!isFinite(espera) || espera < 1) espera = status === 429 ? 30 : 5;
    espera = Math.min(300, Math.round(espera));
    return {
      ok: false, repetir: true, esperaSegundos: espera,
      erro: status === 429 ? 'Ploomes limitou a consulta. Tentar novamente.' : 'Ploomes indisponível. Tentar novamente.'
    };
  }
  if (!(status >= 200 && status < 300)) {
    return { ok: false, repetir: false, esperaSegundos: 0, erro: 'Falha ao consultar o Ploomes (HTTP ' + (isFinite(status) ? status : 'sem resposta') + ').' };
  }
  var body = resposta.body && typeof resposta.body === 'object' ? resposta.body : resposta;
  if (!Array.isArray(body.value)) {
    return {
      ok: false, repetir: false, esperaSegundos: 0,
      erro: 'Resposta inválida do Ploomes: lista de negócios ausente.'
    };
  }
  var itens = body.value;
  var tamanho = Number(tamanhoPagina);
  var atual = Number(pagina);
  return {
    ok: true,
    itens: itens,
    proximaPagina: tamanho > 0 && itens.length === tamanho ? atual + 1 : null
  };
}

// Card sem OS nao cancela o sync: e pulado com um aviso (so o deal_id) e,
// como continua na Costura do Ploomes, entra em dealsMantidos para nao virar NAO.
function separarCardsSincronizacao(deals) {
  var cards = [];
  var mantidos = [];
  var avisos = [];
  (deals || []).forEach(function (deal) {
    var card = normalizarDealProducao(deal);
    if (!card.dealId) {
      avisos.push({ dealId: '', erro: 'Negócio da produção sem Id ignorado na sincronização.' });
      return;
    }
    if (!card.os) {
      mantidos.push(card.dealId);
      avisos.push({ dealId: card.dealId, erro: 'Negócio da produção sem OS ignorado na sincronização.' });
      return;
    }
    cards.push(card);
  });
  return { cards: cards, dealsMantidos: mantidos, avisos: avisos };
}

// em_costura=NAO so sai daqui, e o adaptador so chega aqui depois de ler todas
// as paginas do Ploomes sem erro (qualquer pagina invalida cancela o sync).
// previstas (19/10): linhas prontas (linhaPrevista) das OS nas etapas 12 a 16.
function montarSincronizacaoProducao(cards, producaoAtual, oficinasAtuais, sincronizadoEm, dealsMantidos, previstas) {
  var mantidos = Object.create(null);
  (dealsMantidos || []).forEach(function (id) { if (texto(id)) mantidos[texto(id)] = 1; });
  var porDeal = Object.create(null);
  var ordemDeals = [];
  (cards || []).forEach(function (card) {
    var dealId = texto(card && card.dealId);
    if (!dealId) return;
    if (!Object.prototype.hasOwnProperty.call(porDeal, dealId)) ordemDeals.push(dealId);
    porDeal[dealId] = card;
  });

  var previstasPorDeal = Object.create(null);
  var ordemPrevistas = [];
  (previstas || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    if (!dealId || porDeal[dealId]) return;
    if (!previstasPorDeal[dealId]) ordemPrevistas.push(dealId);
    previstasPorDeal[dealId] = linha;
  });

  var operacoes = [];
  ordemDeals.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: linhaProducao(porDeal[dealId], sincronizadoEm) });
  });
  ordemPrevistas.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: previstasPorDeal[dealId] });
  });
  // Saiu da Costura e das etapas 12 a 16 (ou perdeu o "PCP completo"): NAO nas duas colunas.
  var encerrados = Object.create(null);
  (producaoAtual || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    var ativa = VALORES_ATIVO_PRODUCAO[semAcento(linha && linha.em_costura)] || VALORES_ATIVO_PRODUCAO[semAcento(linha && linha.prevista)];
    if (!dealId || porDeal[dealId] || previstasPorDeal[dealId] || mantidos[dealId] || encerrados[dealId] || !ativa) return;
    encerrados[dealId] = 1;
    operacoes.push({
      aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id',
      linha: { deal_id: dealId, em_costura: 'NAO', prevista: 'NAO', sincronizado_em: texto(sincronizadoEm) }
    });
  });

  var oficinasExistentes = Object.create(null);
  (oficinasAtuais || []).forEach(function (oficina) {
    var id = texto(oficina && oficina.ploomes_id);
    if (id) oficinasExistentes[id] = 1;
  });
  var oficinasVistas = Object.create(null);
  var origens = ordemDeals.map(function (dealId) {
    return { id: texto(porDeal[dealId].oficinaId), nome: texto(porDeal[dealId].oficina) };
  }).concat(ordemPrevistas.map(function (dealId) {
    return { id: texto(previstasPorDeal[dealId].oficina_id), nome: texto(previstasPorDeal[dealId].oficina_nome) };
  }));
  origens.forEach(function (origem) {
    var id = origem.id;
    var nome = origem.nome;
    if (!id || !nome || oficinasVistas[id]) return;
    oficinasVistas[id] = 1;
    var linha = { ploomes_id: id, nome: nome };
    if (!oficinasExistentes[id]) {
      linha.grupo_jid = '';
      linha.grupo_nome = '';
      linha.ativo = 'SIM';
    }
    operacoes.push({ aba: 'OFICINAS', operacao: 'appendOrUpdate', chave: 'ploomes_id', linha: linha });
  });
  return { operacoes: operacoes };
}

function prazoDaProducao(p) {
  var combinada = texto(p && p.dataCombinada);
  if (combinada) return { data: combinada, origem: 'COMBINADA' };
  var lead = texto(p && p.leadTime);
  if (lead) return { data: lead, origem: 'LEAD_TIME' };
  return { data: '', origem: 'SEM_PRAZO' };
}

function diasEntreISO(inicio, fim) {
  var a = Date.parse(inicio + 'T12:00:00Z');
  var b = Date.parse(fim + 'T12:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function statusPrazo(p, hojeISO) {
  var prazo = prazoDaProducao(p);
  if (!prazo.data) return { status: 'SEM_PRAZO', dias: null, data: '', origem: prazo.origem };
  var dias = diasEntreISO(hojeISO, prazo.data);
  var status = dias < 0 ? 'ATRASADO' : dias === 0 ? 'HOJE' : dias <= 3 ? 'PROXIMO' : 'NO_PRAZO';
  return { status: status, dias: dias, data: prazo.data, origem: prazo.origem };
}

function nomeOficinaProducao(p) {
  return semAcento(p && p.oficina) || 'ALOCAR';
}

function ordenarProducoes(producoes) {
  var lista = (producoes || []).slice();
  var primeiraData = {};
  lista.forEach(function (p) {
    var oficina = nomeOficinaProducao(p);
    var prazo = prazoDaProducao(p).data || '9999-99-99';
    if (!primeiraData[oficina] || prazo < primeiraData[oficina]) primeiraData[oficina] = prazo;
  });
  return lista.sort(function (a, b) {
    var oa = nomeOficinaProducao(a);
    var ob = nomeOficinaProducao(b);
    if (oa === 'ALOCAR' && ob !== 'ALOCAR') return -1;
    if (ob === 'ALOCAR' && oa !== 'ALOCAR') return 1;
    if (oa !== ob) {
      if (primeiraData[oa] !== primeiraData[ob]) return primeiraData[oa] < primeiraData[ob] ? -1 : 1;
      return oa < ob ? -1 : 1;
    }
    var pa = prazoDaProducao(a).data || '9999-99-99';
    var pb = prazoDaProducao(b).data || '9999-99-99';
    if (pa !== pb) return pa < pb ? -1 : 1;
    return texto(a.os) < texto(b.os) ? -1 : texto(a.os) > texto(b.os) ? 1 : 0;
  });
}

// O card do funil Produção é outro negócio: as caixas do Almoxarifado têm cards
// próprios (Costura e Acabamento). A ligação é pela OS, nunca pelo deal_id.
function faltasDaCaixaProducao(producao, caixas, tipo) {
  var os = texto(producao && producao.os);
  var faltas = [];
  if (!os) return faltas;
  (caixas || []).forEach(function (c) {
    if (!c || texto(c.os) !== os || semAcento(c.tipo) !== tipo) return;
    (c.itens || []).forEach(function (i) {
      if (i && STATUS_ITEM_ABERTO_PRODUCAO[semAcento(i.status)] && (i.resta === null || Number(i.resta) > 0)) faltas.push(i);
    });
  });
  return faltas;
}

function faltasDaCostura(producao, caixas) {
  return faltasDaCaixaProducao(producao, caixas, 'COSTURA');
}

function faltasDoAcabamento(producao, caixas) {
  return faltasDaCaixaProducao(producao, caixas, 'ACABAMENTO');
}

var MSG_AINDA_NAO_COSTURA = 'Esta OS ainda não chegou na Costura.';

function producaoEditavel(dealId, permitidos) {
  var lista = Array.isArray(permitidos) ? permitidos.map(texto) : [];
  return lista.length === 0 || lista.indexOf(texto(dealId)) >= 0;
}

function validarAlteracaoProducao(corpo, atual, permitidos) {
  corpo = corpo || {};
  atual = atual || {};
  var dealId = texto(corpo.dealId);
  if (!producaoEditavel(dealId, permitidos)) return erroAcao(403, 'Edição liberada em breve para esta OS.');
  if (!dealId || dealId !== texto(atual.dealId)) return erroAcao(404, 'OS não encontrada na produção.');
  if (texto(corpo.versao) !== texto(atual.versao)) return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  var oficinaId = texto(corpo.oficinaId);
  var data = texto(corpo.dataCombinada);
  var motivo = texto(corpo.motivo).replace(/(\r\n|\n|\r)+/g, ' ');
  if (data && !dataValida(data)) return erroAcao(400, 'Data combinada inválida.');
  if (motivo.length > 500) return erroAcao(400, 'Motivo com no máximo 500 caracteres.');
  var mudouData = data !== texto(atual.dataCombinada);
  var mudouOficina = oficinaId !== texto(atual.oficinaId);
  if (mudouData && !motivo) return erroAcao(400, 'Informe o motivo da alteração da data combinada.');
  if (!mudouData && !mudouOficina) return erroAcao(400, 'Nada alterado.');
  return {
    ok: true,
    acao: { dealId: dealId, versao: texto(corpo.versao), oficinaId: oficinaId, dataCombinada: data, motivo: motivo },
    mudouData: mudouData,
    mudouOficina: mudouOficina
  };
}

function validarAcaoProducaoBasica(corpo, permitidos) {
  corpo = corpo || {};
  if (TIPOS_PRODUCAO.indexOf(corpo.tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var dealId = texto(corpo.dealId);
  if (!dealId) return erroAcao(400, 'Informe a OS.');
  if (!producaoEditavel(dealId, permitidos)) return erroAcao(403, 'Edição liberada em breve para esta OS.');
  if (corpo.tipo === 'alterar_producao') {
    if (texto(corpo.dataCombinada) && !dataValida(texto(corpo.dataCombinada))) return erroAcao(400, 'Data combinada inválida.');
    if (texto(corpo.motivo).length > 500) return erroAcao(400, 'Motivo com no máximo 500 caracteres.');
  } else if (corpo.tipo === 'enviar_whatsapp') {
    if (!MODELOS_WHATSAPP[semAcento(corpo.modelo)]) return erroAcao(400, 'Modelo de mensagem inválido.');
    var mensagem = typeof corpo.texto === 'string' ? corpo.texto.trim() : '';
    if (!mensagem || mensagem.length > 1500) return erroAcao(400, 'Mensagem com até 1500 caracteres.');
    if (corpo.chave !== undefined && !CHAVE_ENVIO_WHATSAPP.test(texto(corpo.chave))) return erroAcao(400, 'Chave de envio inválida.');
  } else if (corpo.tipo === 'associar_whatsapp') {
    if (!texto(corpo.mensagemId)) return erroAcao(400, 'Informe a mensagem do WhatsApp.');
  } else if (corpo.tipo === 'reenviar_whatsapp') {
    if (!texto(corpo.mensagemId)) return erroAcao(400, 'Informe a mensagem do WhatsApp.');
    if (corpo.confirmou !== true) return erroAcao(400, 'Confirme o reenvio da mensagem.');
  } else if (!texto(corpo.sugestaoId)) {
    return erroAcao(400, 'Informe a sugestão.');
  }
  return { ok: true };
}

function processarAssociacaoWhatsapp(corpo, linhas, ctx) {
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
  if (linhaEhPrevista(producao)) return erroAcao(409, MSG_AINDA_NAO_COSTURA);
  if (texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  var mensagem = (linhas.whatsappMensagens || []).filter(function (m) { return m && texto(m.id) === texto(corpo.mensagemId); })[0];
  if (!mensagem) return erroAcao(404, 'Mensagem do WhatsApp não encontrada.');
  // Livre: sem OS (SEM_ASSOCIACAO ou IA_DUVIDA). Troca (22/10): ligada pela IA a outra OS.
  var assoc = semAcento(mensagem.associacao);
  var troca = assoc === 'IA' && !!texto(mensagem.deal_id);
  var livre = !texto(mensagem.deal_id) && (assoc === 'SEM_ASSOCIACAO' || assoc === 'IA_DUVIDA');
  if (semAcento(mensagem.direcao) !== 'RECEBIDA' || !(troca || livre)) {
    return erroAcao(409, 'Esta mensagem já foi associada ou não pode ser associada.');
  }
  if (troca && texto(mensagem.deal_id) === texto(producao.deal_id)) return erroAcao(409, 'A mensagem já está nesta OS.');
  if (!texto(producao.oficina_id) || texto(mensagem.oficina_id) !== texto(producao.oficina_id)) {
    return erroAcao(409, 'A mensagem e a OS precisam pertencer ao mesmo grupo.');
  }
  var oficina = (linhas.oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) === texto(producao.oficina_id) && linhaAtivaProducao(o.ativo);
  })[0];
  if (!oficina || !texto(oficina.grupo_jid) || texto(oficina.grupo_jid) !== texto(mensagem.grupo_jid)) {
    return erroAcao(409, 'O grupo da oficina mudou. Confira a configuração antes de associar.');
  }
  var linha = {
    id: texto(mensagem.id), deal_id: texto(producao.deal_id), os: texto(producao.os),
    oficina_id: texto(producao.oficina_id), associacao: 'MANUAL'
  };
  // Depois de gravar, o workflow da API dispara o "Interpretar WhatsApp" sem
  // esperar; só para texto e só se a mensagem ainda não tem sugestão.
  var interpretar = mensagemInterpretavelWhatsapp(mensagem) && !mensagemTemSugestaoWhatsapp(mensagem.id, linhas.whatsappSugestoes)
    ? { mensagemId: texto(mensagem.id), dealId: texto(producao.deal_id) } : null;
  // A interpretar desde já: se o disparo falhar, o agendamento de 15 min pega a mensagem.
  if (interpretar) Object.assign(linha, camposInterpretacaoPendenteWhatsapp(0, ctx.agora));
  var operacoes = [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id', linha: linha }];
  // IA_DUVIDA associada à mão: a pergunta da IA fecha, para a resposta da oficina
  // não religar a mensagem a outra OS (revisão de 23/10).
  if (assoc === 'IA_DUVIDA') {
    (linhas.whatsappMensagens || []).filter(function (m) {
      return m && semAcento(m.tipo) === 'PERGUNTA_ASSOCIACAO' && texto(m.pergunta_mensagem_id) === texto(mensagem.id) && !texto(m.pergunta_fechada_em);
    }).forEach(function (p) {
      operacoes.push({ aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id',
        linha: { id: texto(p.id), deal_id: texto(producao.deal_id), os: texto(producao.os), pergunta_fechada_em: ctx.agora } });
    });
  }
  // Na troca, a sugestão pendente da OS antiga deixa de valer (uma sugestão por mensagem).
  if (troca) {
    (linhas.whatsappSugestoes || []).filter(function (s) {
      return s && texto(s.mensagem_id) === texto(mensagem.id) && semAcento(s.status) === 'PENDENTE';
    }).forEach(function (s) {
      operacoes.push({ aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id',
        linha: { id: texto(s.id), status: 'IGNORADA', decidido_em: ctx.agora, decidido_por: ctx.usuario } });
    });
  }
  var textoHistorico = troca
    ? ctx.usuario + ' trocou a OS de uma mensagem do WhatsApp: ' + texto(mensagem.os) + ' → ' + texto(producao.os) + '.'
    : ctx.usuario + ' associou manualmente uma mensagem do WhatsApp à OS ' + texto(producao.os) + '.';
  return {
    ok: true, versao: texto(producao.atualizado_em_ploomes), ploomes: null, interpretar: interpretar,
    operacoes: operacoes,
    historicos: [historicoProducao(ctx, texto(producao.deal_id), texto(producao.os), 'WHATSAPP_ASSOCIAR', textoHistorico)]
  };
}

function processarReenvioWhatsapp(corpo, linhas, ctx) {
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
  if (linhaEhPrevista(producao)) return erroAcao(409, MSG_AINDA_NAO_COSTURA);
  if (texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  var original = (linhas.whatsappMensagens || []).filter(function (m) { return m && texto(m.id) === texto(corpo.mensagemId); })[0];
  if (!original || texto(original.deal_id) !== texto(producao.deal_id)) return erroAcao(404, 'Mensagem do WhatsApp não encontrada para esta OS.');
  var id = idReenvioWhatsapp(original.id);
  var jaReenviada = (linhas.whatsappMensagens || []).some(function (m) { return m && texto(m.id) === id; });
  if (jaReenviada) return erroAcao(409, 'Esta mensagem já foi reenviada. Confira a nova tentativa na conversa.');
  if (semAcento(original.direcao) !== 'ENVIADA' || semAcento(original.status_envio) !== 'ERRO') {
    return erroAcao(409, 'Somente uma tentativa com erro pode ser reenviada.');
  }
  if (texto(original.oficina_id) !== texto(producao.oficina_id)) return erroAcao(409, 'A oficina da OS mudou. Prepare uma nova mensagem.');
  var oficina = (linhas.oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) === texto(producao.oficina_id) && linhaAtivaProducao(o.ativo);
  })[0];
  if (!oficina || !texto(oficina.grupo_jid) || texto(oficina.grupo_jid) !== texto(original.grupo_jid)) {
    return erroAcao(409, 'O grupo da oficina mudou. Prepare uma nova mensagem.');
  }
  var linha = {
    id: id, evolution_id: '', quando: ctx.agora, grupo_jid: texto(original.grupo_jid), grupo_nome: texto(original.grupo_nome),
    participante_jid: '', participante_nome: ctx.usuario, direcao: 'ENVIADA', tipo: semAcento(original.tipo),
    tipo_conteudo: texto(original.tipo_conteudo) || 'TEXTO', texto: typeof original.texto === 'string' ? original.texto : texto(original.texto),
    resposta_a_evolution_id: texto(original.resposta_a_evolution_id), deal_id: texto(producao.deal_id), os: texto(producao.os),
    oficina_id: texto(producao.oficina_id), associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: ctx.agora
  };
  return {
    ok: true, versao: texto(producao.atualizado_em_ploomes), mensagemId: id, ploomes: null,
    operacoes: [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: linha }],
    historicos: [historicoProducao(ctx, texto(producao.deal_id), texto(producao.os), 'WHATSAPP_REENFILEIRAR',
      ctx.usuario + ' confirmou o reenvio de uma mensagem do WhatsApp.')]
  };
}

function processarEnvioWhatsapp(corpo, linhas, ctx) {
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
  if (linhaEhPrevista(producao)) return erroAcao(409, MSG_AINDA_NAO_COSTURA);
  var temChave = texto(corpo.chave) !== '';
  var id = temChave ? idEnvioWhatsapp(corpo.chave) : ctx.gerarId();
  if (temChave) {
    var existente = (linhas.whatsappMensagens || []).filter(function (m) { return m && texto(m.id) === id; })[0];
    if (existente) {
      // A mesma acao chegou de novo (reenvio da fila): sucesso sem nova linha.
      if (texto(existente.deal_id) === texto(producao.deal_id) && semAcento(existente.direcao) === 'ENVIADA') {
        return { ok: true, idempotente: true, versao: texto(producao.atualizado_em_ploomes), mensagemId: id, ploomes: null, operacoes: [], historicos: [] };
      }
      return erroAcao(409, 'Esta chave de envio já foi usada em outra mensagem.');
    }
  }
  if (texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  var oficinaId = texto(producao.oficina_id);
  if (!oficinaId) return erroAcao(409, 'Aloque uma oficina antes de enviar a mensagem.');
  var oficina = (linhas.oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) === oficinaId && linhaAtivaProducao(o.ativo);
  })[0];
  if (!oficina || !texto(oficina.grupo_jid)) return erroAcao(409, 'Configure o grupo desta oficina na aba OFICINAS.');
  var os = texto(producao.os);
  // O texto não precisa citar a OS: a oficina conhece a peça. A resposta volta
  // para esta OS pela citação desta mensagem ou como resposta à última cobrança.
  var mensagem = corpo.texto.trim();
  var agora = ctx.agora;
  var modelo = semAcento(corpo.modelo);
  var linha = {
    id: id, evolution_id: '', quando: agora, grupo_jid: texto(oficina.grupo_jid), grupo_nome: texto(oficina.grupo_nome),
    participante_jid: '', participante_nome: ctx.usuario, direcao: 'ENVIADA', tipo: modelo, tipo_conteudo: 'TEXTO',
    texto: mensagem, resposta_a_evolution_id: '', deal_id: texto(producao.deal_id), os: os, oficina_id: oficinaId,
    associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: agora
  };
  var descricao = ctx.usuario + ' enfileirou ' + (modelo === 'COBRANCA_PRAZO' ? 'uma cobrança de prazo' : 'uma mensagem') +
    ' no WhatsApp para ' + (texto(oficina.grupo_nome) || texto(oficina.nome)) + '.';
  return {
    ok: true, versao: texto(producao.atualizado_em_ploomes), mensagemId: id, ploomes: null,
    operacoes: [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: linha }],
    historicos: [historicoProducao(ctx, texto(producao.deal_id), os, 'WHATSAPP_ENFILEIRAR', descricao)]
  };
}

function historicoProducao(ctx, dealId, os, acao, descricao) {
  return {
    id: ctx.gerarId(), quando: ctx.agora, usuario: ctx.usuario, email: ctx.email,
    deal_id: dealId, os: os, item_id: '', acao: acao, texto: descricao,
    ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: ''
  };
}

function processarAlteracaoProducao(corpo, linhas, ctx, permitidos) {
  var row = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!row) return erroAcao(404, 'OS não encontrada na produção.');
  if (linhaEhPrevista(row)) return erroAcao(409, MSG_AINDA_NAO_COSTURA);
  var atual = {
    dealId: texto(row.deal_id), os: texto(row.os), oficinaId: texto(row.oficina_id),
    dataCombinada: texto(row.data_combinada), versao: texto(row.atualizado_em_ploomes)
  };
  var v = validarAlteracaoProducao(corpo, atual, permitidos);
  if (!v.ok) return v;
  var oficinaNome = 'ALOCAR';
  if (v.acao.oficinaId) {
    var oficina = (linhas.oficinas || []).filter(function (o) {
      return o && texto(o.ploomes_id) === v.acao.oficinaId && linhaAtivaProducao(o.ativo);
    })[0];
    if (!oficina) return erroAcao(400, 'Oficina inválida.');
    oficinaNome = texto(oficina.nome);
  }
  // atualizado_em_ploomes e a versao da linha: grava a mesma que a resposta
  // devolve, para a proxima acao passar e a edicao concorrente dar 409.
  var linha = { deal_id: atual.dealId, atualizado_em_ploomes: ctx.agora };
  var campos = {};
  var partes = [];
  if (v.mudouOficina) {
    linha.oficina_id = v.acao.oficinaId;
    linha.oficina_nome = oficinaNome;
    campos[CAMPO_OFICINA_PLOOMES] = v.acao.oficinaId;
    partes.push('oficina: ' + (texto(row.oficina_nome) || 'ALOCAR') + ' → ' + oficinaNome);
  }
  if (v.mudouData) {
    linha.data_combinada = v.acao.dataCombinada;
    campos[CAMPO_DATA_COMBINADA_PLOOMES] = v.acao.dataCombinada;
    var dataAntes = texto(row.data_combinada);
    partes.push('data combinada: ' + (dataAntes ? dataCurtaProducao(dataAntes) : '—') + ' → ' +
      (v.acao.dataCombinada ? dataCurtaProducao(v.acao.dataCombinada) : '—'));
  }
  if (v.acao.motivo) partes.push('motivo: ' + v.acao.motivo);
  var historico = historicoProducao(ctx, atual.dealId, atual.os, 'PRODUCAO_ALTERAR_COMBINADO', ctx.usuario + ' alterou o combinado: ' + partes.join(' · '));
  return {
    ok: true, versao: ctx.agora,
    operacoes: [{ aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: linha }],
    historicos: [historico], ploomes: { dealId: atual.dealId, campos: campos }
  };
}

function processarDecisaoSugestao(corpo, linhas, ctx) {
  var sugestao = (linhas.whatsappSugestoes || []).filter(function (s) { return s && texto(s.id) === texto(corpo.sugestaoId); })[0];
  if (!sugestao || texto(sugestao.deal_id) !== texto(corpo.dealId)) return erroAcao(404, 'Sugestão não encontrada.');
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
  if (linhaEhPrevista(producao)) return erroAcao(409, MSG_AINDA_NAO_COSTURA);
  var mensagem = (linhas.whatsappMensagens || []).filter(function (m) { return m && texto(m.id) === texto(sugestao.mensagem_id); })[0];
  if (!mensagem) return erroAcao(409, 'Mensagem da sugestão não encontrada.');
  var destino = corpo.tipo === 'aceitar_sugestao_whatsapp' ? 'ACEITA' : 'IGNORADA';
  if (semAcento(sugestao.status) !== destino) {
    var oficina = (linhas.oficinas || []).filter(function (o) {
      return o && texto(o.ploomes_id) === texto(producao.oficina_id) && linhaAtivaProducao(o.ativo);
    })[0];
    if (!oficina || !texto(oficina.grupo_jid) || texto(oficina.grupo_jid) !== texto(mensagem.grupo_jid)) {
      return erroAcao(409, 'O grupo da oficina mudou. Confira a configuração antes de decidir a sugestão.');
    }
  }
  var r = decidirSugestaoWhatsapp({
    decisao: corpo.tipo === 'aceitar_sugestao_whatsapp' ? 'ACEITAR' : 'IGNORAR',
    versao: corpo.versao, motivo: corpo.motivo
  }, sugestao, producao, mensagem, ctx);
  if (!r.ok || r.idempotente) return r.ok ? { ok: true, idempotente: true, versao: texto(producao.atualizado_em_ploomes), operacoes: [], historicos: [], ploomes: null } : r;
  var acao = corpo.tipo === 'aceitar_sugestao_whatsapp' ? 'WHATSAPP_SUGESTAO_ACEITA' : 'WHATSAPP_SUGESTAO_IGNORADA';
  r.historicos = [historicoProducao(ctx, texto(producao.deal_id), texto(producao.os), acao, r.textoHistorico)];
  // A versao so muda quando a linha da PRODUCAO e gravada (aceite de nova data).
  var gravaProducao = (r.operacoes || []).some(function (o) { return o.aba === 'PRODUCAO'; });
  r.versao = gravaProducao ? ctx.agora : texto(producao.atualizado_em_ploomes);
  return r;
}

function dataCurtaProducao(iso) {
  return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : 'sem data';
}

// As oficinas conhecem a peça, não o número da OS: a mensagem cita a peça em
// negrito do WhatsApp. O mesmo texto sai de web/src/regras/producao.ts.
function modeloWhatsapp(tipo, p, hojeISO) {
  p = p || {};
  var nome = '*' + (texto(p.peca) || 'peça') + '*';
  var qtd = numero(p.pecas);
  var quantidade = qtd > 0 ? formatarQtd(qtd) + (qtd === 1 ? ' peça' : ' peças') : '';
  // "de *X*, 160 peças, está" no meio da frase; "de *X*, 160 peças?" no fim.
  var meio = nome + (quantidade ? ', ' + quantidade + ',' : '');
  var fim = nome + (quantidade ? ', ' + quantidade : '');
  var prazo = prazoDaProducao(p);
  if (tipo === 'CONFIRMAR_DATA') {
    return 'Olá. Confirmando a entrega de ' + meio + ' para ' + dataCurtaProducao(texto(p.dataCombinada) || prazo.data) + '. Segue combinado?';
  }
  if (tipo === 'COBRANCA_PRAZO') {
    var status = statusPrazo(p, hojeISO);
    if (status.status === 'ATRASADO') {
      return 'Olá. A entrega de ' + meio + ' estava prevista para ' + dataCurtaProducao(prazo.data) + '. Qual a nova data de entrega?';
    }
    if (!prazo.data) return 'Olá. Qual a previsão de entrega de ' + fim + '?';
    return 'Olá. A entrega de ' + meio + ' está prevista para ' + dataCurtaProducao(prazo.data) + '. Segue dentro do prazo?';
  }
  return '';
}

function linhaAtivaProducao(valor) {
  var ativo = semAcento(valor);
  return ativo === '' || !!VALORES_ATIVO_PRODUCAO[ativo];
}

function mensagemProducaoBoard(m, reenviadas) {
  var base = mensagemProducaoBoardBase(m, reenviadas);
  // Novas tentativas (16/10): só aparecem quando existem.
  var tentativas = numero(m.envio_tentativas);
  if (semAcento(m.status_envio) === 'PENDENTE' && tentativas > 0) base.envioTentativas = tentativas;
  if (semAcento(m.interpretacao_status) === 'ERRO') base.interpretacao = 'ERRO';
  return base;
}

function mensagemProducaoBoardBase(m, reenviadas) {
  var base = {
    reenviada: !!(reenviadas && reenviadas[idReenvioWhatsapp(m.id)]),
    id: texto(m.id),
    quando: texto(m.quando),
    participanteNome: texto(m.participante_nome),
    direcao: semAcento(m.direcao),
    texto: texto(m.texto),
    associacao: semAcento(m.associacao),
    statusEnvio: semAcento(m.status_envio),
    tipoConteudo: semAcento(m.tipo_conteudo) || 'TEXTO'
  };
  // Associador por IA (22/10): motivo da ligação e a pergunta feita à oficina.
  if (base.associacao === 'IA' && texto(m.associacao_motivo)) base.associacaoMotivo = texto(m.associacao_motivo);
  if (semAcento(m.tipo) === 'PERGUNTA_ASSOCIACAO') base.pergunta = true;
  return base;
}

function sugestaoProducaoBoard(s) {
  var confianca = numero(s.confianca);
  return {
    id: texto(s.id),
    mensagemId: texto(s.mensagem_id),
    tipo: semAcento(s.tipo),
    valor: texto(s.valor),
    resumo: texto(s.resumo),
    evidencia: texto(s.evidencia),
    confianca: confianca === null || isNaN(confianca) ? null : confianca,
    status: semAcento(s.status),
    criadoEm: texto(s.criado_em),
    versao: texto(s.versao)
  };
}

function linhasWhatsappUnicas(linhas, preferirDecidida) {
  var saida = [];
  var posicoes = {};
  (linhas || []).forEach(function (linha) {
    var id = texto(linha && linha.id);
    if (!id || posicoes[id] === undefined) {
      if (id) posicoes[id] = saida.length;
      saida.push(linha);
      return;
    }
    var pos = posicoes[id];
    if (preferirDecidida && semAcento(saida[pos] && saida[pos].status) === 'PENDENTE' &&
        semAcento(linha && linha.status) !== 'PENDENTE') {
      saida[pos] = linha;
    }
  });
  return saida;
}

function mensagensDaProducao(mensagens, dealId) {
  var daOs = (mensagens || []).filter(function (m) {
    return m && texto(m.deal_id) === dealId;
  });
  var ids = {};
  daOs.forEach(function (m) { ids[texto(m.id)] = 1; });
  return linhasWhatsappUnicas(daOs, false).sort(function (a, b) {
    return texto(a.quando) < texto(b.quando) ? 1 : texto(a.quando) > texto(b.quando) ? -1 : 0;
  }).slice(0, 30).map(function (m) { return mensagemProducaoBoard(m, ids); });
}

function sugestoesDaProducao(sugestoes, dealId) {
  var lista = linhasWhatsappUnicas((sugestoes || []).filter(function (s) {
    return s && texto(s.deal_id) === dealId;
  }), true).sort(function (a, b) {
    return texto(a.criado_em) < texto(b.criado_em) ? 1 : texto(a.criado_em) > texto(b.criado_em) ? -1 : 0;
  });
  var pendentes = lista.filter(function (s) { return semAcento(s.status) === 'PENDENTE'; });
  var decididas = lista.filter(function (s) { return semAcento(s.status) !== 'PENDENTE'; }).slice(0, 10);
  return pendentes.concat(decididas).map(sugestaoProducaoBoard);
}

function oficinasProducaoBoard(oficinas) {
  return (oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) && texto(o.nome) && linhaAtivaProducao(o.ativo);
  }).map(function (o) {
    return {
      ploomesId: texto(o.ploomes_id),
      nome: texto(o.nome),
      grupoConfigurado: texto(o.grupo_jid) !== '',
      grupoNome: texto(o.grupo_nome),
      // Carga das oficinas (19/10): peças por semana; vazio = sem capacidade (sem cor de alerta).
      capacidadeSemana: numeroOuNulo(o.capacidade_semana)
    };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

// ---------- capacidade das oficinas (19/10) ----------

var TIPO_CAPACIDADE_OFICINA = 'alterar_capacidade_oficina';
var ERRO_CAPACIDADE_SO_ADM = 'Só administradores podem alterar a capacidade das oficinas.';
var MAX_CAPACIDADE_OFICINA = 1000000;

// capacidade: inteiro >= 0 (peças por semana) ou vazio/null (sem capacidade).
function validarCapacidadeOficina(corpo) {
  corpo = corpo || {};
  var oficinaId = texto(corpo.oficinaId);
  if (!oficinaId) return erroAcao(400, 'Informe a oficina.');
  var v = corpo.capacidade;
  if (v === null || v === undefined || texto(v) === '') return { ok: true, acao: { oficinaId: oficinaId, capacidade: '' } };
  var n = typeof v === 'number' ? v : /^\d+$/.test(texto(v)) ? Number(texto(v)) : NaN;
  if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > MAX_CAPACIDADE_OFICINA) {
    return erroAcao(400, 'Informe a capacidade em peças por semana: número inteiro, 0 ou mais.');
  }
  return { ok: true, acao: { oficinaId: oficinaId, capacidade: n } };
}

// Só planilha (OFICINAS.capacidade_semana): não vai ao Ploomes nem ao HISTORICO_APP,
// que é por OS. Não depende de DEALS_PRODUCAO_EDITAVEIS: não é card.
function processarCapacidadeOficina(corpo, linhas, ctx) {
  var v = validarCapacidadeOficina(corpo);
  if (!v.ok) return v;
  var oficina = (linhas.oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) === v.acao.oficinaId && linhaAtivaProducao(o.ativo);
  })[0];
  if (!oficina) return erroAcao(404, 'Oficina não encontrada.');
  return {
    ok: true, versao: ctx.agora, ploomes: null, historicos: [],
    operacoes: [{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id',
      linha: { ploomes_id: v.acao.oficinaId, capacidade_semana: v.acao.capacidade, atualizado_em: ctx.agora } }]
  };
}

function mensagensSemAssociacaoProducaoBoard(mensagens, oficinas) {
  var oficinasPorId = {};
  (oficinas || []).forEach(function (o) {
    if (o && texto(o.ploomes_id)) oficinasPorId[texto(o.ploomes_id)] = o;
  });
  return linhasWhatsappUnicas((mensagens || []).filter(function (m) {
    // IA_DUVIDA (22/10): a IA perguntou à oficina; o PCP pode associar antes da resposta.
    var a = semAcento(m && m.associacao);
    return m && semAcento(m.direcao) === 'RECEBIDA' && !texto(m.deal_id) && (a === 'SEM_ASSOCIACAO' || a === 'IA_DUVIDA');
  }), false).sort(function (a, b) {
    return texto(a.quando) < texto(b.quando) ? 1 : texto(a.quando) > texto(b.quando) ? -1 : 0;
  }).slice(0, 30).map(function (m) {
    var base = mensagemProducaoBoard(m);
    delete base.reenviada;
    var oficinaId = texto(m.oficina_id);
    var oficina = oficinasPorId[oficinaId] || {};
    base.oficinaId = oficinaId;
    base.oficina = texto(oficina.nome);
    base.grupoNome = texto(m.grupo_nome) || texto(oficina.grupo_nome);
    if (semAcento(m.associacao) === 'IA_DUVIDA') base.perguntado = true;
    return base;
  });
}

// OS prevista (19/10): ainda nas etapas 12 a 16, com a Costura projetada pelo sync.
function linhaEhPrevista(l) {
  return !VALORES_ATIVO_PRODUCAO[semAcento(l && l.em_costura)] && !!VALORES_ATIVO_PRODUCAO[semAcento(l && l.prevista)];
}

function producoesBoard(extras, caixas) {
  extras = extras || {};
  return ordenarProducoes((extras.producao || []).filter(function (l) {
    return l && (VALORES_ATIVO_PRODUCAO[semAcento(l.em_costura)] || linhaEhPrevista(l));
  }).map(function (l) {
    var dealId = texto(l.deal_id);
    var p = {
      dealId: dealId,
      os: texto(l.os),
      oficinaId: texto(l.oficina_id),
      oficina: texto(l.oficina_nome) || 'ALOCAR',
      inicioCostura: texto(l.inicio_costura),
      dataCombinada: texto(l.data_combinada),
      leadTime: texto(l.lead_time),
      pecas: numero(l.pecas),
      cliente: texto(l.cliente),
      peca: texto(l.peca),
      referencia: texto(l.referencia),
      versao: texto(l.atualizado_em_ploomes),
      valorCorte: numeroOuNulo(l.valor_corte)
    };
    if (p.pecas === null || isNaN(p.pecas)) p.pecas = null;
    if (linhaEhPrevista(l)) {
      p.prevista = true;
      p.etapaOrdem = numeroOuNulo(l.etapa_ordem);
      p.etapaNome = texto(l.etapa_nome);
      p.etapaInicio = texto(l.etapa_inicio);
      p.inicioCosturaPrevisto = texto(l.inicio_costura_previsto);
      p.fimCosturaPrevisto = texto(l.fim_costura_previsto);
    }
    p.faltasCostura = faltasDaCostura(p, caixas);
    p.faltasAcabamento = faltasDoAcabamento(p, caixas);
    p.mensagens = mensagensDaProducao(extras.whatsappMensagens, dealId);
    p.sugestoes = sugestoesDaProducao(extras.whatsappSugestoes, dealId);
    p.historico = historicoDoDeal(extras.historico, dealId);
    return p;
  }));
}

// ----- src/whatsapp.js -----
// ===== src/whatsapp.js =====
// Regras puras da F4 para receber, associar e validar a interpretacao de
// mensagens de grupos. O interprete e silencioso: este arquivo nunca envia.

var TIPOS_INTERPRETACAO_WHATSAPP = {
  NOVA_DATA_COMBINADA: 1,
  PRAZO_CONFIRMADO: 1,
  MOTIVO_ATRASO: 1,
  OBSERVACAO: 1
};

// Mensagens enviadas que pedem resposta da oficina. Sem o número da OS no
// texto, a resposta sem citação volta pela última pergunta pendente do grupo.
var TIPOS_PERGUNTA_WHATSAPP = { COBRANCA_PRAZO: 1, CONFIRMAR_DATA: 1 };

var PREFIXO_TENTATIVA_WHATSAPP = 'Tentativa iniciada em ';
var ERRO_ENVIO_INCERTO_WHATSAPP = 'Resultado incerto. Confira no WhatsApp antes de confirmar um reenvio.';

function instanteDaTentativaWhatsapp(mensagem) {
  var erro = texto(mensagem && mensagem.erro);
  if (erro.indexOf(PREFIXO_TENTATIVA_WHATSAPP) !== 0) return NaN;
  return Date.parse(erro.slice(PREFIXO_TENTATIVA_WHATSAPP.length));
}

function ordemFilaWhatsapp(a, b) {
  var x = Date.parse(texto(a && (a.criado_em || a.quando)));
  var y = Date.parse(texto(b && (b.criado_em || b.quando)));
  if (!isFinite(x)) x = Number.MAX_SAFE_INTEGER;
  if (!isFinite(y)) y = Number.MAX_SAFE_INTEGER;
  if (x !== y) return x - y;
  return texto(a && a.id) < texto(b && b.id) ? -1 : 1;
}

// Escolhe no maximo uma linha por execucao. A fila e marcada como ENVIANDO
// antes da chamada externa; assim uma nova execucao nao repete a mensagem.
// Uma tentativa abandonada fica para conferencia humana, sem reenvio automatico.
function selecionarSaidaWhatsapp(mensagens, agora) {
  var agoraMs = Date.parse(texto(agora));
  var limite = agoraMs - 10 * 60000;
  var travadas = (mensagens || []).filter(function (m) {
    if (!m || semAcento(m.status_envio) !== 'ENVIANDO') return false;
    var inicio = instanteDaTentativaWhatsapp(m);
    return isFinite(agoraMs) && isFinite(inicio) && inicio <= limite;
  }).sort(ordemFilaWhatsapp);
  if (travadas.length) {
    return {
      enviar: false, id: texto(travadas[0].id), mensagem: travadas[0],
      linha: { id: texto(travadas[0].id), status_envio: 'ERRO', erro: ERRO_ENVIO_INCERTO_WHATSAPP }
    };
  }

  var pendentes = (mensagens || []).filter(function (m) {
    // Sem ID nao existe chave segura para atualizar a linha; ignora em vez de
    // correr o risco de casar uma linha vazia na planilha.
    if (!m || !texto(m.id) || semAcento(m.status_envio) !== 'PENDENTE') return false;
    // Nova tentativa automática agendada: espera a hora marcada.
    var proxima = Date.parse(texto(m.envio_proxima));
    return !(isFinite(proxima) && isFinite(agoraMs) && proxima > agoraMs);
  }).sort(ordemFilaWhatsapp);
  if (!pendentes.length) return null;
  var alvo = pendentes[0];
  var id = texto(alvo.id);
  var grupo = texto(alvo.grupo_jid);
  var corpo = typeof alvo.texto === 'string' ? alvo.texto.trim() : '';
  var erro = '';
  if (semAcento(alvo.direcao) !== 'ENVIADA') erro = 'A fila de saída aceita somente mensagens enviadas.';
  else if (!grupo) erro = 'Mensagem sem grupo configurado.';
  else if (!corpo) erro = 'Mensagem sem texto.';
  if (erro) return { enviar: false, id: id, mensagem: alvo, linha: { id: id, status_envio: 'ERRO', erro: erro } };
  return {
    enviar: true, id: id, grupo_jid: grupo, texto: corpo, mensagem: alvo,
    linha: { id: id, status_envio: 'ENVIANDO', erro: PREFIXO_TENTATIVA_WHATSAPP + texto(agora) }
  };
}

function corpoRespostaWhatsapp(resposta) {
  var corpo = resposta && resposta.body;
  if (typeof corpo !== 'string') return corpo || {};
  try { return JSON.parse(corpo); } catch (e) { return {}; }
}

function idRespostaWhatsapp(resposta) {
  var corpo = corpoRespostaWhatsapp(resposta);
  return texto(corpo && corpo.key && corpo.key.id) || texto(corpo && corpo.id) ||
    texto(resposta && resposta.key && resposta.key.id) || texto(resposta && resposta.id);
}

// ----- Novas tentativas automáticas do envio (16/10) -----
// REPETIR: há certeza de que a mensagem não saiu (conexão recusada, DNS, host
// inalcançável, 429, 404 de instância inexistente). A linha volta para PENDENTE
// com espera crescente, até MAX_TENTATIVAS_ENVIO_WHATSAPP falhas.
// INCERTO (timeout, conexão cortada, 5xx, 2xx sem ID): pode ter saído; vira ERRO
// para conferência e reenvio humano. RECUSADA: qualquer outro 4xx (a Evolution v2
// embrulha falhas posteriores ao envio em 400 com texto livre): ERRO sem repetir.
// Instância desconectada é conferida antes, pelo GET /instance/connectionState
// (avaliarConexaoWhatsapp): fechada, a mensagem nem é enviada.
var MAX_TENTATIVAS_ENVIO_WHATSAPP = 5;
var ESPERAS_ENVIO_WHATSAPP_MIN = [5, 15, 30, 60];
var NAO_SAIU_CONEXAO_WHATSAPP = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|refused the connection|DNS server returned an error/i;
var INSTANCIA_INEXISTENTE_WHATSAPP = /does not exist|instance not found/i;

function falhaDeConexaoWhatsapp(resposta) {
  var falha = '';
  try { falha = JSON.stringify((resposta && (resposta.error || resposta.erro)) || ''); } catch (e) { falha = ''; }
  return NAO_SAIU_CONEXAO_WHATSAPP.test(falha);
}

// Resposta do GET /instance/connectionState/<instância>: só "open" libera o envio.
// Qualquer outra resposta (fechada, conectando, 404, 5xx, falha de conexão) segura a
// mensagem na fila: nada foi enviado, então repetir é seguro.
function avaliarConexaoWhatsapp(resposta) {
  resposta = resposta || {};
  var status = Number(resposta.statusCode);
  if (status >= 200 && status < 300) {
    var corpo = corpoRespostaWhatsapp(resposta) || {};
    var estado = texto((corpo.instance && corpo.instance.state) || corpo.state).toLowerCase();
    if (estado === 'open') return { aberta: true, motivo: '' };
    return { aberta: false, motivo: 'instância do WhatsApp desconectada (estado: ' + (estado || 'desconhecido') + ')' };
  }
  if (falhaDeConexaoWhatsapp(resposta)) return { aberta: false, motivo: 'Evolution fora do ar (conexão não estabelecida)' };
  if (isFinite(status) && status > 0) return { aberta: false, motivo: 'não foi possível conferir a conexão do WhatsApp (HTTP ' + status + ')' };
  return { aberta: false, motivo: 'não foi possível conferir a conexão do WhatsApp' };
}

function classificarEnvioWhatsapp(resposta) {
  resposta = resposta || {};
  var status = Number(resposta.statusCode);
  if (status >= 200 && status < 300) {
    return idRespostaWhatsapp(resposta) ? { tipo: 'ENVIADA', motivo: '' } :
      { tipo: 'INCERTO', motivo: 'Envio aceito, mas a Evolution respondeu sem ID. Confira no WhatsApp antes de reenviar.' };
  }
  if (status === 429) return { tipo: 'REPETIR', motivo: 'limite da Evolution (HTTP 429)' };
  if (status >= 400 && status < 500) {
    var corpo = JSON.stringify(corpoRespostaWhatsapp(resposta) || {});
    if (status === 404 && INSTANCIA_INEXISTENTE_WHATSAPP.test(corpo)) return { tipo: 'REPETIR', motivo: 'instância do WhatsApp inexistente (HTTP 404)' };
    return { tipo: 'RECUSADA', motivo: 'A Evolution recusou o envio (HTTP ' + status + ').' };
  }
  if (status >= 500) return { tipo: 'INCERTO', motivo: 'Resultado incerto na Evolution (HTTP ' + status + '). Confira no WhatsApp antes de reenviar.' };
  if (falhaDeConexaoWhatsapp(resposta)) return { tipo: 'REPETIR', motivo: 'Evolution fora do ar (conexão não estabelecida)' };
  return { tipo: 'INCERTO', motivo: 'Resultado incerto por timeout ou falha de conexão. Confira no WhatsApp antes de reenviar.' };
}

function resultadoSaidaWhatsapp(mensagem, resposta, agora) {
  mensagem = mensagem || {};
  var id = texto(mensagem.id);
  var c = classificarEnvioWhatsapp(resposta);
  if (c.tipo === 'ENVIADA') return { id: id, evolution_id: idRespostaWhatsapp(resposta), status_envio: 'ENVIADA', erro: '' };
  if (c.tipo !== 'REPETIR') return { id: id, evolution_id: '', status_envio: 'ERRO', erro: c.motivo };
  return repetirSaidaWhatsapp(mensagem, c.motivo, agora);
}

function resultadoSemConexaoWhatsapp(mensagem, conexao, agora) {
  return repetirSaidaWhatsapp(mensagem || {}, texto(conexao && conexao.motivo) || 'WhatsApp sem conexão', agora);
}

function repetirSaidaWhatsapp(mensagem, motivo, agora) {
  var id = texto(mensagem.id);
  var c = { motivo: motivo };
  var anteriores = numero(mensagem.envio_tentativas);
  var tentativas = (anteriores === null || isNaN(anteriores) ? 0 : anteriores) + 1;
  if (tentativas >= MAX_TENTATIVAS_ENVIO_WHATSAPP) {
    return { id: id, evolution_id: '', status_envio: 'ERRO', envio_tentativas: tentativas, envio_proxima: '',
      erro: 'Não saiu após ' + tentativas + ' tentativas: ' + c.motivo + '. Confira e reenvie.' };
  }
  var espera = ESPERAS_ENVIO_WHATSAPP_MIN[Math.min(tentativas, ESPERAS_ENVIO_WHATSAPP_MIN.length) - 1];
  var base = Date.parse(texto(agora));
  if (!isFinite(base)) base = Date.now();
  return { id: id, evolution_id: '', status_envio: 'PENDENTE', envio_tentativas: tentativas,
    envio_proxima: new Date(base + espera * 60000).toISOString(),
    erro: 'Não saiu: ' + c.motivo + '. Nova tentativa automática (' + tentativas + ' de ' + MAX_TENTATIVAS_ENVIO_WHATSAPP + ').' };
}

// So JID de grupo (termina em @g.us). JID vazio nunca casa com oficina sem
// grupo configurado, e conversa individual nao entra.
function grupoWhatsappAtivo(grupos, jid) {
  var alvo = texto(jid);
  if (!alvo || !/@g\.us$/.test(alvo)) return null;
  return (grupos || []).filter(function (g) {
    var ativo = semAcento(g && g.ativo);
    return g && texto(g.grupo_jid) === alvo && (ativo === '' || ativo === 'SIM' || ativo === 'S' || ativo === 'TRUE' || ativo === '1');
  })[0] || null;
}

function conteudoDaMensagemWhatsapp(message) {
  message = message || {};
  if (typeof message.conversation === 'string') {
    return { texto: texto(message.conversation), tipo: 'TEXTO', contexto: {} };
  }
  var candidatos = [message.extendedTextMessage, message.imageMessage, message.videoMessage, message.documentMessage];
  for (var i = 0; i < candidatos.length; i++) {
    var c = candidatos[i];
    if (!c) continue;
    var t = texto(c.text !== undefined ? c.text : c.caption);
    return { texto: t, tipo: t ? 'TEXTO' : 'NAO_TEXTUAL', contexto: c.contextInfo || {} };
  }
  return { texto: '', tipo: 'NAO_TEXTUAL', contexto: {} };
}

function normalizarEventoWhatsapp(payload, grupos, contexto) {
  payload = payload || {};
  contexto = contexto || {};
  var evento = semAcento(payload.event).replace(/[._-]/g, '');
  if (evento !== 'MESSAGESUPSERT') return { ok: false, motivo: 'EVENTO_IGNORADO' };
  var instanciaEsperada = texto(contexto.instancia);
  if (instanciaEsperada && texto(payload.instance) !== instanciaEsperada) {
    return { ok: false, motivo: 'INSTANCIA_IGNORADA' };
  }
  var d = Array.isArray(payload.data) ? (payload.data[0] || {}) : (payload.data || {});
  var chave = d.key || {};
  if (chave.fromMe === true) return { ok: false, motivo: 'MENSAGEM_PROPRIA' };
  if (!texto(chave.id)) return { ok: false, motivo: 'MENSAGEM_SEM_ID' };
  var grupo = grupoWhatsappAtivo(grupos, chave.remoteJid);
  if (!grupo) return { ok: false, motivo: 'GRUPO_NAO_CADASTRADO' };
  var conteudo = conteudoDaMensagemWhatsapp(d.message);
  var segundos = Number(d.messageTimestamp);
  var quando = isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : '';
  return {
    ok: true,
    mensagem: {
      evolutionId: texto(chave.id),
      quando: quando,
      grupoJid: texto(chave.remoteJid),
      grupoNome: texto(grupo.grupo_nome),
      participanteJid: texto(chave.participant),
      participanteNome: texto(d.pushName),
      fromMe: false,
      texto: conteudo.texto,
      respostaA: texto(conteudo.contexto.stanzaId),
      tipoConteudo: conteudo.tipo,
      oficinaId: texto(grupo.ploomes_id)
    }
  };
}

function mensagemWhatsappDuplicada(evolutionId, mensagens) {
  var id = texto(evolutionId);
  if (!id) return false;
  return (mensagens || []).some(function (m) { return m && texto(m.evolution_id) === id; });
}

function resultadoSemAssociacaoWhatsapp() {
  return { dealId: '', os: '', associacao: 'SEM_ASSOCIACAO' };
}

function associarMensagemWhatsapp(msg, producoes, mensagens) {
  msg = msg || {};
  producoes = producoes || [];
  mensagens = mensagens || [];
  var citada = texto(msg.respostaA);
  if (citada) {
    var origem = mensagens.filter(function (m) {
      return m && texto(m.evolution_id) === citada && semAcento(m.direcao) === 'ENVIADA' && texto(m.grupo_jid) === texto(msg.grupoJid);
    })[0];
    if (origem && texto(origem.deal_id) && texto(origem.os)) {
      return { dealId: texto(origem.deal_id), os: texto(origem.os), associacao: 'CITACAO' };
    }
  }

  var textoMsg = texto(msg.texto);
  var encontradas = producoes.filter(function (p) {
    if (!p || !texto(p.os)) return false;
    if (texto(msg.oficinaId) && texto(p.oficinaId) !== texto(msg.oficinaId)) return false;
    var os = texto(p.os).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\D)' + os + '(\\D|$)').test(textoMsg);
  });
  if (encontradas.length === 1) {
    return { dealId: texto(encontradas[0].dealId), os: texto(encontradas[0].os), associacao: 'OS_NO_TEXTO' };
  }
  if (encontradas.length > 1) return resultadoSemAssociacaoWhatsapp();

  var agora = Date.parse(texto(msg.quando));
  var limite = agora - 72 * 3600000;
  var pendentes = mensagens.filter(function (m) {
    if (!m || semAcento(m.direcao) !== 'ENVIADA' || !TIPOS_PERGUNTA_WHATSAPP[semAcento(m.tipo)]) return false;
    if (texto(m.status_envio) && semAcento(m.status_envio) !== 'ENVIADA') return false;
    if (texto(m.grupo_jid) !== texto(msg.grupoJid) || cobrancaRespondidaWhatsapp(m, mensagens)) return false;
    var ts = Date.parse(texto(m.quando));
    return isFinite(ts) && isFinite(agora) && ts <= agora && ts >= limite;
  });
  var unicas = {};
  pendentes.forEach(function (m) { if (texto(m.deal_id)) unicas[texto(m.deal_id)] = m; });
  var ids = Object.keys(unicas);
  if (ids.length === 1) {
    var unica = unicas[ids[0]];
    return { dealId: texto(unica.deal_id), os: texto(unica.os), associacao: 'ULTIMA_COBRANCA' };
  }
  return resultadoSemAssociacaoWhatsapp();
}

// Respondida: ja existe mensagem RECEBIDA associada a mesma OS depois da cobranca.
function cobrancaRespondidaWhatsapp(cobranca, mensagens) {
  var dealId = texto(cobranca.deal_id);
  var enviadaEm = Date.parse(texto(cobranca.quando));
  if (!dealId || !isFinite(enviadaEm)) return false;
  return (mensagens || []).some(function (m) {
    if (!m || semAcento(m.direcao) !== 'RECEBIDA' || texto(m.deal_id) !== dealId) return false;
    var ts = Date.parse(texto(m.quando));
    return isFinite(ts) && ts > enviadaEm;
  });
}

function somarDiasISO(data, dias) {
  var ms = Date.parse(data + 'T12:00:00Z');
  if (!isFinite(ms)) return '';
  return new Date(ms + dias * 86400000).toISOString().slice(0, 10);
}

function dataISOEmSaoPaulo(valor) {
  var bruto = texto(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  var d = new Date(bruto);
  if (!isFinite(d.getTime())) return '';
  try {
    var partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    var mapa = {};
    partes.forEach(function (p) { mapa[p.type] = p.value; });
    return mapa.year + '-' + mapa.month + '-' + mapa.day;
  } catch (e) {
    return bruto.slice(0, 10);
  }
}

function resolverDataInterpretada(valor, quando) {
  var bruto = texto(valor);
  var normal = semAcento(bruto).toLowerCase();
  var base = dataISOEmSaoPaulo(quando);
  if (normal === 'amanha') return somarDiasISO(base, 1);
  if (normal === 'depois de amanha') return somarDiasISO(base, 2);
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return dataValida(bruto) ? bruto : '';
  var m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(bruto);
  if (!m) return '';
  var anoBase = Number(base.slice(0, 4));
  var ano = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : anoBase;
  var iso = String(ano) + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  if (!dataValida(iso)) return '';
  if (!m[3] && iso < base) {
    iso = String(ano + 1) + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  }
  return dataValida(iso) ? iso : '';
}

// dd/mm sem ano que cai a mais de ~6 meses (183 dias) da mensagem e ambiguo:
// vira observacao em vez de virar uma data no ano seguinte.
function dataSemAnoDistante(valor, data, quando) {
  if (!/^\d{1,2}\/\d{1,2}$/.test(texto(valor))) return false;
  var dias = diasEntreISO(dataISOEmSaoPaulo(quando), data);
  return dias === null || dias > 183;
}

function interpretarComoObjeto(valor) {
  if (valor && typeof valor === 'object') return valor;
  if (typeof valor !== 'string') return null;
  try { return JSON.parse(valor); } catch (e) { return null; }
}

// Normaliza para comparar a evidência com a mensagem: sem acento, minúsculas, só letras e números.
function textoComparavelWhatsapp(v) {
  return semAcento(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// A evidência está na mensagem quando pelo menos 60% das palavras dela (2+ letras)
// aparecem na mensagem, aceitando prefixo ("sexta" casa "sexta-feira", "dia" casa
// "dias") — tolera paráfrase leve e reticências (revisão de 23/10). Sem evidência: vale.
function evidenciaNaMensagemWhatsapp(evidencia, textoMensagem) {
  var palavras = textoComparavelWhatsapp(evidencia).split(' ').filter(function (p) { return p.length >= 2; });
  if (!palavras.length) return true;
  var daMensagem = textoComparavelWhatsapp(textoMensagem).split(' ');
  var achadas = palavras.filter(function (p) {
    return daMensagem.some(function (m) {
      return m === p || (m.length >= 3 && p.length >= 3 && (m.indexOf(p) === 0 || p.indexOf(m) === 0));
    });
  });
  return achadas.length / palavras.length >= 0.6;
}

// textoMensagem (QA de 23/10): a evidência precisa estar na própria mensagem; se o
// modelo a tirou de outra mensagem da conversa, vira observação sem data.
function validarInterpretacaoWhatsapp(valor, quando, textoMensagem) {
  var o = interpretarComoObjeto(valor);
  if (!o) return { ok: false, erro: 'Interpretação inválida.' };
  var tipo = semAcento(o.tipo);
  if (!TIPOS_INTERPRETACAO_WHATSAPP[tipo]) return { ok: false, erro: 'Tipo de interpretação inválido.' };
  var confianca = Number(o.confianca);
  if (!isFinite(confianca) || confianca < 0 || confianca > 1) return { ok: false, erro: 'Confiança inválida.' };
  var resumo = texto(o.resumo).replace(/(\r\n|\n|\r)+/g, ' ').slice(0, 500);
  var evidencia = texto(o.evidencia).replace(/(\r\n|\n|\r)+/g, ' ').slice(0, 500);
  var data = tipo === 'NOVA_DATA_COMBINADA' ? resolverDataInterpretada(o.valor, quando) : '';
  if (tipo === 'NOVA_DATA_COMBINADA' && !data) return { ok: false, erro: 'Data interpretada inválida.' };
  if (confianca < 0.7 || (tipo === 'NOVA_DATA_COMBINADA' && dataSemAnoDistante(o.valor, data, quando))) {
    tipo = 'OBSERVACAO';
    data = '';
  }
  var comparavel = textoComparavelWhatsapp(textoMensagem);
  var semEvidencia = !textoComparavelWhatsapp(evidencia) && tipo === 'NOVA_DATA_COMBINADA';
  if (comparavel && (semEvidencia || !evidenciaNaMensagemWhatsapp(evidencia, textoMensagem))) {
    tipo = 'OBSERVACAO';
    data = '';
    resumo = ('Mensagem da oficina: ' + texto(textoMensagem)).slice(0, 500);
    evidencia = '';
  }
  return { ok: true, tipo: tipo, valor: tipo === 'NOVA_DATA_COMBINADA' ? data : '', resumo: resumo, evidencia: evidencia, confianca: confianca };
}

function respostaDoInterpreteWhatsapp(resposta) {
  if (!resposta || typeof resposta !== 'object' ||
      !Object.prototype.hasOwnProperty.call(resposta, 'interpretacao') ||
      resposta.interpretacao === null || resposta.interpretacao === undefined) {
    return { ok: false, erro: 'O subworkflow do intérprete não devolveu a propriedade interpretacao.' };
  }
  return { ok: true, interpretacao: resposta.interpretacao };
}

function producaoParaAssociacaoWhatsapp(p) {
  p = p || {};
  return {
    dealId: texto(p.dealId !== undefined ? p.dealId : p.deal_id),
    os: texto(p.os),
    oficinaId: texto(p.oficinaId !== undefined ? p.oficinaId : p.oficina_id),
    dataCombinada: texto(p.dataCombinada !== undefined ? p.dataCombinada : p.data_combinada),
    versao: texto(p.versao !== undefined ? p.versao : p.atualizado_em_ploomes),
    ativa: p.em_costura === undefined || semAcento(p.em_costura) === 'SIM'
  };
}

// Primeira metade da entrada: valida, deduplica e associa antes de qualquer
// chamada ao modelo. O contexto do intérprete omite grupo e participante.
function prepararEntradaWhatsapp(payload, dados, contexto) {
  dados = dados || {};
  contexto = contexto || {};
  var normalizado = normalizarEventoWhatsapp(payload, dados.oficinas || [], contexto);
  if (!normalizado.ok) return { ok: true, ignorada: true, motivo: normalizado.motivo, operacoes: [] };
  var msg = normalizado.mensagem;
  if (mensagemWhatsappDuplicada(msg.evolutionId, dados.mensagens || [])) {
    return { ok: true, ignorada: true, motivo: 'DUPLICADA', operacoes: [] };
  }

  var producoes = (dados.producao || []).map(producaoParaAssociacaoWhatsapp).filter(function (p) { return p.ativa; });
  var associacao = associarMensagemWhatsapp(msg, producoes, dados.mensagens || []);
  var gerarId = contexto.gerarId;
  if (typeof gerarId !== 'function') return { ok: false, erro: 'Gerador de ID não informado.', operacoes: [] };
  var agora = texto(contexto.agora) || msg.quando;
  var mensagemId = texto(gerarId(msg.evolutionId));
  var linhaMensagem = {
    id: mensagemId,
    evolution_id: msg.evolutionId,
    quando: msg.quando || agora,
    grupo_jid: msg.grupoJid,
    grupo_nome: msg.grupoNome,
    participante_jid: msg.participanteJid,
    participante_nome: msg.participanteNome,
    direcao: 'RECEBIDA',
    tipo: 'RESPOSTA',
    tipo_conteudo: msg.tipoConteudo,
    texto: msg.texto,
    resposta_a_evolution_id: msg.respostaA,
    deal_id: associacao.dealId,
    os: associacao.os,
    oficina_id: msg.oficinaId,
    associacao: associacao.associacao,
    status_envio: '',
    erro: '',
    criado_em: agora
  };
  var precisaInterpretar = msg.tipoConteudo === 'TEXTO' && !!associacao.dealId;
  // A 1ª tentativa do intérprete já fica reservada na própria linha.
  Object.assign(linhaMensagem, precisaInterpretar ? camposInterpretacaoPendenteWhatsapp(1, agora)
    : { interpretacao_status: '', interpretacao_tentativas: '', interpretacao_proxima: '' });
  var operacoes = [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: linhaMensagem }];
  var prod = producoes.filter(function (p) { return p.dealId === associacao.dealId; })[0] || {};
  // Associador por IA (22/10): só quando as regras fixas não resolveram e a
  // oficina tem OS na Costura. Com pergunta aberta no grupo, vai junto a pergunta.
  var pedidoAssociador = null;
  if (msg.tipoConteudo === 'TEXTO' && !associacao.dealId) {
    var todosCandidatos = candidatosAssociacaoWhatsapp(dados.producao, msg.oficinaId, dados.mensagens, dataISOEmSaoPaulo(agora),
      contexto.dealsPermitidos);
    // Trava: pergunta aberta no grupo (mesmo na fila). Resposta: só a pergunta já enviada.
    var grupoTravado = !!perguntaAbertaWhatsapp(dados.mensagens, msg.grupoJid, agora);
    var pergunta = perguntaRespondivelWhatsapp(dados.mensagens, msg.grupoJid, msg.quando || agora);
    var original = null;
    var perguntados = [];
    if (pergunta) {
      var daPergunta = texto(pergunta.pergunta_candidatos).split(';');
      perguntados = todosCandidatos.filter(function (c) { return daPergunta.indexOf(c.dealId) >= 0; });
      original = linhasWhatsappUnicas((dados.mensagens || []).filter(function (m) {
        return m && texto(m.id) === texto(pergunta.pergunta_mensagem_id);
      }), false)[0] || null;
      if (!original || !perguntados.length) { pergunta = null; original = null; }
    }
    if (todosCandidatos.length) {
      var doGrupo = (dados.mensagens || []).filter(function (m) { return m && texto(m.grupo_jid) === msg.grupoJid; });
      pedidoAssociador = {
        mensagem: linhaMensagem, candidatos: todosCandidatos, pergunta: pergunta, original: original, grupoTravado: grupoTravado,
        entrada: contextoAssociadorWhatsapp({ texto: msg.texto, quando: msg.quando || agora }, todosCandidatos, doGrupo,
          pergunta ? { texto: pergunta.texto, candidatos: perguntados.map(function (c) { return c.os; }), mensagemOriginal: original.texto } : null)
      };
    }
  }
  return {
    ok: true,
    precisaInterpretar: precisaInterpretar,
    precisaAssociar: !!pedidoAssociador,
    pedidoAssociador: pedidoAssociador,
    mensagemId: mensagemId,
    quando: msg.quando || agora,
    dealId: associacao.dealId,
    os: associacao.os,
    versao: texto(prod.versao),
    contextoInterpretacao: precisaInterpretar ? {
      texto: msg.texto,
      quando: msg.quando || agora,
      dealId: associacao.dealId,
      os: associacao.os,
      dataCombinada: texto(prod.dataCombinada)
    } : null,
    operacoes: operacoes
  };
}

// Segunda metade: só aceita o JSON validado e acrescenta a sugestão. Nunca
// envia mensagem nem responde ao grupo.
function concluirEntradaWhatsapp(preparada, interpretacao, contexto) {
  preparada = preparada || {};
  contexto = contexto || {};
  var operacoes = (preparada.operacoes || []).slice();
  if (!preparada.ok || preparada.ignorada || !preparada.precisaInterpretar || interpretacao === undefined || interpretacao === null) {
    return Object.assign({}, preparada, { operacoes: operacoes });
  }

  var validada = validarInterpretacaoWhatsapp(interpretacao, preparada.quando,
    texto(preparada.texto) || texto((preparada.contextoInterpretacao || {}).texto));
  if (!validada.ok) {
    return { ok: true, precisaInterpretar: true, erroInterpretacao: validada.erro, operacoes: operacoes };
  }
  var gerarId = contexto.gerarId;
  if (typeof gerarId !== 'function') return { ok: false, erro: 'Gerador de ID não informado.', operacoes: operacoes };
  operacoes.push({
    aba: 'WHATSAPP_SUGESTOES', operacao: 'append', chave: 'id',
    linha: {
      id: texto(gerarId()), mensagem_id: texto(preparada.mensagemId), deal_id: texto(preparada.dealId), os: texto(preparada.os),
      tipo: validada.tipo, valor: validada.valor, resumo: validada.resumo, evidencia: validada.evidencia,
      confianca: validada.confianca, status: 'PENDENTE', criado_em: texto(contexto.agora) || texto(preparada.quando),
      decidido_em: '', decidido_por: '', versao: texto(preparada.versao)
    }
  });
  return { ok: true, precisaInterpretar: true, operacoes: operacoes };
}

// ----- Contexto do intérprete (ajuste de 16/10) -----
// O modelo recebe a OS inteira (peça, prazo, faltas) e a conversa recente, mas
// nunca JID, telefone ou nome de participante. Textos são cortados.
var LIMITE_TEXTO_INTERPRETE = 500;
var LIMITE_CONVERSA_INTERPRETE = 10;
var LIMITE_FALTAS_INTERPRETE = 10;

var INSTRUCOES_INTERPRETE_WHATSAPP = 'Interprete a resposta da oficina sem responder ao grupo. ' +
  'As mensagens enviadas à oficina citam a peça (em negrito), não o número da OS. ' +
  'Use o contexto da OS (peça, quantidade, prazo vigente, status do prazo e faltas abertas) e a conversa recente ' +
  'para entender a resposta. Interprete só o campo texto (a mensagem nova); nunca use data ou fato que esteja só em ' +
  'outra mensagem da conversa. Devolva somente o objeto estruturado.';

var SCHEMA_INTERPRETE_WHATSAPP = {
  tipo: ['NOVA_DATA_COMBINADA', 'PRAZO_CONFIRMADO', 'MOTIVO_ATRASO', 'OBSERVACAO'],
  valor: 'data ISO, data em dd/mm ou expressão relativa quando houver nova data',
  resumo: 'resumo curto em português',
  evidencia: 'cópia literal de um trecho curto do campo texto (a mensagem interpretada, nunca da conversa) que sustenta a interpretação',
  confianca: 'número entre 0 e 1'
};

function cortarTextoInterprete(valor, limite) {
  return texto(valor).slice(0, limite || LIMITE_TEXTO_INTERPRETE);
}

function descricaoFaltaInterprete(item) {
  var nome = [texto(item.nome), texto(item.cor)].filter(function (x) { return x; }).join(' ');
  var resta = item.resta === null || item.resta === undefined ? '' : ': falta ' + formatarQtd(Number(item.resta)) + (texto(item.un) ? ' ' + texto(item.un) : '');
  return cortarTextoInterprete(nome + resta, 120);
}

function resumoFaltasInterprete(itens) {
  return {
    quantidade: (itens || []).length,
    itens: (itens || []).slice(0, LIMITE_FALTAS_INTERPRETE).map(descricaoFaltaInterprete)
  };
}

// Mensagem que a oficina viu: recebida, ou enviada com sucesso (vazio = linha antiga).
function mensagemVistaPelaOficina(m) {
  var direcao = semAcento(m.direcao);
  if (direcao === 'RECEBIDA') return true;
  var status = semAcento(m.status_envio);
  return direcao === 'ENVIADA' && (status === '' || status === 'ENVIADA');
}

function conversaParaInterprete(mensagens, dealId, alvo) {
  var limite = Date.parse(texto(alvo.quando));
  var daOs = (mensagens || []).filter(function (m) {
    if (!m || texto(m.deal_id) !== dealId || texto(m.id) === texto(alvo.mensagemId)) return false;
    if (!mensagemVistaPelaOficina(m)) return false;
    var ts = Date.parse(texto(m.quando));
    return isFinite(ts) && (!isFinite(limite) || ts <= limite);
  });
  return linhasWhatsappUnicas(daOs, false).sort(function (a, b) {
    return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando));
  }).slice(-LIMITE_CONVERSA_INTERPRETE).map(function (m) {
    return {
      direcao: semAcento(m.direcao),
      quando: texto(m.quando),
      texto: semAcento(m.tipo_conteudo) === 'NAO_TEXTUAL' ? '[conteúdo não textual]' : cortarTextoInterprete(m.texto)
    };
  });
}

// dados: { producao, mensagens, faltantes, ganhas } (linhas da planilha);
// alvo: { mensagemId, dealId, texto, quando } (a mensagem a interpretar);
// hojeISO: dia de referência do status do prazo (America/Sao_Paulo).
function montarContextoInterpretacao(dados, alvo, hojeISO) {
  dados = dados || {};
  alvo = alvo || {};
  var dealId = texto(alvo.dealId);
  var linha = (dados.producao || []).filter(function (p) { return p && texto(p.deal_id) === dealId; })[0] || {};
  var pecas = numero(linha.pecas);
  var p = {
    dealId: dealId,
    os: texto(linha.os),
    dataCombinada: texto(linha.data_combinada),
    leadTime: texto(linha.lead_time)
  };
  var status = statusPrazo(p, hojeISO);
  var caixas = montarCaixas(dados.faltantes || [], dados.ganhas || [], new Date(texto(hojeISO) + 'T12:00:00Z'), {}).caixas;
  return {
    texto: cortarTextoInterprete(alvo.texto),
    quando: texto(alvo.quando),
    os: texto(linha.os),
    peca: texto(linha.peca),
    referencia: texto(linha.referencia),
    pecas: pecas === null || isNaN(pecas) ? null : pecas,
    oficina: texto(linha.oficina_nome),
    inicioCostura: texto(linha.inicio_costura),
    dataCombinada: p.dataCombinada,
    leadTime: p.leadTime,
    prazoVigente: status.data,
    origemPrazo: status.origem,
    statusPrazo: status.status,
    diasParaPrazo: status.dias,
    faltasCostura: resumoFaltasInterprete(faltasDaCostura(p, caixas)),
    faltasAcabamento: resumoFaltasInterprete(faltasDoAcabamento(p, caixas)),
    conversa: conversaParaInterprete(dados.mensagens, dealId, alvo)
  };
}

// Corpo enviado ao subworkflow do intérprete: o contexto no nível de cima
// (compatível com a versão anterior: texto, quando, os, dataCombinada) mais
// instruções e schema.
function entradaInterpreteWhatsapp(contexto) {
  return Object.assign({}, contexto || {}, {
    instrucoes: INSTRUCOES_INTERPRETE_WHATSAPP,
    schema: JSON.parse(JSON.stringify(SCHEMA_INTERPRETE_WHATSAPP))
  });
}

// Uma sugestão por mensagem: vale a sugestão com o id determinístico ou
// qualquer outra que aponte para a mesma mensagem, em qualquer status.
function mensagemTemSugestaoWhatsapp(mensagemId, sugestoes) {
  var id = texto(mensagemId);
  var idSugestao = idSugestaoWhatsapp(id);
  return (sugestoes || []).some(function (s) {
    return s && (texto(s.mensagem_id) === id || texto(s.id) === idSugestao);
  });
}

function mensagemInterpretavelWhatsapp(m) {
  return !!m && semAcento(m.direcao) === 'RECEBIDA' && semAcento(m.tipo_conteudo || 'TEXTO') === 'TEXTO' && texto(m.texto) !== '';
}

// ----- Novas tentativas do intérprete (16/10) -----
// interpretacao_status: '' (não precisa), PENDENTE (a interpretar) ou ERRO
// (desistiu). Cada tentativa é reservada antes de chamar o modelo (tentativas + 1
// e próxima em 10 min); se a chamada falhar, nada mais é gravado e o agendamento
// de 15 min pega a mensagem vencida que ainda não tem sugestão. Sucesso = existe
// sugestão para a mensagem (uma por mensagem), então não precisa limpar o status.
var MAX_TENTATIVAS_INTERPRETACAO_WHATSAPP = 5;
var ESPERA_INTERPRETACAO_WHATSAPP_MIN = 10;
var LIMITE_RODADA_INTERPRETACAO_WHATSAPP = 10;

function proximaInterpretacaoWhatsapp(agora) {
  var base = Date.parse(texto(agora));
  if (!isFinite(base)) base = Date.now();
  return new Date(base + ESPERA_INTERPRETACAO_WHATSAPP_MIN * 60000).toISOString();
}

function tentativasInterpretacaoWhatsapp(m) {
  var n = numero(m && m.interpretacao_tentativas);
  return n === null || isNaN(n) ? 0 : n;
}

// Campos da mensagem a interpretar. tentativas = já reservadas (1 na entrada,
// que chama o modelo logo em seguida; 0 na associação manual, que dispara o
// workflow Interpretar WhatsApp, que reserva a sua).
function camposInterpretacaoPendenteWhatsapp(tentativas, agora) {
  return { interpretacao_status: 'PENDENTE', interpretacao_tentativas: tentativas, interpretacao_proxima: proximaInterpretacaoWhatsapp(agora) };
}

function selecionarInterpretacoesPendentesWhatsapp(dados, agora) {
  dados = dados || {};
  var agoraMs = Date.parse(texto(agora));
  var producoes = {};
  (dados.producao || []).forEach(function (p) {
    var ativa = semAcento(p && p.em_costura);
    if (p && texto(p.deal_id) && (ativa === '' || ativa === 'SIM')) producoes[texto(p.deal_id)] = 1;
  });
  // Deduplica as linhas físicas antes de filtrar: vale a primeira (a que a gravação atualiza).
  var candidatas = linhasWhatsappUnicas(dados.mensagens || [], false).filter(function (m) {
    if (!mensagemInterpretavelWhatsapp(m) || semAcento(m.interpretacao_status) !== 'PENDENTE') return false;
    if (!producoes[texto(m.deal_id)] || mensagemTemSugestaoWhatsapp(m.id, dados.sugestoes)) return false;
    var proxima = Date.parse(texto(m.interpretacao_proxima));
    return !isFinite(proxima) || !isFinite(agoraMs) || proxima <= agoraMs;
  }).sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); });
  var interpretar = [];
  var erros = [];
  var reservas = [];
  candidatas.forEach(function (m) {
    if (tentativasInterpretacaoWhatsapp(m) >= MAX_TENTATIVAS_INTERPRETACAO_WHATSAPP) {
      erros.push({ id: texto(m.id), interpretacao_status: 'ERRO', interpretacao_proxima: '' });
    } else if (interpretar.length < LIMITE_RODADA_INTERPRETACAO_WHATSAPP) {
      // O agendamento conta a tentativa antes de disparar: se o Interpretar nem chegar a
      // rodar (id errado, falha ao ler), a mensagem ainda chega a ERRO depois de 5.
      reservas.push(Object.assign({ id: texto(m.id) }, camposInterpretacaoPendenteWhatsapp(tentativasInterpretacaoWhatsapp(m) + 1, agora)));
      interpretar.push({ mensagemId: texto(m.id), dealId: texto(m.deal_id), reservada: true });
    }
  });
  return { interpretar: interpretar, erros: erros, reservas: reservas };
}

// Workflow "Interpretar WhatsApp": depois da associação manual, monta a mesma
// preparação da entrada (sem operações: a mensagem já está na planilha) e o
// corpo do intérprete. A conclusão reaproveita concluirEntradaWhatsapp.
// dados: { producao, mensagens, sugestoes, faltantes, ganhas }; pedido: { mensagemId, dealId }.
function prepararInterpretacaoManualWhatsapp(dados, pedido, hojeISO, agora) {
  dados = dados || {};
  pedido = pedido || {};
  var mensagemId = texto(pedido.mensagemId);
  var dealId = texto(pedido.dealId);
  var nada = function (motivo) { return { ok: true, interpretar: false, motivo: motivo }; };
  var mensagem = mensagemId ? linhasWhatsappUnicas((dados.mensagens || []).filter(function (m) {
    return m && texto(m.id) === mensagemId && semAcento(m.direcao) === 'RECEBIDA';
  }), false)[0] : null;
  if (!mensagem) return nada('MENSAGEM_NAO_ENCONTRADA');
  if (!dealId || texto(mensagem.deal_id) !== dealId) return nada('ASSOCIACAO_MUDOU');
  if (!mensagemInterpretavelWhatsapp(mensagem)) return nada('NAO_TEXTUAL');
  if (mensagemTemSugestaoWhatsapp(mensagemId, dados.sugestoes)) return nada('JA_TEM_SUGESTAO');
  var tentativas = tentativasInterpretacaoWhatsapp(mensagem);
  // reservada: o agendamento já contou esta tentativa; aqui só renova a próxima.
  var reservada = pedido.reservada === true;
  if (reservada ? tentativas > MAX_TENTATIVAS_INTERPRETACAO_WHATSAPP : tentativas >= MAX_TENTATIVAS_INTERPRETACAO_WHATSAPP) return nada('LIMITE_TENTATIVAS');
  var producao = (dados.producao || []).filter(function (p) { return p && texto(p.deal_id) === dealId; })[0];
  if (!producao) return nada('OS_NAO_ENCONTRADA');
  var contexto = montarContextoInterpretacao(dados, {
    mensagemId: mensagemId, dealId: dealId, texto: mensagem.texto, quando: mensagem.quando
  }, hojeISO);
  return {
    ok: true,
    interpretar: true,
    preparacao: {
      ok: true, precisaInterpretar: true, mensagemId: mensagemId, quando: texto(mensagem.quando), texto: texto(mensagem.texto),
      dealId: dealId, os: texto(producao.os), versao: texto(producao.atualizado_em_ploomes), operacoes: []
    },
    entrada: entradaInterpreteWhatsapp(contexto),
    // Gravada antes de chamar o modelo: se a chamada falhar, o agendamento tenta de novo.
    reserva: Object.assign({ id: mensagemId }, camposInterpretacaoPendenteWhatsapp(reservada ? tentativas : tentativas + 1, agora))
  };
}

function idSugestaoWhatsapp(mensagemId) {
  var id = texto(mensagemId);
  return id.indexOf('WA-R-') === 0 ? 'WA-S-' + id.slice(5) : 'WA-S-' + id;
}

function processarEntradaWhatsapp(payload, dados, interpretacao, contexto) {
  contexto = contexto || {};
  var preparada = prepararEntradaWhatsapp(payload, dados, contexto);
  return concluirEntradaWhatsapp(preparada, interpretacao, contexto);
}

function decidirSugestaoWhatsapp(corpo, sugestao, producao, mensagem, contexto) {
  corpo = corpo || {};
  sugestao = sugestao || {};
  producao = producao || {};
  mensagem = mensagem || {};
  contexto = contexto || {};
  var decisao = semAcento(corpo.decisao);
  if (decisao !== 'ACEITAR' && decisao !== 'IGNORAR') return erroAcao(400, 'Decisão inválida.');
  var destino = decisao === 'ACEITAR' ? 'ACEITA' : 'IGNORADA';
  var status = semAcento(sugestao.status);
  if (status === destino) return { ok: true, idempotente: true, operacoes: [], historicos: [], ploomes: null };
  if (status !== 'PENDENTE') return erroAcao(409, 'Esta sugestão já foi decidida.');

  var dealId = texto(sugestao.deal_id);
  var mesmoVinculo = dealId && dealId === texto(producao.deal_id) && dealId === texto(mensagem.deal_id) &&
    texto(sugestao.mensagem_id) === texto(mensagem.id) && texto(sugestao.os) === texto(producao.os) &&
    texto(producao.oficina_id) === texto(mensagem.oficina_id);
  if (!mesmoVinculo) return erroAcao(409, 'A mensagem não pertence à mesma OS e oficina da sugestão.');
  if (texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) {
    return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  }

  var agora = texto(contexto.agora);
  var usuario = texto(contexto.usuario);
  var operacoes = [];
  var ploomes = null;
  var tipo = semAcento(sugestao.tipo);
  var motivo = texto(corpo.motivo).replace(/(\r\n|\n|\r)+/g, ' ');
  if (motivo.length > 500) return erroAcao(400, 'Motivo com no máximo 500 caracteres.');
  if (decisao === 'ACEITAR' && tipo === 'NOVA_DATA_COMBINADA') {
    if (!motivo) return erroAcao(400, 'Informe o motivo da alteração da data combinada.');
    var data = texto(sugestao.valor);
    if (!dataValida(data)) return erroAcao(400, 'Data interpretada inválida.');
    operacoes.push({ aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: { deal_id: dealId, data_combinada: data, atualizado_em_ploomes: agora } });
    ploomes = { dealId: dealId, campos: {} };
    ploomes.campos[CAMPO_DATA_COMBINADA_PLOOMES] = data;
  }
  operacoes.push({
    aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id',
    linha: { id: texto(sugestao.id), status: destino, decidido_em: agora, decidido_por: usuario }
  });
  return {
    ok: true,
    idempotente: false,
    operacoes: operacoes,
    historicos: [],
    ploomes: ploomes,
    textoHistorico: decisao === 'IGNORAR' ? usuario + ' ignorou a sugestão do WhatsApp.' :
      usuario + ' aceitou a sugestão do WhatsApp' + (tipo === 'NOVA_DATA_COMBINADA' ? ': nova data ' + data.slice(8, 10) + '/' + data.slice(5, 7) + ' · ' + motivo : ': ' + texto(sugestao.resumo))
  };
}

// ----- src/associador.js -----
// ===== src/associador.js =====
// Associador por IA (22/10): liga a mensagem da oficina à OS certa quando as
// regras fixas (citação, OS no texto, única cobrança) não resolvem. Regras
// puras; a IA só escolhe entre candidatos e nunca recebe JID, telefone ou nome.

var LIMITE_CONFIANCA_ASSOCIADOR = 0.8;
var HORAS_PERGUNTA_ASSOCIACAO = 24;
var LIMITE_CONVERSA_ASSOCIADOR = 10;
var RESULTADOS_ASSOCIADOR = { OS: 1, DUVIDA: 1, NAO_OS: 1 };

var INSTRUCOES_ASSOCIADOR_WHATSAPP = 'Descubra de qual OS da lista a mensagem da oficina fala. ' +
  'As oficinas conhecem a peça, não o número da OS. Use a conversa recente do grupo. ' +
  'Responda OS quando tiver certeza, DUVIDA com 2 ou 3 candidatos quando não souber entre eles, ' +
  'NAO_OS quando a mensagem não fala de nenhuma peça (saudação, ok, figurinha). ' +
  'Com pergunta, diga em respondePergunta se a mensagem responde a ela. Devolva só o objeto.';

var SCHEMA_ASSOCIADOR_WHATSAPP = {
  resultado: ['OS', 'DUVIDA', 'NAO_OS'],
  os: 'número da OS escolhida (só em OS)',
  candidatos: 'lista de 2 ou 3 números de OS (só em DUVIDA)',
  confianca: 'número entre 0 e 1',
  motivo: 'frase curta em português',
  respondePergunta: 'true quando a mensagem é a resposta da oficina à pergunta enviada (só com pergunta)'
};

function ultimaMensagemPcpAssociador(mensagens, dealId) {
  var enviadas = (mensagens || []).filter(function (m) {
    return m && texto(m.deal_id) === dealId && semAcento(m.direcao) === 'ENVIADA' && mensagemVistaPelaOficina(m);
  }).sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); });
  var ultima = enviadas[enviadas.length - 1];
  return ultima ? { quando: texto(ultima.quando), texto: cortarTextoInterprete(ultima.texto) } : null;
}

// permitidos (revisão de 23/10): até o go-live, só os deals liberados (vazio = todos).
function candidatosAssociacaoWhatsapp(producoes, oficinaId, mensagens, hojeISO, permitidos) {
  var lista = (permitidos || []).map(texto);
  return (producoes || []).filter(function (p) {
    if (lista.length && lista.indexOf(texto(p && p.deal_id)) < 0) return false;
    return p && texto(p.deal_id) && texto(p.oficina_id) === texto(oficinaId) && semAcento(p.em_costura) === 'SIM';
  }).map(function (p) {
    var dealId = texto(p.deal_id);
    var status = statusPrazo({ dealId: dealId, os: texto(p.os), dataCombinada: texto(p.data_combinada), leadTime: texto(p.lead_time) }, hojeISO);
    var pecas = numero(p.pecas);
    return {
      dealId: dealId, os: texto(p.os), peca: texto(p.peca), referencia: texto(p.referencia),
      pecas: pecas === null || isNaN(pecas) ? null : pecas,
      prazoVigente: status.data, statusPrazo: status.status,
      ultimaMensagemPcp: ultimaMensagemPcpAssociador(mensagens, dealId)
    };
  });
}

function contextoAssociadorWhatsapp(msg, candidatos, mensagensGrupo, pergunta) {
  var conversa = linhasWhatsappUnicas((mensagensGrupo || []).filter(mensagemVistaPelaOficina), false)
    .sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); })
    .slice(-LIMITE_CONVERSA_ASSOCIADOR)
    .map(function (m) {
      return {
        direcao: semAcento(m.direcao), quando: texto(m.quando),
        texto: semAcento(m.tipo_conteudo) === 'NAO_TEXTUAL' ? '[conteúdo não textual]' : cortarTextoInterprete(m.texto),
        os: texto(m.os)
      };
    });
  return {
    texto: cortarTextoInterprete(msg && msg.texto),
    quando: texto(msg && msg.quando),
    candidatos: (candidatos || []).map(function (c) {
      return { os: c.os, peca: c.peca, referencia: c.referencia, pecas: c.pecas, prazoVigente: c.prazoVigente, statusPrazo: c.statusPrazo, ultimaMensagemPcp: c.ultimaMensagemPcp };
    }),
    conversa: conversa,
    pergunta: pergunta ? {
      texto: cortarTextoInterprete(pergunta.texto),
      candidatos: (pergunta.candidatos || []).slice(),
      mensagemOriginal: cortarTextoInterprete(pergunta.mensagemOriginal)
    } : null,
    instrucoes: INSTRUCOES_ASSOCIADOR_WHATSAPP,
    schema: JSON.parse(JSON.stringify(SCHEMA_ASSOCIADOR_WHATSAPP))
  };
}

function validarAssociacaoWhatsapp(valor, candidatos) {
  var falha = function (erro) { return { ok: false, erro: erro }; };
  if (!valor || typeof valor !== 'object') return falha('Saída do associador vazia.');
  var resultado = semAcento(valor.resultado);
  if (!RESULTADOS_ASSOCIADOR[resultado]) return falha('Resultado inválido do associador.');
  var confianca = Number(valor.confianca);
  if (!isFinite(confianca) || confianca < 0 || confianca > 1) return falha('Confiança inválida do associador.');
  var porOs = {};
  (candidatos || []).forEach(function (c) { porOs[texto(c.os)] = c; });
  var motivo = cortarTextoInterprete(valor.motivo, 200);
  var lista = Array.isArray(valor.candidatos) ? valor.candidatos.map(texto) : [];
  var vistos = {};
  for (var i = 0; i < lista.length; i++) {
    if (!porOs[lista[i]] || vistos[lista[i]]) return falha('Candidatos inválidos do associador.');
    vistos[lista[i]] = 1;
  }
  var duvida = function () {
    if (lista.length < 2 || lista.length > 3) return null;
    return { ok: true, resultado: 'DUVIDA', dealId: '', os: '', candidatos: lista.map(function (os) { return porOs[os].dealId; }), confianca: confianca, motivo: motivo };
  };
  // NAO_OS some do app: só com confiança alta (revisão de 23/10).
  if (resultado === 'NAO_OS') {
    return { ok: true, resultado: confianca >= LIMITE_CONFIANCA_ASSOCIADOR ? 'NAO_OS' : 'SEM_ASSOCIACAO', dealId: '', os: '', candidatos: [], confianca: confianca, motivo: motivo };
  }
  if (resultado === 'DUVIDA') return duvida() || falha('Candidatos inválidos do associador.');
  var os = texto(valor.os);
  if (!porOs[os]) return falha('OS fora da lista de candidatos.');
  if (confianca >= LIMITE_CONFIANCA_ASSOCIADOR) {
    return { ok: true, resultado: 'OS', dealId: porOs[os].dealId, os: os, candidatos: [], confianca: confianca, motivo: motivo,
      respondePergunta: valor.respondePergunta === true };
  }
  return duvida() || { ok: true, resultado: 'SEM_ASSOCIACAO', dealId: '', os: '', candidatos: [], confianca: confianca, motivo: motivo };
}

function rotuloPecaPergunta(c, todos) {
  var nome = texto(c.peca) || texto(c.referencia) || 'peça';
  var mesmoNome = todos.filter(function (o) { return (texto(o.peca) || texto(o.referencia) || 'peça') === nome; });
  if (mesmoNome.length < 2) return '*' + nome + '*';
  var mesmaQtd = mesmoNome.filter(function (o) { return o.pecas === c.pecas; });
  if (mesmaQtd.length < 2 && c.pecas !== null && c.pecas !== undefined) return '*' + nome + '* (' + formatarQtd(c.pecas) + (c.pecas === 1 ? ' peça)' : ' peças)');
  return '*' + nome + '* (' + texto(c.referencia) + ')';
}

function textoPerguntaAssociacao(candidatos) {
  var rotulos = (candidatos || []).map(function (c) { return rotuloPecaPergunta(c, candidatos); });
  var lista = rotulos.length > 2 ? rotulos.slice(0, -1).join(', ') + ' ou ' + rotulos[rotulos.length - 1] : rotulos.join(' ou ');
  return 'Olá! Essa mensagem é sobre ' + lista + '?';
}

function perguntaAbertaWhatsapp(mensagens, grupoJid, agora) {
  var agoraMs = Date.parse(texto(agora));
  var limite = HORAS_PERGUNTA_ASSOCIACAO * 3600000;
  return linhasWhatsappUnicas((mensagens || []).filter(function (m) {
    if (!m || semAcento(m.tipo) !== 'PERGUNTA_ASSOCIACAO' || texto(m.grupo_jid) !== texto(grupoJid)) return false;
    if (texto(m.pergunta_fechada_em)) return false;
    var status = semAcento(m.status_envio);
    if (status !== 'ENVIADA' && status !== 'PENDENTE' && status !== 'ENVIANDO') return false;
    var ts = Date.parse(texto(m.quando));
    return isFinite(ts) && isFinite(agoraMs) && agoraMs - ts < limite;
  }), false)[0] || null;
}

// Pergunta que pode ser respondida (revisão de 23/10): aberta, já enviada e
// anterior à mensagem. A trava do grupo continua sendo perguntaAbertaWhatsapp.
function perguntaRespondivelWhatsapp(mensagens, grupoJid, quandoMensagem) {
  var aberta = perguntaAbertaWhatsapp(mensagens, grupoJid, quandoMensagem);
  if (!aberta || semAcento(aberta.status_envio) !== 'ENVIADA') return null;
  return Date.parse(texto(aberta.quando)) < Date.parse(texto(quandoMensagem)) ? aberta : null;
}

function opMensagemWhatsapp(linha, operacao) {
  return { aba: 'WHATSAPP_MENSAGENS', operacao: operacao || 'update', chave: 'id', linha: linha };
}

function linhaLigadaIA(mensagem, cand, v, agora, interpretar) {
  return Object.assign({
    id: texto(mensagem.id), deal_id: cand.dealId, os: cand.os, associacao: 'IA',
    associacao_confianca: v.confianca, associacao_motivo: v.motivo
  }, interpretar ? camposInterpretacaoPendenteWhatsapp(1, agora)
    : { interpretacao_status: '', interpretacao_tentativas: '', interpretacao_proxima: '' });
}

function decidirAssociacaoWhatsapp(entrada, saidaModelo, contexto) {
  entrada = entrada || {};
  contexto = contexto || {};
  var mensagem = entrada.mensagem || {};
  var candidatos = entrada.candidatos || [];
  var agora = texto(contexto.agora);
  var v = validarAssociacaoWhatsapp(saidaModelo, candidatos);
  if (!v.ok) return v;
  var porDeal = {};
  candidatos.forEach(function (c) { porDeal[c.dealId] = c; });

  // Resposta à pergunta (revisão de 23/10): só quando a mensagem cita a pergunta
  // ou o modelo diz que ela responde; falar de uma das peças não basta.
  var daPergunta = entrada.pergunta ? texto(entrada.pergunta.pergunta_candidatos).split(';') : [];
  var citaPergunta = !!entrada.pergunta && !!texto(entrada.pergunta.evolution_id) &&
    texto(mensagem.resposta_a_evolution_id) === texto(entrada.pergunta.evolution_id);
  if (entrada.pergunta && v.resultado === 'OS' && daPergunta.indexOf(v.dealId) >= 0 && (citaPergunta || v.respondePergunta)) {
    var cand = porDeal[v.dealId];
    var original = entrada.original || {};
    // A original só é ligada se ninguém a associou nesse meio-tempo (o PCP pode associar antes).
    var originalLivre = semAcento(original.associacao) === 'IA_DUVIDA' && !texto(original.deal_id);
    var operacoes = [opMensagemWhatsapp(linhaLigadaIA(mensagem, cand, v, agora, false))];
    if (originalLivre) operacoes.push(opMensagemWhatsapp(linhaLigadaIA(original, cand, v, agora, true)));
    operacoes.push(opMensagemWhatsapp({ id: texto(entrada.pergunta.id), deal_id: cand.dealId, os: cand.os, pergunta_fechada_em: agora }));
    return {
      ok: true, resultado: 'OS', operacoes: operacoes,
      interpretar: originalLivre ? { mensagemId: texto(original.id), dealId: cand.dealId } : null
    };
  }

  var base = { id: texto(mensagem.id), associacao_confianca: v.confianca, associacao_motivo: v.motivo };
  if (v.resultado === 'OS') {
    return { ok: true, resultado: 'OS', operacoes: [opMensagemWhatsapp(linhaLigadaIA(mensagem, porDeal[v.dealId], v, agora, true))],
      interpretar: { mensagemId: texto(mensagem.id), dealId: v.dealId } };
  }
  if (v.resultado === 'NAO_OS') {
    return { ok: true, resultado: 'NAO_OS', operacoes: [opMensagemWhatsapp(Object.assign({ associacao: 'NAO_OS' }, base))], interpretar: null };
  }
  if (v.resultado === 'DUVIDA' && !entrada.pergunta && !entrada.grupoTravado) {
    var escolhidos = v.candidatos.map(function (d) { return porDeal[d]; });
    var pergunta = {
      id: texto(contexto.gerarId()), evolution_id: '', quando: agora, grupo_jid: texto(mensagem.grupo_jid), grupo_nome: texto(mensagem.grupo_nome),
      participante_jid: '', participante_nome: 'PCP', direcao: 'ENVIADA', tipo: 'PERGUNTA_ASSOCIACAO', tipo_conteudo: 'TEXTO',
      texto: textoPerguntaAssociacao(escolhidos), resposta_a_evolution_id: texto(mensagem.evolution_id), deal_id: '', os: '',
      oficina_id: texto(mensagem.oficina_id), associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: agora,
      pergunta_candidatos: v.candidatos.join(';'), pergunta_mensagem_id: texto(mensagem.id), pergunta_fechada_em: ''
    };
    return { ok: true, resultado: 'DUVIDA', operacoes: [
      opMensagemWhatsapp(Object.assign({ associacao: 'IA_DUVIDA' }, base)),
      opMensagemWhatsapp(pergunta, 'append')
    ], interpretar: null };
  }
  return { ok: true, resultado: 'SEM_ASSOCIACAO', operacoes: [opMensagemWhatsapp(base)], interpretar: null };
}

function fecharPerguntasVencidasWhatsapp(mensagens, agora) {
  var agoraMs = Date.parse(texto(agora));
  var limite = HORAS_PERGUNTA_ASSOCIACAO * 3600000;
  var unicas = linhasWhatsappUnicas(mensagens || [], false);
  var porId = {};
  unicas.forEach(function (m) { if (m && texto(m.id)) porId[texto(m.id)] = m; });
  var operacoes = [];
  unicas.forEach(function (m) {
    if (!m || semAcento(m.tipo) !== 'PERGUNTA_ASSOCIACAO' || texto(m.pergunta_fechada_em)) return;
    var ts = Date.parse(texto(m.quando));
    if (!isFinite(ts) || !isFinite(agoraMs) || agoraMs - ts < limite) return;
    var fechar = { id: texto(m.id), pergunta_fechada_em: texto(agora) };
    // Ainda na fila: não sai mais (a resposta não seria casada).
    if (semAcento(m.status_envio) === 'PENDENTE') { fechar.status_envio = 'ERRO'; fechar.erro = 'Pergunta vencida antes do envio.'; }
    operacoes.push(opMensagemWhatsapp(fechar));
    var original = porId[texto(m.pergunta_mensagem_id)];
    if (original && semAcento(original.associacao) === 'IA_DUVIDA') {
      operacoes.push(opMensagemWhatsapp({ id: texto(original.id), associacao: 'SEM_ASSOCIACAO' }));
    }
  });
  return { operacoes: operacoes };
}

// Corpo do sendText. A Evolution não guarda mensagens: a citação leva a original inteira.
function corpoEnvioWhatsapp(selecionada, mensagens) {
  selecionada = selecionada || {};
  var corpo = { number: texto(selecionada.grupo_jid), text: typeof selecionada.texto === 'string' ? selecionada.texto : '' };
  var linha = linhasWhatsappUnicas((mensagens || []).filter(function (m) { return m && texto(m.id) === texto(selecionada.id); }), false)[0] || {};
  var citada = texto(linha.resposta_a_evolution_id);
  if (!citada) return corpo;
  var original = (mensagens || []).filter(function (m) { return m && texto(m.evolution_id) === citada; })[0];
  if (!original) return corpo;
  corpo.quoted = {
    key: { id: citada, remoteJid: corpo.number, fromMe: false, participant: texto(original.participante_jid) },
    message: { conversation: typeof original.texto === 'string' ? original.texto : texto(original.texto) }
  };
  return corpo;
}

// A entrada grava a mensagem DEPOIS de ler a planilha (QA de 23/10): para o
// Finalizar Associação poder atualizá-la, a linha gravada entra na leitura com o
// número que a gravação devolveu (updatedRange do values:append).
function incluirLinhaGravadaWhatsapp(planilha, linha, respostaGravacao) {
  var aba = 'WHATSAPP_MENSAGENS';
  var range = texto(respostaGravacao && respostaGravacao.updates && respostaGravacao.updates.updatedRange);
  var numero = range ? linhaInicialDoRange(range) : NaN;
  if (!planilha || !planilha.linhas || !linha || !texto(linha.id) || !isFinite(numero) || numero < 2) return planilha;
  var linhas = planilha.linhas[aba] || [];
  var ja = linhas.some(function (l) { return l && texto(l.id) === texto(linha.id); });
  if (!ja) {
    planilha.linhas[aba] = linhas.concat([Object.assign({ row_number: numero }, linha)]);
    if (typeof planilha.ultimaLinha[aba] === 'number' && numero > planilha.ultimaLinha[aba]) planilha.ultimaLinha[aba] = numero;
  }
  return planilha;
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

// ----- src/planilhaLote.js -----
// ===== src/planilhaLote.js =====
// Leitura e gravacao em lote na planilha (API do Google Sheets direto, por
// um HTTP Request com a credencial googleApi), no lugar de um node Google
// Sheets por aba. Leitura: values:batchGet -> linhas iguais as do node
// Sheets (objeto por cabecalho + row_number). Gravacao: a lista
// operacoes[]/historicos[] do processarAcao vira poucas requisicoes, na
// ordem segura (pedidos antes da baixa, historico por ultimo).

var URL_PLANILHAS = 'https://sheets.googleapis.com/v4/spreadsheets/';
var PLANILHA_ID = '1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww';  // planilha do PCP MRBL

// Abas lidas por ramo, na ordem do batchGet. { soCabecalho } le so a linha 1
// (o ramo acao so precisa do cabecalho do HISTORICO_APP para o append).
// FORNECEDORES e RESPONSAVEIS (opcoes do pedido) precisam existir na planilha:
// aba que nao existe derruba o batchGet inteiro (400). Aba vazia tudo bem.
// PREVISAO_MEDIAS (previsao de futuro) tambem precisa existir antes de publicar.
// EMAILS_PCP (F5c) idem: crie a aba com o cabecalho antes de publicar a API.
var LEITURAS_BOARD = ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'HISTORICO_APP', 'USUARIOS',
  'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS', 'EMAILS_PCP'];
var LEITURAS_ACAO = ['FALTANTES', 'CAIXAS_PCP', 'CAIXAS GANHAS', 'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'EMAILS_PCP',
  { aba: 'HISTORICO_APP', soCabecalho: true }];
// Entrada do WhatsApp (e o workflow Interpretar WhatsApp): FALTANTES e CAIXAS GANHAS
// dão as faltas abertas da OS ao contexto do intérprete.
var LEITURAS_WHATSAPP_ENTRADA = ['OFICINAS', 'PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'FALTANTES', 'CAIXAS GANHAS'];
// Agendamento das novas tentativas do intérprete (workflow Retentar Interpretação).
var LEITURAS_RETENTAR_INTERPRETACAO = ['PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
// Sync da produção (a cada 5 min): as médias da previsão entram na projeção das OS previstas.
var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS', 'PREVISAO_MEDIAS'];
// Workflow diário "PCP MRBL - Médias de Previsão".
var LEITURAS_MEDIAS_PREVISAO = ['PREVISAO_MEDIAS'];
// F5c: "PCP MRBL - Ler E-mails do PCP" (FALTANTES e CAIXAS GANHAS dão os itens em aberto
// da OS ao intérprete) e a releitura da aba antes de gravar as interpretações.
var LEITURAS_EMAILS_PCP = ['EMAILS_PCP', 'FALTANTES', 'CAIXAS GANHAS'];
var LEITURAS_EMAILS_PCP_RELER = ['EMAILS_PCP'];

// Destinos aceitos: (aba, operacao, chave). update = so linha existente;
// appendOrUpdate = atualiza se achar a chave, senao inclui; append = inclui.
var DESTINOS_ESCRITA = [
  { aba: 'PEDIDOS', operacao: 'append', chave: 'id' },
  { aba: 'PEDIDOS', operacao: 'update', chave: 'id' },
  { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id' },
  { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id' },
  { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id' },
  { aba: 'ETAPAS_PEDIDO', operacao: 'update', chave: 'id' },
  { aba: 'FALTANTES', operacao: 'update', chave: 'id' },
  { aba: 'FALTANTES', operacao: 'append', chave: 'id' },  // nova demanda pos-saida
  { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id' },
  { aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id' },
  { aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id' },
  { aba: 'OFICINAS', operacao: 'appendOrUpdate', chave: 'ploomes_id' },
  { aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id' },
  { aba: 'WHATSAPP_MENSAGENS', operacao: 'appendOrUpdate', chave: 'id' },
  { aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id' },
  { aba: 'WHATSAPP_SUGESTOES', operacao: 'append', chave: 'id' },
  { aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id' },
  { aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id' },  // capacidade_semana (só ADM)
  // Médias da previsão (19/10): linha casada pela coluna chave (tipo|etapa|faixa|oficina_id).
  { aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave' },
  { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave' },
  // E-mails do PCP (F5c): linha nova da leitura e update da interpretação/decisão.
  { aba: 'EMAILS_PCP', operacao: 'append', chave: 'id' },
  { aba: 'EMAILS_PCP', operacao: 'update', chave: 'id' }
];
// Ordem dos appends (antes do batchUpdate). HISTORICO_APP vai sempre no fim.
var ORDEM_APPEND = ['PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'CAIXAS_PCP', 'FALTANTES',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
// Abas que nunca ganham coluna numa gravação (as da F4 e a EMAILS_PCP da F5c).
var ABAS_F4 = { PRODUCAO: 1, OFICINAS: 1, WHATSAPP_MENSAGENS: 1, WHATSAPP_SUGESTOES: 1, PREVISAO_MEDIAS: 1, EMAILS_PCP: 1 };
var ABA_HISTORICO = 'HISTORICO_APP';
// Falha numa gravacao (depois das tentativas): uma linha na aba ERROS_APP (colunas
// quando, usuario, tipo, deal_id, passo, url, erro) e 500 com este aviso para o site.
var ABA_ERROS = 'ERROS_APP';
var ERRO_GRAVACAO = 'Falha ao gravar na planilha. Avise o PCP antes de tentar de novo.';

function nomeDaLeitura(l) {
  return typeof l === 'string' ? l : l.aba;
}

// 'ABA' entre aspas simples (abas com espaco), com o trecho opcional (A1, C3:D3).
function rangeDaAba(aba, trecho) {
  return "'" + String(aba).replace(/'/g, "''") + "'" + (trecho ? '!' + trecho : '');
}

// 0 -> A, 25 -> Z, 26 -> AA.
function letraDaColuna(i) {
  var s = '';
  var n = i + 1;
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function urlLeitura(docId, leituras) {
  var ranges = leituras.map(function (l) {
    var trecho = typeof l === 'string' || !l.soCabecalho ? '' : '1:1';
    return 'ranges=' + encodeURIComponent(rangeDaAba(nomeDaLeitura(l), trecho));
  });
  return URL_PLANILHAS + docId + '/values:batchGet?' + ranges.join('&') +
    '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';
}

function celulaVazia(v) {
  return v === undefined || v === null || v === '';
}

// values (linhas da API, a primeira e o cabecalho) -> [{ row_number, <cabecalho>: valor }].
// Celula vazia ou cortada no fim da linha vira '' (como o node Sheets);
// coluna sem nome no cabecalho e linha toda vazia ficam de fora.
function linhasDaAba(values, linhaInicial) {
  var v = values || [];
  var inicio = linhaInicial || 1;
  var cab = (v[0] || []).map(function (c) { return texto(c); });
  var saida = [];
  for (var i = 1; i < v.length; i++) {
    var lin = v[i] || [];
    if (lin.every(celulaVazia)) continue;
    var o = { row_number: inicio + i };
    cab.forEach(function (c, j) {
      if (c === '') return;
      o[c] = celulaVazia(lin[j]) ? '' : lin[j];
    });
    saida.push(o);
  }
  return saida;
}

// Linha inicial do range devolvido ("'CAIXAS GANHAS'!A1:Z100" -> 1).
function linhaInicialDoRange(range) {
  var m = /![A-Z]*(\d+)/.exec(texto(range));
  return m ? Number(m[1]) : 1;
}

// Numero (na planilha) da ultima linha com algum dado, contando o cabecalho e as
// linhas que o linhasDaAba pula (coluna sem nome); so cabecalho ou aba vazia = a
// linha do cabecalho.
function ultimaLinhaComDados(values, linhaInicial) {
  var v = values || [];
  for (var i = v.length - 1; i > 0; i--) {
    if (!(v[i] || []).every(celulaVazia)) return linhaInicial + i;
  }
  return linhaInicial;
}

// Resposta do values:batchGet -> { linhas: { ABA: [...] }, cabecalhos: { ABA: [...] },
// linhaCabecalho: { ABA: n }, ultimaLinha: { ABA: n | null } }. Os valueRanges vem na
// ordem pedida. ultimaLinha e null na aba lida so pelo cabecalho (nao se sabe onde
// ela termina).
function planilhaDoLote(resposta, leituras) {
  var vr = resposta && resposta.valueRanges;
  if (!vr || vr.length !== leituras.length) {
    throw new Error('Leitura em lote: esperava ' + leituras.length + ' abas, veio ' + (vr ? vr.length : 0));
  }
  var p = { linhas: {}, cabecalhos: {}, linhaCabecalho: {}, ultimaLinha: {} };
  leituras.forEach(function (l, i) {
    var aba = nomeDaLeitura(l);
    var inicio = linhaInicialDoRange(vr[i].range);
    var values = vr[i].values || [];
    p.linhas[aba] = linhasDaAba(values, inicio);
    p.cabecalhos[aba] = (values[0] || []).map(function (c) { return texto(c); });
    p.linhaCabecalho[aba] = inicio;
    p.ultimaLinha[aba] = typeof l !== 'string' && l.soCabecalho ? null : ultimaLinhaComDados(values, inicio);
  });
  return p;
}

// Linha do ERROS_APP, best-effort (nada aqui pode falhar): [quando, usuario, tipo,
// deal_id, passo, url, erro]. Nunca leva o corpo da acao nem dados do login.
// d = { agora (ms), sessao, corpo, historicos, lote: { passo, de, url }, erro }
function linhaErroApp(d) {
  d = d || {};
  var corpo = d.corpo && typeof d.corpo === 'object' ? d.corpo : {};
  var deals = [];
  function juntar(x) {
    var t = texto(x);
    if (t !== '' && deals.indexOf(t) < 0) deals.push(t);
  }
  juntar(corpo.dealId);
  (Array.isArray(d.historicos) ? d.historicos : []).forEach(function (h) { if (h) juntar(h.deal_id); });
  var lote = d.lote || {};
  var passo = lote.passo !== undefined && lote.passo !== null ? texto(lote.passo) + (lote.de ? '/' + texto(lote.de) : '') : '';
  var erro = d.erro;
  var msg = '';
  if (erro && typeof erro === 'object') msg = texto(erro.message) || texto(erro.description) || tentarJson(erro);
  else msg = texto(erro);
  var quando = '';
  try { quando = new Date(typeof d.agora === 'number' ? d.agora : Date.now()).toISOString(); } catch (e) { quando = ''; }
  return [quando, texto(d.sessao && d.sessao.nome), texto(corpo.tipo), deals.join(', '), passo, texto(lote.url), msg.slice(0, 500)];
}

function tentarJson(x) {
  try { return JSON.stringify(x); } catch (e) { return ''; }
}

// Append da linha no ERROS_APP. INSERT_ROWS: aba de registro, nunca sobrescreve.
function requisicaoErroApp(linha, docId) {
  return {
    method: 'POST',
    url: URL_PLANILHAS + docId + '/values/' + encodeURIComponent(rangeDaAba(ABA_ERROS, 'A1')) +
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    body: { values: [linha] },
    repetir: false
  };
}

function valorGravado(v) {
  return v === undefined || v === null ? '' : v;
}

function conferirOperacao(o) {
  var conhecido = DESTINOS_ESCRITA.some(function (d) {
    return d.aba === o.aba && d.operacao === o.operacao && d.chave === o.chave;
  });
  if (!conhecido) throw new Error('Operacao sem destino no workflow: ' + o.aba + ' ' + o.operacao + ' ' + o.chave);
  if (!o.linha || !Object.keys(o.linha).length) throw new Error('Operacao sem linha: ' + o.aba + ' ' + o.operacao);
  if (o.operacao !== 'append' && (o.linha[o.chave] === undefined || o.linha[o.chave] === '')) {
    throw new Error('Operacao sem chave ' + o.chave + ': ' + o.aba + ' ' + o.operacao);
  }
}

// Nas abas novas da F4, nunca cria coluna durante uma acao. Todos os campos
// precisam ter sido preparados no checklist antes de qualquer requisicao.
function conferirCabecalhoF4(o, planilha) {
  if (!ABAS_F4[o.aba]) return;
  var cab = planilha && planilha.cabecalhos && planilha.cabecalhos[o.aba];
  if (!cab) throw new Error('Cabeçalho obrigatório ausente: aba ' + o.aba);
  Object.keys(o.linha || {}).forEach(function (campo) {
    if (cab.indexOf(campo) < 0) throw new Error('Cabeçalho obrigatório ausente: ' + o.aba + '.' + campo);
  });
}

// operacoes[] + historicos[] -> [{ method, url, body }] na ordem de execucao:
// 1) cabecalhos novos (campo sem coluna vai para a proxima coluna livre).
//    Atencao: duas acoes ao mesmo tempo que criem coluna na mesma aba escolhem a
//    MESMA coluna livre (cada uma so conhece o cabecalho que leu) e uma sobrescreve
//    a outra. Por isso as colunas novas de cada entrega (concluido_em, origem...)
//    sao criadas a mao antes do deploy, pelo runbook (n8n/workflows/README.md);
// 2) values:append por aba (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, CAIXAS_PCP,
//    FALTANTES), incluindo appendOrUpdate cuja chave nao existe. O range comeca
//    na linha logo depois da ultima linha com dados que foi lida (ultimaLinha):
//    o append do Google procura a tabela a partir do range, e uma linha toda
//    vazia no meio da aba encerraria a tabela comecando no cabecalho, fazendo o
//    append de N linhas sobrescrever N-1 linhas reais abaixo do buraco. Outra
//    acao que gravou ali depois da leitura vira a tabela daquele ponto e o append
//    continua depois dela. OVERWRITE: escreve nas linhas vazias sem deslocar
//    linhas, entao os row_number lidos seguem valendo para o batchUpdate;
// 3) um values:batchUpdate com todas as atualizacoes (so as colunas presentes
//    na operacao, sem a coluna de casamento; a linha vem dos dados lidos);
// 4) values:append no HISTORICO_APP. Aba lida so pelo cabecalho (o ramo acao le
//    so a linha 1 do HISTORICO_APP) nao tem ultimaLinha: o append parte do
//    cabecalho com INSERT_ROWS, que insere linhas novas em vez de sobrescrever
//    (vai por ultimo, entao deslocar linhas nao afeta o batchUpdate).
// Cada requisicao leva repetir: true quando pode ser repetida sem efeito em
// dobro (batchUpdate grava os mesmos valores nas mesmas celulas); append nao.
// Varias operacoes na mesma linha se juntam (a ultima vence). Qualquer erro
// (destino desconhecido, update sem linha, aba nao lida) falha antes de
// devolver qualquer requisicao.
function requisicoesDeEscrita(operacoes, historicos, planilha, docId) {
  var base = URL_PLANILHAS + docId + '/values';
  var abas = {};  // aba -> { cab, novos, anexos: [{ chave, valor, linha }], atualiza: { row: {campos} }, ordemRows }
  var ordemAbas = [];

  function estadoDa(aba) {
    if (abas[aba]) return abas[aba];
    if (!planilha || !planilha.cabecalhos || !planilha.cabecalhos[aba]) {
      throw new Error('Aba não lida antes da gravação: ' + aba);
    }
    abas[aba] = {
      aba: aba,
      cab: planilha.cabecalhos[aba].slice(),
      linhaCab: planilha.linhaCabecalho[aba] || 1,
      ultimaLinha: planilha.ultimaLinha && typeof planilha.ultimaLinha[aba] === 'number' ? planilha.ultimaLinha[aba] : null,
      novos: [],
      anexos: [],
      atualiza: {},
      ordemRows: []
    };
    ordemAbas.push(aba);
    return abas[aba];
  }

  function garantirColunas(e, linha) {
    Object.keys(linha).forEach(function (k) {
      if (e.cab.indexOf(k) < 0) {
        e.cab.push(k);
        e.novos.push(k);
      }
    });
  }

  function linhaExistente(aba, chave, valor) {
    var alvo = texto(valor);
    return (planilha.linhas[aba] || []).filter(function (l) { return texto(l[chave]) === alvo; })[0] || null;
  }

  function anexoPendente(e, chave, valor) {
    var alvo = texto(valor);
    for (var i = e.anexos.length - 1; i >= 0; i--) {
      if (e.anexos[i].chave === chave && texto(e.anexos[i].linha[chave]) === alvo) return e.anexos[i];
    }
    return null;
  }

  function juntar(destino, linha) {
    Object.keys(linha).forEach(function (k) { destino[k] = linha[k]; });
  }

  (operacoes || []).forEach(conferirOperacao);
  (operacoes || []).forEach(function (o) { conferirCabecalhoF4(o, planilha); });
  (operacoes || []).forEach(function (o) {
    var e = estadoDa(o.aba);
    garantirColunas(e, o.linha);
    if (o.operacao === 'append') {
      e.anexos.push({ chave: o.chave, linha: Object.assign({}, o.linha) });
      return;
    }
    var existente = linhaExistente(o.aba, o.chave, o.linha[o.chave]);
    if (existente) {
      var row = existente.row_number;
      if (!e.atualiza[row]) {
        e.atualiza[row] = { chave: o.chave, campos: {} };
        e.ordemRows.push(row);
      }
      juntar(e.atualiza[row].campos, o.linha);
      return;
    }
    var pendente = anexoPendente(e, o.chave, o.linha[o.chave]);
    if (pendente) {
      juntar(pendente.linha, o.linha);
      return;
    }
    if (o.operacao === 'update') {
      throw new Error('Linha não encontrada para update: ' + o.aba + ' ' + o.chave + '=' + texto(o.linha[o.chave]));
    }
    e.anexos.push({ chave: o.chave, linha: Object.assign({}, o.linha) });
  });

  var hist = historicos || [];
  if (hist.length) {
    var eh = estadoDa(ABA_HISTORICO);
    hist.forEach(function (h) { garantirColunas(eh, h); });
  }

  function linhaNoCabecalho(e, linha) {
    return e.cab.map(function (c) {
      return Object.prototype.hasOwnProperty.call(linha, c) ? valorGravado(linha[c]) : '';
    });
  }

  function append(aba, linhas) {
    var e = abas[aba];
    var conhecida = e.ultimaLinha !== null;
    return {
      method: 'POST',
      url: base + '/' + encodeURIComponent(rangeDaAba(aba, 'A' + (conhecida ? e.ultimaLinha + 1 : e.linhaCab))) +
        ':append?valueInputOption=RAW&insertDataOption=' + (conhecida ? 'OVERWRITE' : 'INSERT_ROWS'),
      body: { values: linhas.map(function (l) { return linhaNoCabecalho(e, l); }) },
      repetir: false
    };
  }

  // Trechos contiguos de colunas numa linha: [{ ini, valores }].
  function trechos(e, row, campos, pular) {
    var cols = Object.keys(campos)
      .filter(function (k) { return k !== pular; })
      .map(function (k) { return { i: e.cab.indexOf(k), v: valorGravado(campos[k]) }; })
      .sort(function (a, b) { return a.i - b.i; });
    var out = [];
    cols.forEach(function (c) {
      var ult = out[out.length - 1];
      if (ult && ult.fim === c.i - 1) {
        ult.valores.push(c.v);
        ult.fim = c.i;
      } else {
        out.push({ ini: c.i, fim: c.i, valores: [c.v] });
      }
    });
    return out.map(function (t) {
      var r = letraDaColuna(t.ini) + row + (t.fim > t.ini ? ':' + letraDaColuna(t.fim) + row : '');
      return { range: rangeDaAba(e.aba, r), values: [t.valores] };
    });
  }

  var reqs = [];
  var cabecalhos = [];
  ordemAbas.forEach(function (aba) {
    var e = abas[aba];
    if (!e.novos.length) return;
    var ini = e.cab.length - e.novos.length;
    var r = letraDaColuna(ini) + e.linhaCab + (e.novos.length > 1 ? ':' + letraDaColuna(e.cab.length - 1) + e.linhaCab : '');
    cabecalhos.push({ range: rangeDaAba(aba, r), values: [e.novos.slice()] });
  });
  if (cabecalhos.length) {
    reqs.push({ method: 'POST', url: base + ':batchUpdate', body: { valueInputOption: 'RAW', data: cabecalhos }, repetir: true });
  }

  var ordem = ORDEM_APPEND.concat(ordemAbas.filter(function (a) {
    return ORDEM_APPEND.indexOf(a) < 0 && a !== ABA_HISTORICO;
  }));
  ordem.forEach(function (aba) {
    var e = abas[aba];
    if (e && e.anexos.length) reqs.push(append(aba, e.anexos.map(function (x) { return x.linha; })));
  });

  var dados = [];
  ordemAbas.forEach(function (aba) {
    var e = abas[aba];
    e.ordemRows.forEach(function (row) {
      var a = e.atualiza[row];
      dados = dados.concat(trechos(e, row, a.campos, a.chave));
    });
  });
  if (dados.length) {
    reqs.push({ method: 'POST', url: base + ':batchUpdate', body: { valueInputOption: 'RAW', data: dados }, repetir: true });
  }

  if (hist.length) reqs.push(append(ABA_HISTORICO, hist));
  return reqs;
}

// ----- src/peca.js -----
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

// ----- src/emailsPcp.js -----
// ===== src/emailsPcp.js =====
// F5c · E-mails do PCP (27/10): as respostas da equipe aos e-mails do Ploomes
// ("Caixa separada - OS:X ...") viram sugestões no app, que só gravam depois do
// Aceitar. Funções puras; o workflow "PCP MRBL - Ler E-mails do PCP" faz a
// leitura do Gmail (só leitura) e as chamadas ao intérprete.
// Depende de util.js, acoes.js, montarCaixas.js, whatsapp.js e producao.js.

// Colunas da aba EMAILS_PCP, nessa ordem (o cabeçalho é criado à mão antes de publicar).
var COLUNAS_EMAILS_PCP = ['id', 'thread_id', 'quando', 'de_nome', 'assunto', 'os', 'modelo', 'texto', 'tipo', 'valor',
  'itens', 'resumo', 'evidencia', 'confianca', 'status', 'tentativas', 'decidido_em', 'decidido_por'];
var ABA_EMAILS_PCP = 'EMAILS_PCP';
var LIMITE_TEXTO_EMAIL_PCP = 1500;

// ----- Assunto -----

// "Caixa separada - OS:90001 | Ref: R" -> '90001'. Sem número depois de "OS:" -> ''.
function osDoAssuntoEmailPcp(assunto) {
  var m = /(?:^|[^A-Za-z])OS\s*:\s*(\d+)/i.exec(texto(assunto));
  return m ? m[1] : '';
}

function modeloDoAssuntoEmailPcp(assunto) {
  var a = semAcento(assunto).replace(/\s+/g, ' ');
  if (a.indexOf('CAIXA SEPARADA') >= 0) return 'CAIXA_SEPARADA';
  if (a.indexOf('ITENS FALTANDO POS CORTE') >= 0) return 'POS_CORTE';
  if (a.indexOf('ITENS RECEBIDOS SP') >= 0) return 'RECEBIDOS_SP';
  return 'OUTRO';
}

// ----- Limpeza do texto -----
// Linha (sem espaços nas pontas) a partir da qual vem o histórico citado.
var INICIO_HISTORICO_EMAIL_PCP = [
  // "Enviado:/Sent:" sozinhos não cortam: no Outlook vêm sempre depois de "De:/From:", e
  // "Enviado: hoje pela transportadora" é conteúdo (revisão de 27/10).
  /^(De|From)\s*:/i,
  /^Em\s.+\sescreveu\s*:?$/i,
  /^On\s.+\swrote\s*:?$/i,
  /^-{2,}\s*(Original|Mensagem original|Mensagem encaminhada|Forwarded)/i,
  /^_{8,}$/,
  /^>/
];
// "Em seg., 27 de out. ... <x@y>" quebrado em até 3 linhas (o Gmail quebra onde quiser): a
// linha que termina em "escreveu:"/"wrote:" corta, e com ela as 2 anteriores se uma começar
// com "Em "/"On ".
var INICIO_HISTORICO_QUEBRADO_EMAIL_PCP = [/^Em\s/i, /^On\s/i];
var FIM_HISTORICO_QUEBRADO_EMAIL_PCP = [/(escreveu|wrote)\s*:?$/i];
// Endereço de e-mail que sobrar no texto (nunca vai à planilha nem ao intérprete).
var ENDERECO_EMAIL_PCP = /<?[^\s<>@]+@[^\s<>]+\.[^\s<>]+>?/g;
// Linha a partir da qual vem a assinatura.
var INICIO_ASSINATURA_EMAIL_PCP = [
  /^--\s*$/,
  /^Atenciosamente\b/i,
  /^Att(\.|,|\s|$)/i,
  /^(Best |Kind |Warm )?Regards\b/i,
  /^Enviado do meu\b/i,
  /^Sent from my\b/i
];

function casaAlgumEmailPcp(linha, padroes) {
  return padroes.some(function (p) { return p.test(linha); });
}

// Corta o histórico citado e a assinatura; junta o resto numa linha só (máx. 1500).
function limparTextoEmailPcp(valor) {
  var linhas = String(valor === null || valor === undefined ? '' : valor).replace(/\r\n?/g, '\n').split('\n');
  var fica = [];
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i].trim();
    if (casaAlgumEmailPcp(l, INICIO_HISTORICO_EMAIL_PCP) || casaAlgumEmailPcp(l, INICIO_ASSINATURA_EMAIL_PCP)) break;
    if (casaAlgumEmailPcp(l, FIM_HISTORICO_QUEBRADO_EMAIL_PCP)) {
      for (var k = Math.max(0, fica.length - 2); k < fica.length; k++) {
        if (casaAlgumEmailPcp(fica[k], INICIO_HISTORICO_QUEBRADO_EMAIL_PCP)) { fica = fica.slice(0, k); break; }
      }
      break;
    }
    if (l) fica.push(l);
  }
  return fica.join(' ').replace(ENDERECO_EMAIL_PCP, '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_TEXTO_EMAIL_PCP);
}

// ----- Intérprete -----
var TIPOS_EMAIL_PCP = { PREVISAO: 1, QUANTIDADE: 1, CHAMADO: 1, OBSERVACAO: 1 };
var LIMITE_ITENS_INTERPRETE_EMAIL_PCP = 30;
var CONFIANCA_MINIMA_EMAIL_PCP = 0.7;
var MODELO_GROQ_EMAIL_PCP = 'openai/gpt-oss-120b';
var LIMITE_CONTEXTO_GROQ_EMAIL_PCP = 12000;

var INSTRUCOES_INTERPRETE_EMAIL_PCP = 'Interprete a resposta da equipe a um e-mail do PCP sobre a caixa de materiais de uma OS. ' +
  'Use só o campo texto (a resposta, já sem o histórico citado e sem a assinatura); o assunto e os itens em aberto da OS são contexto. ' +
  'PREVISAO: a resposta dá uma data de chegada ou entrega (valor = a data; itens = os nomes dos itens em aberto citados, ou lista vazia se vale para a caixa toda). ' +
  'QUANTIDADE: a resposta informa a quantidade conferida de um item (valor = o número; itens = o nome desse item). ' +
  'CHAMADO: a resposta informa um chamado aberto (valor = o número do chamado). ' +
  'OBSERVACAO: qualquer outra coisa (pedido de conferência, dúvida, recado). ' +
  'A evidência é a cópia literal de um trecho curto do texto que sustenta a interpretação. Devolva somente o objeto JSON.';

var SCHEMA_INTERPRETE_EMAIL_PCP = {
  tipo: ['PREVISAO', 'QUANTIDADE', 'CHAMADO', 'OBSERVACAO'],
  valor: 'PREVISAO: data ISO ou dd/mm; QUANTIDADE: número; CHAMADO: número do chamado; OBSERVACAO: vazio',
  itens: 'lista com os nomes (como em itensAbertos) dos itens citados; vazia quando não cita item',
  resumo: 'resumo curto em português',
  evidencia: 'cópia literal de um trecho curto do campo texto que sustenta a interpretação',
  confianca: 'número entre 0 e 1'
};

// Itens em aberto das caixas da OS (montarCaixas): o contexto do intérprete e a
// lista contra a qual os itens citados são conferidos.
function itensAbertosDaOsEmailPcp(caixas, os) {
  var alvo = texto(os);
  var out = [];
  if (!alvo) return out;
  (caixas || []).forEach(function (c) {
    if (!c || texto(c.os) !== alvo) return;
    (c.itens || []).forEach(function (i) {
      // Só itens da FALTANTES: os lidos do texto da CAIXAS GANHAS (editavel false) não recebem previsão.
      if (i && i.editavel !== false && itemEstaAberto(i)) {
        out.push({ id: texto(i.id), dealId: texto(c.dealId), nome: texto(i.nome), cor: texto(i.cor), un: texto(i.un), resta: i.resta });
      }
    });
  });
  return out;
}

function nomeItemEmailPcp(i) {
  return [texto(i.nome), texto(i.cor)].filter(function (x) { return x; }).join(' ');
}

// Corpo enviado ao subworkflow do intérprete. Nunca leva o remetente.
function entradaInterpreteEmailPcp(linha, itens) {
  linha = linha || {};
  return {
    emailId: texto(linha.id),
    texto: texto(linha.texto).slice(0, LIMITE_TEXTO_EMAIL_PCP),
    assunto: texto(linha.assunto).slice(0, 300),
    os: texto(linha.os),
    modelo: texto(linha.modelo),
    quando: texto(linha.quando),
    itensAbertos: (itens || []).slice(0, LIMITE_ITENS_INTERPRETE_EMAIL_PCP).map(function (i) {
      var resta = i.resta === null || i.resta === undefined ? '' : formatarQtd(Number(i.resta)) + (texto(i.un) ? ' ' + texto(i.un) : '');
      return { id: texto(i.id), nome: nomeItemEmailPcp(i), falta: resta };
    }),
    instrucoes: INSTRUCOES_INTERPRETE_EMAIL_PCP,
    schema: JSON.parse(JSON.stringify(SCHEMA_INTERPRETE_EMAIL_PCP))
  };
}

// Subworkflow "PCP MRBL - Intérprete E-mail do PCP (Groq)": corpo da chamada ao Groq.
function pedidoGroqEmailPcp(entrada) {
  entrada = entrada || {};
  var sistema = texto(entrada.instrucoes) || INSTRUCOES_INTERPRETE_EMAIL_PCP;
  return {
    model: MODELO_GROQ_EMAIL_PCP,
    temperature: 0,
    reasoning_effort: 'low',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sistema + ' Chaves do JSON: tipo (' + SCHEMA_INTERPRETE_EMAIL_PCP.tipo.join(', ') +
        '), valor, itens, resumo, evidencia, confianca.' },
      { role: 'user', content: JSON.stringify({
        texto: entrada.texto, assunto: entrada.assunto, os: entrada.os, modelo: entrada.modelo, quando: entrada.quando,
        itensAbertos: entrada.itensAbertos, schema: entrada.schema
      }).slice(0, LIMITE_CONTEXTO_GROQ_EMAIL_PCP) }
    ]
  };
}

// Resposta do Groq -> { emailId, interpretacao }. Conteúdo que não é JSON derruba o
// subworkflow (o Ler E-mails conta como falha e tenta de novo).
function respostaGroqEmailPcp(resposta, emailId) {
  var conteudo = resposta && resposta.choices && resposta.choices[0] && resposta.choices[0].message &&
    resposta.choices[0].message.content;
  var o = interpretarComoObjeto(conteudo);
  if (!o || typeof o !== 'object') throw new Error('O intérprete não devolveu JSON.');
  return { emailId: texto(emailId), interpretacao: o };
}

// Itens citados que batem com os itens em aberto: pelo id ou pelo nome normalizado
// (igual, ou um contém o outro com 4+ letras).
function itensCitadosEmailPcp(citados, itensAbertos) {
  var lista = Array.isArray(citados) ? citados : texto(citados) ? [citados] : [];
  var ids = [];
  // O id ou o nome exato vence; a substring só vale quando sobra um candidato só.
  lista.forEach(function (c) {
    var bruto = texto(c);
    var ci = textoComparavelWhatsapp(bruto);
    if (!ci) return;
    var exatos = [];
    var parciais = [];
    (itensAbertos || []).forEach(function (i) {
      var n1 = textoComparavelWhatsapp(i.nome);
      var n2 = textoComparavelWhatsapp(nomeItemEmailPcp(i));
      if (bruto === texto(i.id) || ci === n1 || ci === n2) exatos.push(texto(i.id));
      else if (ci.length >= 4 && n1.length >= 4 && (n1.indexOf(ci) >= 0 || ci.indexOf(n1) >= 0)) parciais.push(texto(i.id));
    });
    var achados = exatos.length ? exatos : parciais.length === 1 ? parciais : [];
    achados.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
  });
  return { citou: lista.some(function (c) { return !!textoComparavelWhatsapp(c); }), ids: ids };
}

// ctx: { texto (o e-mail limpo), quando (ISO do e-mail), itensAbertos }.
// Mesma regra do WhatsApp: evidência no texto (obrigatória fora de OBSERVACAO),
// confiança < 0,7 vira OBSERVACAO; itens só os que batem com os em aberto.
function validarInterpretacaoEmailPcp(valor, ctx) {
  ctx = ctx || {};
  var o = interpretarComoObjeto(valor);
  if (!o || typeof o !== 'object') return { ok: false, erro: 'Interpretação inválida.' };
  var tipo = semAcento(o.tipo);
  if (!TIPOS_EMAIL_PCP[tipo]) return { ok: false, erro: 'Tipo de interpretação inválido.' };
  var confianca = typeof o.confianca === 'number' ? o.confianca : numero(o.confianca);
  // Modelo que responde em percentual (95): vale como 0,95.
  if (confianca !== null && isFinite(confianca) && confianca > 1 && confianca <= 100) confianca = confianca / 100;
  if (confianca === null || !isFinite(confianca) || confianca < 0 || confianca > 1) return { ok: false, erro: 'Confiança inválida.' };
  var resumo = texto(o.resumo).replace(/\s+/g, ' ').slice(0, 500);
  var evidencia = texto(o.evidencia).replace(/\s+/g, ' ').slice(0, 500);
  var textoEmail = texto(ctx.texto);
  var citados = itensCitadosEmailPcp(o.itens, ctx.itensAbertos);
  var v = '';
  var itens = [];
  if (confianca < CONFIANCA_MINIMA_EMAIL_PCP) tipo = 'OBSERVACAO';
  if (tipo === 'PREVISAO') {
    var data = resolverDataInterpretada(o.valor, ctx.quando);
    if (!data || dataSemAnoDistante(o.valor, data, ctx.quando) || (citados.citou && !citados.ids.length)) tipo = 'OBSERVACAO';
    else { v = data; itens = citados.ids; }
  } else if (tipo === 'QUANTIDADE') {
    var qtd = typeof o.valor === 'number' ? o.valor : numero(o.valor);
    if (qtd === null || !isFinite(qtd) || qtd <= 0 || citados.ids.length !== 1) tipo = 'OBSERVACAO';
    else { v = String(arredondar(qtd)); itens = citados.ids; }
  } else if (tipo === 'CHAMADO') {
    var numeroChamado = texto(o.valor).replace(/\D+/g, '');
    if (numeroChamado.length < 3 || textoEmail.replace(/\D+/g, ' ').split(' ').indexOf(numeroChamado) < 0) tipo = 'OBSERVACAO';
    else v = numeroChamado;
  }
  var comparavel = textoComparavelWhatsapp(textoEmail);
  var semEvidencia = tipo !== 'OBSERVACAO' && !textoComparavelWhatsapp(evidencia);
  if (comparavel && (semEvidencia || !evidenciaNaMensagemWhatsapp(evidencia, textoEmail))) {
    tipo = 'OBSERVACAO';
    resumo = ('Resposta por e-mail: ' + textoEmail).slice(0, 500);
    evidencia = '';
  }
  if (tipo === 'OBSERVACAO') { v = ''; itens = []; }
  return { ok: true, tipo: tipo, valor: v, itens: itens, resumo: resumo, evidencia: evidencia, confianca: confianca };
}

// ----- Leitura do Gmail e rodada de interpretação -----
// Cada rodada (10 min): os e-mails novos entram na aba já como ERRO com 1 tentativa
// (reserva) antes do intérprete; sucesso troca para PENDENTE. Linhas ERRO com menos
// de 3 tentativas voltam ao intérprete a partir do texto já limpo da aba.
var MAX_TENTATIVAS_EMAIL_PCP = 3;
// 4 por rodada: cada interpretação leva até ~2 min (Groq com nova tentativa) e a rodada tem 10 min.
var LIMITE_RODADA_EMAIL_PCP = 4;
var REMETENTE_PLOOMES_EMAIL_PCP = 'noreply@ploomes.com';
var MARCADOR_DOMINIO_EMAIL_PCP = 'CONFIGURAR_DOMINIO';

// Domínio da confecção (do node Config do workflow): só letras, números, ponto e traço.
function dominioEmailPcp(valor) {
  var d = texto(valor).toLowerCase().replace(/^@/, '');
  if (!d || d.indexOf(MARCADOR_DOMINIO_EMAIL_PCP.toLowerCase()) >= 0) return '';
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

function buscaGmailEmailsPcp(dominio) {
  var d = dominioEmailPcp(dominio);
  return d ? 'from:(@' + d + ') subject:"OS:" -from:' + REMETENTE_PLOOMES_EMAIL_PCP + ' newer_than:7d' : '';
}

function textoDoHtmlEmailPcp(html) {
  return texto(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// Remetente "Nome <a@b>" (texto) ou { value: [{ name, address }] } (nó Gmail).
function remetenteEmailPcp(de) {
  if (de && typeof de === 'object') {
    var v = (de.value || [])[0];
    if (v) return { nome: texto(v.name), endereco: texto(v.address).toLowerCase() };
    de = de.text;
  }
  var t = texto(de);
  var m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(t);
  if (m) return { nome: texto(m[1]), endereco: texto(m[2]).toLowerCase() };
  return { nome: '', endereco: t.toLowerCase() };
}

function quandoEmailPcp(json) {
  var d = Date.parse(texto(json.date));
  if (!isFinite(d)) d = Number(texto(json.internalDate));
  return isFinite(d) && d > 0 ? new Date(d).toISOString() : '';
}

// Item do nó Gmail (getAll com simple: false) -> e-mail normalizado.
function emailDoGmailPcp(json) {
  json = json || {};
  var de = remetenteEmailPcp(json.from);
  var cab = json.headers || {};
  return {
    id: texto(json.id),
    threadId: texto(json.threadId),
    quando: quandoEmailPcp(json),
    deNome: de.nome,
    deEndereco: de.endereco,
    assunto: texto(json.subject) || texto(cab.subject),
    texto: typeof json.text === 'string' && json.text.trim() ? json.text : textoDoHtmlEmailPcp(json.html) || texto(json.snippet)
  };
}

function linhasUnicasEmailPcp(linhas) {
  var vistos = {};
  return (linhas || []).filter(function (l) {
    var id = texto(l && l.id);
    if (!id || vistos[id]) return false;
    vistos[id] = 1;
    return true;
  });
}

function tentativasEmailPcp(l) {
  var n = numero(l && l.tentativas);
  return n === null || isNaN(n) ? 0 : n;
}

function linhaNovaEmailPcp(e) {
  return {
    id: e.id, thread_id: e.threadId, quando: e.quando, de_nome: e.deNome.slice(0, 120), assunto: e.assunto.slice(0, 300),
    os: osDoAssuntoEmailPcp(e.assunto), modelo: modeloDoAssuntoEmailPcp(e.assunto), texto: limparTextoEmailPcp(e.texto),
    tipo: '', valor: '', itens: '', resumo: '', evidencia: '', confianca: '', status: 'ERRO', tentativas: 1, decidido_em: '', decidido_por: ''
  };
}

// gmail: itens do nó Gmail ([{ json }]); dados: { emails (aba EMAILS_PCP), faltantes, ganhas }.
// -> { operacoes: [append das novas, update das novas tentativas], pedidos: [entrada do intérprete] }.
function selecionarEmailsPcp(gmail, dados, dominio, agora) {
  dados = dados || {};
  var d = dominioEmailPcp(dominio);
  var operacoes = [];
  var pedidos = [];
  if (!d) return { operacoes: operacoes, pedidos: pedidos };
  var caixas = montarCaixas(dados.faltantes || [], dados.ganhas || [], new Date(texto(agora) || Date.now()), {}).caixas;
  var linhas = linhasUnicasEmailPcp(dados.emails);
  var existentes = {};
  (dados.emails || []).forEach(function (l) { if (l && texto(l.id)) existentes[texto(l.id)] = 1; });

  var pedir = function (linha) {
    pedidos.push(entradaInterpreteEmailPcp(linha, itensAbertosDaOsEmailPcp(caixas, linha.os)));
  };

  linhas.filter(function (l) {
    return semAcento(l.status) === 'ERRO' && tentativasEmailPcp(l) < MAX_TENTATIVAS_EMAIL_PCP && texto(l.os) && texto(l.texto);
  }).sort(function (a, b) { return texto(a.quando) < texto(b.quando) ? -1 : texto(a.quando) > texto(b.quando) ? 1 : 0; })
    .forEach(function (l) {
      if (pedidos.length >= LIMITE_RODADA_EMAIL_PCP) return;
      operacoes.push({ aba: ABA_EMAILS_PCP, operacao: 'update', chave: 'id', linha: { id: texto(l.id), tentativas: tentativasEmailPcp(l) + 1 } });
      pedir(l);
    });

  var novos = [];
  (gmail || []).forEach(function (item) {
    var e = emailDoGmailPcp(item && item.json);
    if (!e.id || existentes[e.id]) return;
    existentes[e.id] = 1;
    var arroba = e.deEndereco.lastIndexOf('@');
    if (arroba < 0 || e.deEndereco.slice(arroba + 1) !== d || e.deEndereco === REMETENTE_PLOOMES_EMAIL_PCP) return;
    var linha = linhaNovaEmailPcp(e);
    if (!linha.os || !linha.texto) return;
    novos.push(linha);
  });
  novos.sort(function (a, b) { return a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0; }).forEach(function (linha) {
    if (pedidos.length >= LIMITE_RODADA_EMAIL_PCP) return;
    operacoes.push({ aba: ABA_EMAILS_PCP, operacao: 'append', chave: 'id', linha: linha });
    pedir(linha);
  });
  return { operacoes: operacoes, pedidos: pedidos };
}

// pedidos: as entradas mandadas ao intérprete; respostas: a saída do Execute Workflow
// ({ emailId, interpretacao } ou { error }), pareada pelo emailId (ou pela posição);
// linhas: a aba EMAILS_PCP relida. Só a linha ainda em ERRO vira PENDENTE.
function concluirEmailsPcp(pedidos, respostas, linhas) {
  var porId = {};
  linhasUnicasEmailPcp(linhas).forEach(function (l) { porId[texto(l.id)] = l; });
  var operacoes = [];
  (pedidos || []).forEach(function (p, i) {
    var id = texto(p && p.emailId);
    var resp = (respostas || []).filter(function (r) { return r && texto(r.emailId) === id; })[0];
    if (!resp && respostas && respostas[i] && !texto(respostas[i].emailId)) resp = respostas[i];
    var atual = porId[id];
    if (!id || !resp || !atual || semAcento(atual.status) !== 'ERRO') return;
    if (resp.interpretacao === null || resp.interpretacao === undefined) return;
    var v = validarInterpretacaoEmailPcp(resp.interpretacao, { texto: p.texto, quando: p.quando, itensAbertos: p.itensAbertos });
    if (!v.ok) return;
    operacoes.push({ aba: ABA_EMAILS_PCP, operacao: 'update', chave: 'id', linha: {
      id: id, tipo: v.tipo, valor: v.valor, itens: v.itens.join(';'), resumo: v.resumo, evidencia: v.evidencia,
      confianca: v.confianca, status: 'PENDENTE'
    } });
  });
  return operacoes;
}

// ----- Board -----
var DIAS_DECIDIDOS_EMAIL_PCP = 7;
var DIAS_PENDENTE_EMAIL_PCP = 30;
var MAX_BOARD_EMAIL_PCP = 300;

function itensDaLinhaEmailPcp(v) {
  return texto(v).split(';').map(function (x) { return texto(x); }).filter(function (x) { return x; });
}

// PENDENTE e as decididas nos últimos 7 dias, mais novas primeiro (linha física repetida: vale a primeira).
function emailsPcpBoard(linhas, agora) {
  var agoraMs = typeof agora === 'number' ? agora : Date.parse(texto(agora));
  var limite = agoraMs - DIAS_DECIDIDOS_EMAIL_PCP * 86400000;
  var limitePendente = agoraMs - DIAS_PENDENTE_EMAIL_PCP * 86400000;
  return linhasUnicasEmailPcp(linhas).filter(function (l) {
    var s = semAcento(l.status);
    // Pendente com mais de 30 dias sai do board (o e-mail ficou velho; a linha continua na aba).
    if (s === 'PENDENTE') return !isFinite(Date.parse(texto(l.quando))) || Date.parse(texto(l.quando)) >= limitePendente;
    if (s !== 'ACEITA' && s !== 'IGNORADA') return false;
    var d = Date.parse(texto(l.decidido_em));
    return isFinite(d) && d >= limite;
  }).sort(function (a, b) {
    var x = texto(a.quando);
    var y = texto(b.quando);
    return x < y ? 1 : x > y ? -1 : 0;
  }).slice(0, MAX_BOARD_EMAIL_PCP).map(function (l) {
    var c = numero(l.confianca);
    return {
      id: texto(l.id), quando: texto(l.quando), de: texto(l.de_nome), assunto: texto(l.assunto), os: texto(l.os),
      modelo: texto(l.modelo), texto: texto(l.texto), tipo: semAcento(l.tipo), valor: texto(l.valor), itens: itensDaLinhaEmailPcp(l.itens),
      resumo: texto(l.resumo), evidencia: texto(l.evidencia), confianca: c === null || isNaN(c) ? null : c, status: semAcento(l.status)
    };
  });
}

// ----- Decisão (ação decidir_email_pcp) -----
// Caixas da sugestão (igual em web/src/regras/emailsPcp.ts): os deals dos itens citados;
// sem itens, as caixas da OS com item em aberto; sem nenhuma em aberto, todas da OS.
function dealsAlvoEmailPcp(email, caixas) {
  var os = texto(email && email.os);
  var itens = (email && email.itens) || [];
  var daOs = (caixas || []).filter(function (c) { return c && os && texto(c.os) === os; });
  var deals = [];
  var juntar = function (c) { if (deals.indexOf(texto(c.dealId)) < 0) deals.push(texto(c.dealId)); };
  if (itens.length) {
    daOs.forEach(function (c) {
      if ((c.itens || []).some(function (i) { return itens.indexOf(texto(i.id)) >= 0; })) juntar(c);
    });
    return deals;
  }
  daOs.forEach(function (c) { if ((c.itens || []).some(itemEstaAberto)) juntar(c); });
  if (!deals.length) daOs.forEach(juntar);
  return deals;
}

var TIPO_DECIDIR_EMAIL_PCP = 'decidir_email_pcp';
var ACAO_EMAIL_PCP_ACEITA = 'EMAIL_PCP_ACEITA';

function validarDecisaoEmailPcp(corpo) {
  corpo = corpo || {};
  var id = texto(corpo.id);
  if (!id || id.length > 200) return erroAcao(400, 'Sugestão não informada.');
  var decisao = semAcento(corpo.decisao);
  if (decisao !== 'ACEITAR' && decisao !== 'IGNORAR') return erroAcao(400, 'Decisão inválida.');
  return { ok: true, acao: { id: id, decisao: decisao } };
}

function textoAceiteEmailPcp(usuario, sufixo) {
  return usuario + ' aceitou sugestão do e-mail: ' + sufixo;
}

// corpo: { id, decisao: 'ACEITAR' | 'IGNORAR', versao? } (versao é aceita e não conferida: a
// idempotência vem do status da linha). linhas: { faltantes, ganhas, caixasPcp, emailsPcp }.
// ctx: { usuario, email, agora (ISO), gerarId, editavel(dealId), todosEditaveis }.
function decidirEmailPcp(corpo, linhas, ctx) {
  var v = validarDecisaoEmailPcp(corpo);
  if (!v.ok) return v;
  linhas = linhas || {};
  var linha = linhasUnicasEmailPcp(linhas.emailsPcp).filter(function (l) { return texto(l.id) === v.acao.id; })[0];
  if (!linha) return erroAcao(404, 'Sugestão não encontrada.');
  var aceitar = v.acao.decisao === 'ACEITAR';
  var destino = aceitar ? 'ACEITA' : 'IGNORADA';
  var status = semAcento(linha.status);
  if (status === destino) return { ok: true, idempotente: true, versao: ctx.agora, operacoes: [], historicos: [] };
  if (status !== 'PENDENTE') return erroAcao(409, 'Esta sugestão já foi decidida.');

  var os = texto(linha.os);
  var itens = itensDaLinhaEmailPcp(linha.itens);
  var caixas = montarCaixas(linhas.faltantes || [], linhas.ganhas || [], new Date(ctx.agora), { caixasPcp: linhas.caixasPcp }).caixas;
  var alvos = dealsAlvoEmailPcp({ os: os, itens: itens }, caixas);
  if (!alvos.length) {
    if (aceitar && itens.length) return erroAcao(409, 'Os itens da sugestão não estão mais na caixa. Atualize a página.');
    if (aceitar) return erroAcao(404, 'Nenhuma caixa desta OS no app.');
    if (!ctx.todosEditaveis) return erroAcao(403, ERRO_NAO_EDITAVEL);
  }
  if (alvos.some(function (d) { return !ctx.editavel(d); })) return erroAcao(403, ERRO_NAO_EDITAVEL);

  var operacoes = [];
  var historicos = [];
  var registrar = function (dealId, sufixo) {
    historicos.push(historicoProducao(ctx, dealId, os, ACAO_EMAIL_PCP_ACEITA, textoAceiteEmailPcp(ctx.usuario, sufixo)));
  };
  var ctxAcao = { usuario: ctx.usuario, email: ctx.email, agora: ctx.agora, os: os, gerarId: ctx.gerarId };
  var tipo = semAcento(linha.tipo);
  var faltantesDaOs = (linhas.faltantes || []).filter(function (l) { return l && texto(l.os) === os; });
  var linhaDoItem = function (id) { return faltantesDaOs.filter(function (l) { return texto(l.id) === id; })[0] || null; };

  if (aceitar && tipo === 'PREVISAO') {
    var data = texto(linha.valor);
    if (!dataValida(data)) return erroAcao(400, 'Data da sugestão inválida.');
    if (itens.length) {
      var porDeal = {};
      var ordem = [];
      itens.forEach(function (id) {
        var row = linhaDoItem(id);
        if (!row) return;
        var r = aplicarAcao({ tipo: 'previsao_item', dealId: texto(row.deal_id), itemId: id, valor: data, versao: texto(row.atualizado_em_app) },
          row, Object.assign({ nomeItem: texto(row.descricao_item), un: texto(row.unidade) }, ctxAcao));
        if (!r.ok) return;
        operacoes = operacoes.concat(r.operacoes);
        var d = texto(row.deal_id);
        if (!porDeal[d]) { porDeal[d] = []; ordem.push(d); }
        porDeal[d].push(texto(row.descricao_item));
      });
      if (!ordem.length) return erroAcao(409, 'Os itens da sugestão não estão mais na caixa. Atualize a página.');
      ordem.forEach(function (d) { registrar(d, 'previsão ' + dataCurta(data) + ' para ' + porDeal[d].join(', ')); });
    } else {
      alvos.forEach(function (d) {
        var cpRow = (linhas.caixasPcp || []).filter(function (c) { return c && texto(c.deal_id) === d; })[0] || null;
        var responsavelAtual = '';
        faltantesDaOs.forEach(function (l) { if (!responsavelAtual && texto(l.deal_id) === d) responsavelAtual = texto(l.responsavel); });
        var r = aplicarAcao({ tipo: 'previsao_caixa', dealId: d, valor: data, versao: cpRow ? texto(cpRow.atualizado_em) : '' },
          cpRow, Object.assign({ responsavelAtual: responsavelAtual }, ctxAcao));
        if (r.ok) operacoes = operacoes.concat(r.operacoes);
        registrar(d, 'previsão ' + dataCurta(data) + ' para a caixa');
      });
    }
  } else if (aceitar) {
    var sufixo = texto(linha.resumo) || 'resposta registrada';
    if (tipo === 'CHAMADO') sufixo = 'chamado #' + texto(linha.valor);
    if (tipo === 'QUANTIDADE') {
      var rowQtd = itens.length ? linhaDoItem(itens[0]) : null;
      var qtd = numero(linha.valor);
      sufixo = 'quantidade conferida de ' + (rowQtd ? texto(rowQtd.descricao_item) : 'item') + ': ' +
        (qtd === null || isNaN(qtd) ? texto(linha.valor) : formatarQtd(qtd)) + (rowQtd && texto(rowQtd.unidade) ? ' ' + texto(rowQtd.unidade) : '');
    }
    alvos.forEach(function (d) { registrar(d, sufixo); });
  }
  operacoes.push({ aba: ABA_EMAILS_PCP, operacao: 'update', chave: 'id', linha: { id: texto(linha.id), status: destino, decidido_em: ctx.agora, decidido_por: ctx.usuario } });
  return { ok: true, idempotente: false, versao: ctx.agora, operacoes: operacoes, historicos: historicos, emailId: texto(linha.id) };
}

// ----- src/api.js -----
// ===== src/api.js =====
// Regras dos dois webhooks do workflow "PCP MRBL - API". "estado" e o
// static data global do workflow: sessoes, tentativas de login e cache do
// board. Funcoes puras sobre "estado" + "agora" (ms), para testar sem n8n.

var VALIDADE_SESSAO_MS = 12 * 3600 * 1000;
var JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
var MAX_TENTATIVAS = 5;
var VALIDADE_CACHE_MS = 55 * 1000;
var VALORES_ATIVO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var DEALS_PRODUCAO_EDITAVEIS = ['607612577'];  // TESTE: so o card de teste do funil Producao ate o go-live; vazio = todos.
var DEALS_EDITAVEIS = ['607479158', '607493886', '607493902', '607520448'];  // vazio = todos. Até o go-live, só os cards de teste.
var ACOES_F3_ATIVAS = true;  // false = recusa rapido todas as acoes de pedido/oficina (F3).
var HASH_FICTICIO = 'pbkdf2$120000$00000000000000000000000000000000$' + '0'.repeat(64);

function dealEditavel(dealId) {
  if (!DEALS_EDITAVEIS.length) return true;
  return DEALS_EDITAVEIS.indexOf(texto(dealId)) >= 0;
}

var ERRO_NAO_EDITAVEL = 'Edição liberada em breve para esta caixa.';
var ERRO_F3_DESLIGADA = 'Esta ação ainda não está disponível.';
var ERRO_PECA_NAO_EDITAVEL = 'Edição liberada em breve para esta OS.';

// Anotação da Visão da peça: deals das duas allowlists até o go-live. Só libera todos
// com as DUAS listas vazias; com uma vazia e a outra preenchida, vale a preenchida.
function dealAnotavel(dealId) {
  if (!DEALS_EDITAVEIS.length && !DEALS_PRODUCAO_EDITAVEIS.length) return true;
  var d = texto(dealId);
  return DEALS_EDITAVEIS.indexOf(d) >= 0 || DEALS_PRODUCAO_EDITAVEIS.indexOf(d) >= 0;
}

// "estado": static data (board e respostas do pcp-peca em cache) para conferir que o
// card é desta OS.
function validarAcaoAnotacao(corpo, estado) {
  var v = validarAnotacaoPeca(corpo);
  if (!v.ok) return v;
  if (!dealAnotavel(v.acao.dealId)) return erroAcao(403, ERRO_PECA_NAO_EDITAVEL);
  if (!dealDaOsPeca(estado, v.acao.os, v.acao.dealId)) return erroAcao(400, ERRO_CARD_OUTRA_OS);
  return v;
}

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
  var ped = montarPedidos(extras, new Date(agora).getFullYear(), faltantes || []);
  var fornecedores = nomesAtivos(extras.fornecedores);
  var responsaveis = nomesAtivos(extras.responsaveis);
  var producao = producoesBoard(extras, r.caixas);
  var oficinas = oficinasProducaoBoard(extras.oficinas);
  var mensagensWhatsappSemAssociacao = mensagensSemAssociacaoProducaoBoard(extras.whatsappMensagens, extras.oficinas);
  var corpo = {
    geradoEm: new Date(agora).toISOString(), caixas: r.caixas, avisos: r.avisos.concat(ped.avisos), usuarios: usuarios,
    dealsEditaveis: DEALS_EDITAVEIS.slice(), pedidos: ped.pedidos, etapasPedido: ped.etapasPedido,
    fornecedores: fornecedores, responsaveis: responsaveis,
    producao: producao, oficinas: oficinas, mensagensWhatsappSemAssociacao: mensagensWhatsappSemAssociacao,
    dealsProducaoEditaveis: DEALS_PRODUCAO_EDITAVEIS.slice(),
    // A PREVISAO_MEDIAS ainda vazia (o workflow diário não rodou): a tela avisa "Previsão sem histórico".
    previsaoSemHistorico: !temMedias(tabelaMedias(extras.previsaoMedias)),
    // Visão da peça (F5a): anotações de qualquer card, cruzadas pela OS no site.
    anotacoes: anotacoesDoBoard(extras.historico),
    // E-mails do PCP (F5c): sugestões pendentes e as decididas nos últimos 7 dias.
    emailsPcp: emailsPcpBoard(extras.emailsPcp, agora)
  };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}

// POST /pcp-acao, antes de ler a planilha: sessao e corpo. Falha devolve o
// mesmo { status, body } que o processarAcao daria (com ok: false para o IF);
// sucesso = { ok: true }. O processarAcao repete as checagens.
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (corpo && corpo.tipo === TIPO_CAPACIDADE_OFICINA) {
    if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };
    if (sessao.perfil !== 'ADM') return { ok: false, status: 403, body: { erro: ERRO_CAPACIDADE_SO_ADM } };
    var vCap = validarCapacidadeOficina(corpo);
    return vCap.ok ? { ok: true } : { ok: false, status: vCap.status, body: { erro: vCap.erro } };
  }
  if (sessao && corpo && TIPOS_PRODUCAO.indexOf(corpo.tipo) >= 0) {
    var vProd = validarAcaoProducaoBasica(corpo, DEALS_PRODUCAO_EDITAVEIS);
    return vProd.ok ? { ok: true } : { ok: false, status: vProd.status, body: { erro: vProd.erro } };
  }
  if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };
  if (corpo && corpo.tipo === TIPO_DECIDIR_EMAIL_PCP) {
    var vEmail = validarDecisaoEmailPcp(corpo);
    return vEmail.ok ? { ok: true } : { ok: false, status: vEmail.status, body: { erro: vEmail.erro } };
  }
  if (corpo && corpo.tipo === TIPO_ANOTAR_PECA) {
    var vAnot = validarAcaoAnotacao(corpo, estado);
    return vAnot.ok ? { ok: true } : { ok: false, status: vAnot.status, body: { erro: vAnot.erro } };
  }
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

// Cache do board fora: o proximo GET le a planilha. O workflow chama esta
// funcao depois das gravacoes ou ao tratar uma falha que pode ter sido parcial.
function limparCacheBoard(estado) {
  if (estado) delete estado.board;
}

function historicoDaResposta(h) {
  return { quando: h.quando, usuario: h.usuario, texto: h.texto, ploomes: 'PENDENTE' };
}

// Saida de sucesso comum: operacoes[] e historicos[] para o workflow (F3) e
// gravacao/historico (primeira operacao / primeira linha) para os
// adaptadores da F2 enquanto o workflow novo nao entra.
function respostaDeAcao(estado, versao, operacoes, historicos, extrasBody) {
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
  if (r.itemIds) extras.itemIds = r.itemIds;
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, extras);
  // O workflow publicado grava gravacao/historico na aba errada para estes
  // tipos; sem eles nada e escrito ate o workflow novo (operacoes[]) entrar.
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

// Visão da peça (F5a): só a linha ANOTACAO no HISTORICO_APP, sem PATCH no Ploomes.
function processarAcaoAnotacao(estado, sessao, corpo, agora, gerarId) {
  var v = validarAcaoAnotacao(corpo, estado);
  if (!v.ok) return { status: v.status, body: { erro: v.erro } };
  var r = processarAnotacaoPeca(v.acao, {
    usuario: sessao.nome, email: sessao.email, agora: new Date(agora).toISOString(), gerarId: gerarId
  });
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, { anotacaoId: r.anotacaoId });
  saida.ploomes = null;
  saida.interpretar = null;
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

// E-mails do PCP (F5c): aceitar ou ignorar a sugestão. A allowlist (DEALS_EDITAVEIS) vale
// para todas as caixas da sugestão; o PATCH no Ploomes não existe (só o registro compilado).
function processarAcaoEmailPcp(estado, sessao, corpo, linhas, agora, gerarId) {
  var r = decidirEmailPcp(corpo, linhas || {}, {
    usuario: sessao.nome, email: sessao.email, agora: new Date(agora).toISOString(), gerarId: gerarId,
    editavel: dealEditavel, todosEditaveis: !DEALS_EDITAVEIS.length
  });
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, { emailId: texto(corpo && corpo.id) });
  saida.ploomes = null;
  saida.interpretar = null;
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

function processarAcaoProducao(estado, sessao, corpo, linhas, agora, gerarId) {
  var v = validarAcaoProducaoBasica(corpo, DEALS_PRODUCAO_EDITAVEIS);
  if (!v.ok) return { status: v.status, body: { erro: v.erro } };
  var ctx = { usuario: sessao.nome, email: sessao.email, agora: new Date(agora).toISOString(), gerarId: gerarId };
  var r = corpo.tipo === 'alterar_producao'
    ? processarAlteracaoProducao(corpo, linhas || {}, ctx, DEALS_PRODUCAO_EDITAVEIS)
    : corpo.tipo === 'associar_whatsapp'
      ? processarAssociacaoWhatsapp(corpo, linhas || {}, ctx)
      : corpo.tipo === 'enviar_whatsapp'
        ? processarEnvioWhatsapp(corpo, linhas || {}, ctx)
        : corpo.tipo === 'reenviar_whatsapp'
          ? processarReenvioWhatsapp(corpo, linhas || {}, ctx)
          : processarDecisaoSugestao(corpo, linhas || {}, ctx);
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };
  var extras = r.mensagemId ? { mensagemId: r.mensagemId } : undefined;
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, extras);
  saida.ploomes = r.ploomes;
  // Só para o workflow (nunca vai ao site): pedido de interpretação da mensagem associada.
  saida.interpretar = r.interpretar || null;
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

// Capacidade da oficina (19/10): só ADM; grava só a OFICINAS.
function processarAcaoCapacidade(estado, sessao, corpo, linhas, agora) {
  if (sessao.perfil !== 'ADM') return { status: 403, body: { erro: ERRO_CAPACIDADE_SO_ADM } };
  var r = processarCapacidadeOficina(corpo, linhas || {}, { agora: new Date(agora).toISOString() });
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos);
  saida.ploomes = null;
  saida.interpretar = null;
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
  if (sessao && corpo && corpo.tipo === TIPO_CAPACIDADE_OFICINA) {
    return processarAcaoCapacidade(estado, sessao, corpo, linhas, agora);
  }
  if (sessao && corpo && TIPOS_PRODUCAO.indexOf(corpo.tipo) >= 0) {
    return processarAcaoProducao(estado, sessao, corpo, linhas, agora, gerarId);
  }
  if (!sessao) return { status: 401, body: { erro: 'Sessão expirada.' } };
  if (corpo && corpo.tipo === TIPO_ANOTAR_PECA) return processarAcaoAnotacao(estado, sessao, corpo, agora, gerarId);
  if (corpo && corpo.tipo === TIPO_DECIDIR_EMAIL_PCP) return processarAcaoEmailPcp(estado, sessao, corpo, linhas, agora, gerarId);
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

// ----- src/assistente.js -----
// ===== src/assistente.js =====
// Assistente (F5d): o site roda as ferramentas sobre o board que já carregou; aqui só
// confere a sessão e o limite, monta o pedido ao Groq (prompt + ferramentas + conversa) e
// valida a resposta. Nada é gravado: a conversa vive só no navegador. Nenhuma ferramenta
// envia ou grava; a cobrança só sai do clique em "Confirmar e enviar" no site.

var MODELO_GROQ_ASSISTENTE = 'openai/gpt-oss-120b';
var ASSISTENTE_LIMITE_HORA = 30;
var ASSISTENTE_JANELA_MS = 3600 * 1000;
var ASSISTENTE_MAX_MENSAGENS = 20;
var ASSISTENTE_MAX_TEXTO = 2000;
var ASSISTENTE_MAX_RESULTADO = 6000;
var ASSISTENTE_MAX_RESPOSTA = 4000;
var ASSISTENTE_MAX_CHAMADAS = 5;
var ASSISTENTE_MAX_ID = 64;
var ERRO_ASSISTENTE = 'Não consegui responder agora. Tente de novo.';
var ERRO_ASSISTENTE_LIMITE = 'Muitas perguntas seguidas. Espere alguns minutos.';
var ERRO_ASSISTENTE_PEDIDO = 'Pedido inválido.';

function ferramentaAssistente(nome, descricao, propriedades, obrigatorios) {
  var parametros = { type: 'object', properties: propriedades || {} };
  if (obrigatorios && obrigatorios.length) parametros.required = obrigatorios;
  return { type: 'function', function: { name: nome, description: descricao, parameters: parametros } };
}

// Espelhadas em web/src/regras/assistente.ts (o teste do site confere os nomes).
var FERRAMENTAS_ASSISTENTE = [
  ferramentaAssistente('buscar_os', 'Procura OS pelo número, peça, cliente ou oficina (ignora acentos). Devolve até 30 OS.',
    { texto: { type: 'string', description: 'Número da OS, nome da peça, cliente ou oficina.' } }, ['texto']),
  ferramentaAssistente('listar_atrasadas', 'Lista as OS na Costura com prazo vencido ou vencendo em até dias_ate_vencer dias (padrão 3), a mais atrasada primeiro.',
    { oficina: { type: 'string', description: 'Filtra por oficina (opcional).' },
      dias_ate_vencer: { type: 'integer', description: 'Inclui as que vencem em até N dias (padrão 3).' } }),
  ferramentaAssistente('faltas_da_os', 'Caixas da OS com itens em falta em aberto: quanto falta, previsão e pedido.',
    { os: { type: 'string', description: 'Número da OS.' } }, ['os']),
  ferramentaAssistente('caixas_paradas', 'Caixas com falta em aberto, que não saíram, registradas há dias ou mais (padrão 7).',
    { dias: { type: 'integer', description: 'Dias parada (padrão 7).' } }),
  ferramentaAssistente('pedidos_abertos', 'Pedidos de compra que ainda não chegaram à última etapa, com etapa, fornecedor e previsão.',
    { os: { type: 'string', description: 'Filtra pela OS (opcional).' },
      fornecedor: { type: 'string', description: 'Filtra pelo fornecedor ou cliente (opcional).' } }),
  ferramentaAssistente('sem_resposta', 'OS cuja última mensagem no WhatsApp é uma cobrança enviada há mais de 24 h, sem resposta da oficina.', {}),
  ferramentaAssistente('abrir_tela', 'Abre uma tela do app para a pessoa. Para a Visão da peça de uma OS, use tela "peca" com a OS.',
    { tela: { type: 'string', enum: ['no-ploomes', 'saidas', 'solicitacoes', 'producao', 'peca'] },
      os: { type: 'string', description: 'OS (só para a tela peca).' } }, ['tela']),
  ferramentaAssistente('preparar_cobranca', 'Prepara cobranças de prazo no WhatsApp para as oficinas e mostra um cartão para a pessoa conferir. Não envia nada: o envio só acontece quando a pessoa clica em Confirmar e enviar.',
    { alvo: { type: 'string', enum: ['atrasadas', 'todas', 'oficinas'], description: 'atrasadas = vencidas e vencendo em até 3 dias; todas = todas as OS na Costura; oficinas = todas as OS das oficinas informadas.' },
      oficinas: { type: 'array', items: { type: 'string' }, description: 'Nomes das oficinas (obrigatório no alvo oficinas; nos outros, filtra).' } }, ['alvo'])
];

var NOMES_FERRAMENTAS_ASSISTENTE = FERRAMENTAS_ASSISTENTE.map(function (f) { return f.function.name; });

var INSTRUCOES_ASSISTENTE = [
  'Você é o assistente do PCP da MRBL, uma confecção. Responda sempre em português do Brasil, em texto simples, com respostas curtas.',
  'Use só os dados que vierem das ferramentas. Se não achar, diga que não achou. Nunca invente OS, datas, quantidades ou nomes.',
  'Cite as OS pelo número (por exemplo "OS 12345").',
  'Para cobrar oficinas, use sempre a ferramenta preparar_cobranca e avise que nada é enviado até a pessoa clicar em Confirmar e enviar no cartão.',
  'Você não grava baixa, previsão, observação nem pedido: para isso, abra a tela certa com abrir_tela.',
  'No máximo 5 chamadas de ferramenta por pergunta.'
].join(' ');

function cortarTextoAssistente(v, max) {
  var t = typeof v === 'string' ? v : '';
  return t.length > max ? t.slice(0, max) : t;
}

function objetoSimples(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function idChamadaValido(id) {
  return typeof id === 'string' && id.trim() !== '' && id.length <= ASSISTENTE_MAX_ID;
}

// Mensagem do site -> mensagem do Groq; null quando não serve.
function mensagemGroqAssistente(m) {
  if (!objetoSimples(m)) return null;
  if (m.papel === 'usuario') {
    var tu = cortarTextoAssistente(m.texto, ASSISTENTE_MAX_TEXTO).trim();
    return tu ? { role: 'user', content: tu } : null;
  }
  if (m.papel === 'assistente') {
    if (Array.isArray(m.chamadas)) {
      if (!m.chamadas.length || m.chamadas.length > ASSISTENTE_MAX_CHAMADAS) return null;
      var chamadas = [];
      for (var i = 0; i < m.chamadas.length; i++) {
        var c = m.chamadas[i];
        if (!objetoSimples(c) || !idChamadaValido(c.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(c.nome) < 0) return null;
        var args = c.argumentos === undefined ? {} : c.argumentos;
        if (!objetoSimples(args)) return null;
        chamadas.push({ id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(args) } });
      }
      return { role: 'assistant', content: '', tool_calls: chamadas };
    }
    var ta = cortarTextoAssistente(m.texto, ASSISTENTE_MAX_TEXTO).trim();
    return ta ? { role: 'assistant', content: ta } : null;
  }
  if (m.papel === 'ferramenta') {
    if (!idChamadaValido(m.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(m.nome) < 0) return null;
    if (m.resultado === undefined || m.resultado === null) return null;
    var r = typeof m.resultado === 'string' ? m.resultado : JSON.stringify(m.resultado);
    return { role: 'tool', tool_call_id: m.id, name: m.nome, content: cortarTextoAssistente(r, ASSISTENTE_MAX_RESULTADO) };
  }
  return null;
}

// Conversa inteira -> mensagens do Groq; null se alguma não serve. Só as últimas 20,
// começando numa pergunta (a resposta de uma ferramenta sem a chamada derruba o pedido).
function mensagensGroqAssistente(mensagens) {
  if (!Array.isArray(mensagens) || !mensagens.length) return null;
  var lista = [];
  for (var i = 0; i < mensagens.length; i++) {
    var g = mensagemGroqAssistente(mensagens[i]);
    if (!g) return null;
    lista.push(g);
  }
  lista = lista.slice(-ASSISTENTE_MAX_MENSAGENS);
  while (lista.length && lista[0].role !== 'user') lista.shift();
  return lista.length ? lista : null;
}

function pedidoGroqAssistente(mensagens, hoje) {
  return {
    model: MODELO_GROQ_ASSISTENTE,
    temperature: 0.2,
    reasoning_effort: 'low',
    max_completion_tokens: 1200,
    tool_choice: 'auto',
    tools: FERRAMENTAS_ASSISTENTE,
    messages: [{ role: 'system', content: INSTRUCOES_ASSISTENTE + ' Hoje é ' + hoje + ' (São Paulo).' }]
      .concat(mensagensGroqAssistente(mensagens) || [])
  };
}

// Dia de São Paulo (UTC-3, sem horário de verão desde 2019).
function hojeSaoPauloAssistente(agora) {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Janela deslizante de 1 h por e-mail, no static data do workflow. true = pode.
function contarPedidoAssistente(estado, email, agora) {
  if (!estado.assistente) estado.assistente = Object.create(null);
  Object.keys(estado.assistente).forEach(function (e) {
    var ainda = (estado.assistente[e] || []).filter(function (ts) { return agora - ts < ASSISTENTE_JANELA_MS; });
    if (ainda.length) estado.assistente[e] = ainda;
    else delete estado.assistente[e];
  });
  var lista = proprio(estado.assistente, email) || [];
  if (lista.length >= ASSISTENTE_LIMITE_HORA) return false;
  estado.assistente[email] = lista.concat([agora]);
  return true;
}

// POST /pcp-assistente. Pronto = vai direto ao Responder Assistente.
function validarPedidoAssistente(estado, cabecalho, corpo, agora) {
  corpo = objetoSimples(corpo) ? corpo : {};
  var cab = texto(cabecalho) || (typeof corpo.token === 'string' && corpo.token ? 'Bearer ' + corpo.token : '');
  var sessao = sessaoDoCabecalho(estado, cab, agora);
  if (!sessao) return { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } };
  var lista = Array.isArray(corpo.mensagens) ? corpo.mensagens : null;
  var groq = lista && mensagensGroqAssistente(lista);
  var ultima = lista && lista[lista.length - 1];
  if (!groq || !ultima || ultima.papel === 'assistente') return { pronto: true, status: 400, body: { erro: ERRO_ASSISTENTE_PEDIDO } };
  if (!contarPedidoAssistente(estado, sessao.email, agora)) return { pronto: true, status: 429, body: { erro: ERRO_ASSISTENTE_LIMITE } };
  var hoje = /^\d{4}-\d{2}-\d{2}$/.test(texto(corpo.hoje)) && dataValida(texto(corpo.hoje)) ? texto(corpo.hoje) : hojeSaoPauloAssistente(agora);
  return { pronto: false, corpo: pedidoGroqAssistente(lista, hoje) };
}

function erroGroqAssistente() {
  return { status: 502, body: { erro: ERRO_ASSISTENTE } };
}

// Resposta do HTTP Request (resposta completa, sem erro) ou o corpo direto ->
// { status: 200, body: { texto } | { chamadas } } ou 502 amigável.
function respostaGroqAssistente(resposta) {
  if (!objetoSimples(resposta)) return erroGroqAssistente();
  var corpo = resposta;
  if (resposta.statusCode !== undefined || resposta.body !== undefined) {
    if (Number(resposta.statusCode) !== 200) return erroGroqAssistente();
    corpo = resposta.body;
  }
  var msg = objetoSimples(corpo) && Array.isArray(corpo.choices) && corpo.choices[0] && corpo.choices[0].message;
  if (!objetoSimples(msg)) return erroGroqAssistente();
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    var chamadas = [];
    var calls = msg.tool_calls.slice(0, ASSISTENTE_MAX_CHAMADAS);
    for (var i = 0; i < calls.length; i++) {
      var c = calls[i] || {};
      var f = c['function'] || {};
      if (!idChamadaValido(c.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(f.name) < 0) return erroGroqAssistente();
      var bruto = typeof f.arguments === 'string' ? f.arguments.trim() : f.arguments;
      var args;
      if (bruto === '' || bruto === undefined || bruto === null) args = {};
      else if (typeof bruto === 'string') {
        try { args = JSON.parse(bruto); } catch (e) { return erroGroqAssistente(); }
      } else args = bruto;
      if (!objetoSimples(args)) return erroGroqAssistente();
      chamadas.push({ id: c.id, nome: f.name, argumentos: args });
    }
    return { status: 200, body: { chamadas: chamadas } };
  }
  var t = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (!t) return erroGroqAssistente();
  return { status: 200, body: { texto: cortarTextoAssistente(t, ASSISTENTE_MAX_RESPOSTA) } };
}

// ===== adaptador: Preparar Interpretação (workflow Interpretar WhatsApp) =====
// Recebe { mensagemId, dealId } da API depois da associação manual gravada.
// Mensagem que já tem sugestão, não textual ou que mudou de OS não é interpretada.
var pedidoInterpretacao = $('Receber Pedido de Interpretação').first().json || {};
var planilhaInterpretacao = planilhaDoLote($input.first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
var preparadaManual = prepararInterpretacaoManualWhatsapp({
  producao: planilhaInterpretacao.linhas.PRODUCAO,
  mensagens: planilhaInterpretacao.linhas.WHATSAPP_MENSAGENS,
  sugestoes: planilhaInterpretacao.linhas.WHATSAPP_SUGESTOES,
  faltantes: planilhaInterpretacao.linhas.FALTANTES,
  ganhas: planilhaInterpretacao.linhas['CAIXAS GANHAS']
}, {
  mensagemId: texto(pedidoInterpretacao.mensagemId),
  dealId: texto(pedidoInterpretacao.dealId),
  reservada: pedidoInterpretacao.reservada === true
}, dataISOEmSaoPaulo(new Date().toISOString()), new Date().toISOString());
if (!preparadaManual.ok) throw new Error(preparadaManual.erro || 'Falha ao preparar a interpretação.');
if (!preparadaManual.interpretar) return [{ json: { interpretar: false, motivo: preparadaManual.motivo } }];
// Reserva a tentativa (tentativas + 1, próxima em 10 min) antes de chamar o modelo.
var reqsReserva = requisicoesDeEscrita([{ aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id', linha: preparadaManual.reserva }],
  [], planilhaInterpretacao, PLANILHA_ID);
if (reqsReserva.length !== 1) throw new Error('A reserva da tentativa deve gerar uma única gravação.');
return [{ json: { interpretar: true, preparacao: preparadaManual.preparacao, entrada: preparadaManual.entrada,
  method: reqsReserva[0].method, url: reqsReserva[0].url, body: reqsReserva[0].body } }];
