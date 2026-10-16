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

// ----- src/producao.js -----
// ===== src/producao.js =====
// Regras puras da F4: snapshot da producao, prazo, ordenacao, alteracoes e
// modelos de WhatsApp. Sem I/O e sem import/export para rodar nos Code nodes.

var STATUS_ITEM_ABERTO_PRODUCAO = { ABERTO: 1, PARCIAL: 1 };
var VALORES_ATIVO_PRODUCAO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var TIPOS_PRODUCAO = ['alterar_producao', 'associar_whatsapp', 'aceitar_sugestao_whatsapp', 'ignorar_sugestao_whatsapp', 'enviar_whatsapp', 'reenviar_whatsapp'];
var MODELOS_WHATSAPP = { COBRANCA_PRAZO: 1, CONFIRMAR_DATA: 1, MATERIAL_ENVIADO: 1 };
var CAMPO_OFICINA_PLOOMES = 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4';
var CAMPO_DATA_COMBINADA_PLOOMES = 'deal_E53BDEC3-F829-413D-9421-91D5D7411349';
var CAMPO_OS_PRODUCAO = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
var CAMPO_INICIO_COSTURA = 'deal_92FBE0E7-E136-41BF-AE47-1E427B178727';
var CAMPO_LEAD_TIME = 'deal_1B168E7F-E71D-4895-8A37-D7DB6FD3418D';
var CAMPO_PECAS_CORTE = 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD';
var CAMPO_DESCRICAO_PECA = 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7';
var CAMPO_REFERENCIA = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';

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
  var candidatos = [prop.StringValue, prop.BigStringValue, prop.ObjectValueName, prop.IntegerValue,
    prop.DecimalValue, prop.DateTimeValue];
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i] !== null && candidatos[i] !== undefined && texto(candidatos[i]) !== '') return candidatos[i];
  }
  return '';
}

function idObjetoPloomes(prop) {
  if (!prop) return '';
  var candidatos = [prop.ObjectValueId, prop.IntegerValue, prop.StringValue];
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
    oficina: texto(oficina && oficina.ObjectValueName),
    inicioCostura: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_INICIO_COSTURA))),
    dataCombinada: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DATA_COMBINADA_PLOOMES))),
    leadTime: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_LEAD_TIME))),
    pecas: nPecas === null || isNaN(nPecas) ? '' : nPecas,
    cliente: texto(deal.ContactName),
    peca: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DESCRICAO_PECA))) || texto(deal.Title),
    referencia: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_REFERENCIA))),
    versao: texto(deal.LastUpdateDate) || texto(deal.UpdatedAt)
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
    sincronizado_em: texto(sincronizadoEm)
  };
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

function montarSincronizacaoProducao(cards, producaoAtual, oficinasAtuais, sincronizadoEm) {
  var porDeal = Object.create(null);
  var ordemDeals = [];
  (cards || []).forEach(function (card) {
    var dealId = texto(card && card.dealId);
    if (!dealId) return;
    if (!Object.prototype.hasOwnProperty.call(porDeal, dealId)) ordemDeals.push(dealId);
    porDeal[dealId] = card;
  });

  var operacoes = [];
  ordemDeals.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: linhaProducao(porDeal[dealId], sincronizadoEm) });
  });
  var encerrados = Object.create(null);
  (producaoAtual || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    if (!dealId || porDeal[dealId] || encerrados[dealId] || !VALORES_ATIVO_PRODUCAO[semAcento(linha.em_costura)]) return;
    encerrados[dealId] = 1;
    operacoes.push({
      aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id',
      linha: { deal_id: dealId, em_costura: 'NAO', sincronizado_em: texto(sincronizadoEm) }
    });
  });

  var oficinasExistentes = Object.create(null);
  (oficinasAtuais || []).forEach(function (oficina) {
    var id = texto(oficina && oficina.ploomes_id);
    if (id) oficinasExistentes[id] = 1;
  });
  var oficinasVistas = Object.create(null);
  ordemDeals.forEach(function (dealId) {
    var card = porDeal[dealId];
    var id = texto(card && card.oficinaId);
    var nome = texto(card && card.oficina);
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

function faltasDaCaixaProducao(producao, caixas, tipo) {
  var dealId = texto(producao && producao.dealId);
  var faltas = [];
  (caixas || []).forEach(function (c) {
    if (!c || texto(c.dealId) !== dealId || semAcento(c.tipo) !== tipo) return;
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
  if (texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  var mensagem = (linhas.whatsappMensagens || []).filter(function (m) { return m && texto(m.id) === texto(corpo.mensagemId); })[0];
  if (!mensagem) return erroAcao(404, 'Mensagem do WhatsApp não encontrada.');
  if (semAcento(mensagem.direcao) !== 'RECEBIDA' || texto(mensagem.deal_id) || semAcento(mensagem.associacao) !== 'SEM_ASSOCIACAO') {
    return erroAcao(409, 'Esta mensagem já foi associada ou não pode ser associada.');
  }
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
  return {
    ok: true, versao: texto(producao.atualizado_em_ploomes), ploomes: null,
    operacoes: [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id', linha: linha }],
    historicos: [historicoProducao(ctx, texto(producao.deal_id), texto(producao.os), 'WHATSAPP_ASSOCIAR',
      ctx.usuario + ' associou manualmente uma mensagem do WhatsApp à OS ' + texto(producao.os) + '.')]
  };
}

function processarReenvioWhatsapp(corpo, linhas, ctx) {
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
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
  var osRegex = new RegExp('(^|\\D)' + os.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\D|$)');
  var mensagem = corpo.texto.trim();
  if (!osRegex.test(mensagem)) return erroAcao(400, 'A mensagem precisa identificar a OS ' + os + '.');
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
    partes.push('data combinada: ' + (texto(row.data_combinada) || '—') + ' → ' + (v.acao.dataCombinada || '—'));
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

function modeloWhatsapp(tipo, p, hojeISO) {
  p = p || {};
  var cab = '*OS ' + texto(p.os) + '*';
  var detalhe = texto(p.peca) + (numero(p.pecas) > 0 ? ', ' + formatarQtd(numero(p.pecas)) + ' pç' : '');
  var prazo = prazoDaProducao(p);
  if (tipo === 'CONFIRMAR_DATA') {
    return cab + '\nBom dia. Confirmando a entrega de ' + detalhe + ' para ' + dataCurtaProducao(texto(p.dataCombinada) || prazo.data) + '. Segue combinado?';
  }
  if (tipo === 'MATERIAL_ENVIADO') {
    return cab + '\nBom dia. O material que faltava na caixa de costura foi enviado hoje.';
  }
  if (tipo === 'COBRANCA_PRAZO') {
    var status = statusPrazo(p, hojeISO);
    if (status.status === 'ATRASADO') {
      return cab + '\nBom dia. A entrega de ' + detalhe + ' estava prevista para ' + dataCurtaProducao(prazo.data) + '. Qual a nova data de entrega?';
    }
    if (!prazo.data) return cab + '\nBom dia. Qual a previsão de entrega de ' + detalhe + '?';
    return cab + '\nBom dia. A entrega de ' + detalhe + ' está prevista para ' + dataCurtaProducao(prazo.data) + '. Segue dentro do prazo?';
  }
  return '';
}

function linhaAtivaProducao(valor) {
  var ativo = semAcento(valor);
  return ativo === '' || !!VALORES_ATIVO_PRODUCAO[ativo];
}

function mensagemProducaoBoard(m, reenviadas) {
  return {
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
      grupoNome: texto(o.grupo_nome)
    };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

function mensagensSemAssociacaoProducaoBoard(mensagens, oficinas) {
  var oficinasPorId = {};
  (oficinas || []).forEach(function (o) {
    if (o && texto(o.ploomes_id)) oficinasPorId[texto(o.ploomes_id)] = o;
  });
  return linhasWhatsappUnicas((mensagens || []).filter(function (m) {
    return m && semAcento(m.direcao) === 'RECEBIDA' && !texto(m.deal_id) && semAcento(m.associacao) === 'SEM_ASSOCIACAO';
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
    return base;
  });
}

function producoesBoard(extras, caixas) {
  extras = extras || {};
  return ordenarProducoes((extras.producao || []).filter(function (l) {
    return l && VALORES_ATIVO_PRODUCAO[semAcento(l.em_costura)];
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
      versao: texto(l.atualizado_em_ploomes)
    };
    if (p.pecas === null || isNaN(p.pecas)) p.pecas = null;
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
    return m && texto(m.id) && semAcento(m.status_envio) === 'PENDENTE';
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

function resultadoSaidaWhatsapp(mensagem, resposta) {
  mensagem = mensagem || {};
  resposta = resposta || {};
  var id = texto(mensagem.id);
  var status = Number(resposta.statusCode);
  var evolutionId = idRespostaWhatsapp(resposta);
  if (status >= 200 && status < 300 && evolutionId) {
    return { id: id, evolution_id: evolutionId, status_envio: 'ENVIADA', erro: '' };
  }
  var erro;
  if (status >= 200 && status < 300) erro = 'Envio aceito, mas a Evolution respondeu sem ID. Confira no WhatsApp antes de reenviar.';
  else if (status === 429) erro = 'Limite da Evolution (HTTP 429). Confirme um reenvio mais tarde.';
  else if (status >= 400 && status < 500) erro = 'A Evolution recusou o envio (HTTP ' + status + ').';
  else if (status >= 500) erro = 'Resultado incerto na Evolution (HTTP ' + status + '). Confira no WhatsApp antes de reenviar.';
  else erro = 'Resultado incerto por timeout ou falha de conexão. Confira no WhatsApp antes de reenviar.';
  return { id: id, evolution_id: '', status_envio: 'ERRO', erro: erro };
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
    if (!m || semAcento(m.direcao) !== 'ENVIADA' || semAcento(m.tipo) !== 'COBRANCA_PRAZO') return false;
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

function validarInterpretacaoWhatsapp(valor, quando) {
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
  var operacoes = [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: linhaMensagem }];
  var precisaInterpretar = msg.tipoConteudo === 'TEXTO' && !!associacao.dealId;
  var prod = producoes.filter(function (p) { return p.dealId === associacao.dealId; })[0] || {};
  return {
    ok: true,
    precisaInterpretar: precisaInterpretar,
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

  var validada = validarInterpretacaoWhatsapp(interpretacao, preparada.quando);
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
      usuario + ' aceitou a sugestão do WhatsApp' + (tipo === 'NOVA_DATA_COMBINADA' ? ': nova data ' + texto(sugestao.valor) + ' · ' + motivo : ': ' + texto(sugestao.resumo))
  };
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
var LEITURAS_BOARD = ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'HISTORICO_APP', 'USUARIOS',
  'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
var LEITURAS_ACAO = ['FALTANTES', 'CAIXAS_PCP', 'CAIXAS GANHAS', 'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES',
  { aba: 'HISTORICO_APP', soCabecalho: true }];

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
  { aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id' }
];
// Ordem dos appends (antes do batchUpdate). HISTORICO_APP vai sempre no fim.
var ORDEM_APPEND = ['PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'CAIXAS_PCP', 'FALTANTES',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
var ABAS_F4 = { PRODUCAO: 1, OFICINAS: 1, WHATSAPP_MENSAGENS: 1, WHATSAPP_SUGESTOES: 1 };
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
var DEALS_PRODUCAO_EDITAVEIS = ['0'];  // Bloqueado ate haver um card de teste do funil Producao; vazio = todos.
var DEALS_EDITAVEIS = ['607479158', '607493886', '607493902', '607520448'];  // vazio = todos. Até o go-live, só os cards de teste.
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
    dealsProducaoEditaveis: DEALS_PRODUCAO_EDITAVEIS.slice()
  };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}

// POST /pcp-acao, antes de ler a planilha: sessao e corpo. Falha devolve o
// mesmo { status, body } que o processarAcao daria (com ok: false para o IF);
// sucesso = { ok: true }. O processarAcao repete as checagens.
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (sessao && corpo && TIPOS_PRODUCAO.indexOf(corpo.tipo) >= 0) {
    var vProd = validarAcaoProducaoBasica(corpo, DEALS_PRODUCAO_EDITAVEIS);
    return vProd.ok ? { ok: true } : { ok: false, status: vProd.status, body: { erro: vProd.erro } };
  }
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
  if (sessao && corpo && TIPOS_PRODUCAO.indexOf(corpo.tipo) >= 0) {
    return processarAcaoProducao(estado, sessao, corpo, linhas, agora, gerarId);
  }
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

// ===== adaptador: Processar Acao =====
// Linhas: resposta do values:batchGet do HTTP "Ler Planilha Acao" (LEITURAS_ACAO).
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
var corpo = entrada.body || {};
var abas = planilhaDoLote($('Ler Planilha Acao').first().json, LEITURAS_ACAO).linhas;
var linhas = {
  faltantes: abas['FALTANTES'],
  caixasPcp: abas['CAIXAS_PCP'],
  ganhas: abas['CAIXAS GANHAS'],
  pedidos: abas['PEDIDOS'],
  pedidosItens: abas['PEDIDOS_ITENS'],
  etapas: abas['ETAPAS_PEDIDO'],
  producao: abas['PRODUCAO'],
  oficinas: abas['OFICINAS'],
  whatsappMensagens: abas['WHATSAPP_MENSAGENS'],
  whatsappSugestoes: abas['WHATSAPP_SUGESTOES']
};
var gerarId = function () { return require('crypto').randomUUID(); };
return [{ json: processarAcao(estado, cabecalho, corpo, linhas, Date.now(), gerarId) }];
