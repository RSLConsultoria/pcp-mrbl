// ===== Code node "Montar Board" =====
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
  // F3: item -> pedido aberto que o contem.
  var abertosPorItem = pedidosAbertosPorItem(lerPedidos(extras.pedidos, extras.pedidosItens));
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
    caixa.tratativa = cp ? semAcento(cp.tratativa) : '';
    caixa.tratativaEm = cp ? texto(cp.tratativa_em) : '';
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
// F3: solicitacoes de faltas (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO) e a
// tratativa das caixas que sairam com falta (enviar a oficina / oficina
// recebeu). A ultima etapa (maior ordem) e sempre a "Resolvido": mover para
// ela da a baixa do pedido nas caixas. Funcoes puras; sem import/export. Depende de util.js e acoes.js.
// Cada acao devolve { operacoes: [{ aba, operacao, chave, linha }], historicos }.

var TIPOS_PEDIDO = ['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido',
  'dividir_pedido', 'dividir_por_previsao', 'salvar_etapas', 'enviar_oficina', 'oficina_recebeu'];
var ETAPAS_PADRAO = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  // id 'entregue' mantido para os dados existentes; o nome e "Resolvido".
  { id: 'entregue', nome: 'Resolvido', ordem: 4 }
];
var ORIGENS = { FORNECEDOR: 'Fornecedor', CLIENTE: 'Cliente' };
var LOCAIS = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
var ERRO_VERSAO = 'Alguém alterou esta caixa agora há pouco.';
var ERRO_VERSAO_PEDIDO = 'Alguém alterou este pedido agora há pouco.';
var CAMPOS_PEDIDO = ['etapa', 'origem', 'quem', 'local', 'previsao', 'responsavel'];
var NOMES_CAMPO = { etapa: 'Etapa', origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };

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

// Etapas validas (com id e nome), ordenadas; aba vazia = padrao.
function lerEtapas(linhas) {
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

// [{ linha, id, itens: [linhas de PEDIDOS_ITENS] }], sem sementes.
function lerPedidos(pedidos, itens) {
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
    porId[pid].itens.push(it);
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
  return avisos;
}

function pedidoAberto(p) {
  return texto(p.linha.baixado_em) === '';
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
function montarPedidos(extras, ano) {
  extras = extras || {};
  var etapas = lerEtapas(extras.etapas);
  var lista = lerPedidos(extras.pedidos, extras.pedidosItens);
  var pedidos = lista.slice().sort(function (a, b) { return compararPedidos(a.id, b.id); })
    .map(function (p) {
      var l = p.linha;
      var baixadoEm = texto(l.baixado_em);
      var etapa = texto(l.etapa);
      var previsao = dataISO(l.previsao, ano);
      var itens = p.itens.map(function (it) {
        var q = numero(it.qtd);
        return {
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
        versao: texto(l.atualizado_em),
        finalizado: baixadoEm !== '',
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
  if (nome === 'etapa') {
    var e = texto(v);
    return e ? { ok: true, valor: e } : { ok: false, erro: 'Etapa inválida.' };
  }
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
  if (corpo.tipo === 'enviar_oficina' || corpo.tipo === 'oficina_recebeu') {
    var d = texto(corpo.dealId);
    return d ? [d] : [];
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

  if (tipo === 'enviar_oficina' || tipo === 'oficina_recebeu') {
    acao.dealId = texto(corpo.dealId);
    if (!acao.dealId) return erroAcao(400, 'Caixa não informada.');
    acao.versao = texto(corpo.versao);
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
    if (acao.etapas.length < 2) return erroAcao(400, 'O quadro precisa de pelo menos 2 etapas.');
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

  if (tipo === 'mover_pedido') {
    acao.etapa = texto(corpo.etapa);
    if (!acao.etapa) return erroAcao(400, 'Etapa inválida.');
  } else if (tipo === 'dividir_pedido') {
    acao.etapa = texto(corpo.etapa);
    if (!acao.etapa) return erroAcao(400, 'Etapa inválida.');
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
  var faltantesPorId = {};
  (linhas.faltantes || []).forEach(function (l) {
    if (l && texto(l.id) && !faltantesPorId[texto(l.id)]) faltantesPorId[texto(l.id)] = l;
  });
  var etapas = lerEtapas(linhas.etapas);
  var lista = lerPedidos(linhas.pedidos, linhas.pedidosItens);
  var abertos = pedidoAbertoPorItem(lista);
  var tipo = acao.tipo;

  if (tipo === 'enviar_oficina' || tipo === 'oficina_recebeu') return aplicarTratativa(acao, linhas, ctx, lista, etapas);
  if (tipo === 'salvar_etapas') return aplicarEtapas(acao, linhas, ctx, lista);

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

  // editar / mover / baixar: pedido existente
  var p = lista.filter(function (x) { return x.id === acao.pedidoId; })[0];
  if (!p) return erroAcao(404, 'Pedido não encontrado.');
  if (!p.itens.length) return erroAcao(409, 'Pedido sem itens válidos.');
  var dealsP = p.itens.map(function (x) { return texto(x.deal_id); });
  if (primeiroNaoEditavel(dealsP) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
  if (!pedidoAberto(p)) return erroAcao(409, 'Pedido finalizado não pode ser alterado.');
  if (acao.versao !== texto(p.linha.atualizado_em)) return erroAcao(409, ERRO_VERSAO_PEDIDO);
  var grupos = porOS(p.itens, function (x) { return texto(x.deal_id); }, function (x) { return texto(x.os); });
  function existeEtapa(id) { return etapas.some(function (e) { return e.id === id; }); }

  var ultima = etapas[etapas.length - 1];
  if (tipo === 'dividir_pedido') return aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId);
  if (tipo === 'dividir_por_previsao') return aplicarDivisaoPorPrevisao(acao, linhas, ctx, p);

  if (tipo === 'mover_pedido') {
    if (!existeEtapa(acao.etapa)) return erroAcao(400, 'Etapa inválida.');
    if (acao.etapa === texto(p.linha.etapa)) return erroAcao(400, 'O pedido já está nessa etapa.');
    var nomeEtapa = mostrarCampo('etapa', acao.etapa, etapas);
    var linhaMov = { id: p.id, etapa: acao.etapa, atualizado_em: agora };
    var bxM = { operacoes: [], partes: {} };
    // Entrar na ultima etapa (Resolvido) da a baixa e finaliza o pedido.
    if (acao.etapa === ultima.id) {
      bxM = baixaDosItens(p.itens, faltantesPorId, agora);
      if (!bxM.ok) return bxM;
      linhaMov = { id: p.id, etapa: acao.etapa, baixado_em: agora, atualizado_em: agora };
    }
    return {
      ok: true,
      operacoes: bxM.operacoes.concat([op('PEDIDOS', 'update', 'id', linhaMov)]),
      historicos: grupos.map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' moveu ' + p.id + ' para ' + nomeEtapa + textoBaixa(bxM.partes[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  if (tipo === 'baixar_pedido') {
    // Mantido por compatibilidade; o app da baixa movendo para a ultima etapa.
    if (texto(p.linha.etapa) !== ultima.id) return erroAcao(400, 'Dar baixa só na última etapa.');
    var bx = baixaDosItens(p.itens, faltantesPorId, agora);
    if (!bx.ok) return bx;
    return {
      ok: true,
      operacoes: bx.operacoes.concat([op('PEDIDOS', 'update', 'id', { id: p.id, baixado_em: agora, atualizado_em: agora })]),
      historicos: grupos.filter(function (g) { return bx.partes[g.dealId]; }).map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' deu baixa do ' + p.id + ': ' + bx.partes[g.dealId].join('; '));
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
  if (mudPedido.etapa !== undefined && !existeEtapa(mudPedido.etapa)) return erroAcao(400, 'Etapa inválida.');
  var ano = new Date(agora).getFullYear();
  var previsaoPedidoDepois = mudPedido.previsao !== undefined ? mudPedido.previsao : valorAtualCampo(p.linha, 'previsao', ano);
  var qtdNova = {};
  var opsItens = [];
  var resumoItens = {};
  for (var j = 0; j < acao.itens.length; j++) {
    var mi = acao.itens[j];
    var linhaPi = p.itens.filter(function (x) { return texto(x.item_id) === mi.itemId; })[0];
    if (!linhaPi) return erroAcao(400, 'Item não está no pedido.');
    var nomeItem = texto(linhaPi.nome);
    var mud = {};
    var res = [];
    var qAntes = numero(linhaPi.qtd);
    if (mi.qtd !== undefined && mi.qtd !== qAntes) {
      var lfe = faltantesPorId[mi.itemId];
      if (!lfe) return erroAcao(409, 'Item não encontrado.');
      var re = restaDaLinha(lfe);
      if (re === null) return erroAcao(400, 'Item sem quantidade faltante registrada.');
      if (mi.qtd > re) return erroAcao(400, 'Falta só ' + formatarQtd(re) + ' ' + texto(lfe.unidade) + ' de ' + nomeItem);
      mud.qtd = mi.qtd;
      qtdNova[mi.itemId] = mi.qtd;
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
    opsItens.push(op('PEDIDOS_ITENS', 'update', 'id', Object.assign({ id: texto(linhaPi.id) || p.id + '|' + mi.itemId }, mud)));
    var dd = texto(linhaPi.deal_id);
    resumoItens[dd] = (resumoItens[dd] || []).concat(res);
  }
  if (!resumoPedido.length && !opsItens.length) return erroAcao(400, 'Nada alterado.');
  var linhaPed = Object.assign({ id: p.id }, mudPedido, { atualizado_em: agora });
  var bxE = { operacoes: [], partes: {} };
  if (mudPedido.etapa === ultima.id) {
    // Mudar a etapa para a ultima (Resolvido) da a baixa, com as quantidades ja editadas.
    bxE = baixaDosItens(p.itens.map(function (x) {
      var k = texto(x.item_id);
      return qtdNova[k] === undefined ? x : Object.assign({}, x, { qtd: qtdNova[k] });
    }), faltantesPorId, agora);
    if (!bxE.ok) return bxE;
    linhaPed = Object.assign({ id: p.id }, mudPedido, { baixado_em: agora, atualizado_em: agora });
  }
  return {
    ok: true,
    operacoes: [op('PEDIDOS', 'update', 'id', linhaPed)].concat(opsItens, bxE.operacoes),
    historicos: grupos.map(function (g) {
      var resumo = resumoPedido.concat(resumoItens[g.dealId] || []);
      return resumo.length
        ? linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' alterou ' + p.id + ': ' + resumo.join(', ') + textoBaixa(bxE.partes[g.dealId]))
        : null;
    }).filter(function (h) { return h; }),
    versao: agora,
    pedidoId: p.id
  };
}

// Baixa dos itens de um pedido na FALTANTES: soma min(qtd, resta) em qtd_baixada
// (pula SUBSTITUIDO e quem nao tem falta registrada). itens = linhas da
// PEDIDOS_ITENS (ou { item_id, deal_id, qtd }). Devolve { ok, operacoes,
// partes: { dealId: ['20 MT de VIÉS (resta 80 MT)'] } } ou o erro.
function baixaDosItens(itens, faltantesPorId, agora) {
  var operacoes = [];
  var partes = {};
  for (var k = 0; k < itens.length; k++) {
    var pi = itens[k];
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
  return { ok: true, operacoes: operacoes, partes: partes };
}

// " e deu baixa: 20 MT de VIÉS (resta 80 MT)" ou '' quando a OS nao teve baixa.
function textoBaixa(partes) {
  return partes && partes.length ? ' e deu baixa: ' + partes.join('; ') : '';
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

// dividir_pedido: parte dos itens (ou parte da quantidade) vira um pedido
// novo da mesma familia (PED-0002 -> PED-0002.k), na etapa escolhida. O
// pedido dividido fica com o resto; linha com qtd 0 e ignorada na leitura.
// Dividir uma parte (PED-0002.1) cria outra parte da raiz (PED-0002.k).
function aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var etapa = etapas.filter(function (e) { return e.id === acao.etapa; })[0];
  if (!etapa) return erroAcao(400, 'Etapa inválida.');
  var porItem = {};
  p.itens.forEach(function (x) { if (!porItem[texto(x.item_id)]) porItem[texto(x.item_id)] = x; });
  var movidos = [];
  for (var i = 0; i < acao.itens.length; i++) {
    var mi = acao.itens[i];
    var li = porItem[mi.itemId];
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

  // Parte que vai direto para a ultima etapa (Resolvido) ja nasce com a baixa.
  var naUltima = etapa.id === etapas[etapas.length - 1].id;
  var bx = { operacoes: [], partes: {} };
  if (naUltima) {
    bx = baixaDosItens(movidos.map(function (m) { return Object.assign({}, m.linha, { qtd: m.qtd }); }), faltantesPorId, agora);
    if (!bx.ok) return bx;
  }
  var raiz = raizDoPedido(p.id);
  var filho = proximoIdFilho(linhas.pedidos, raiz);
  var ano = new Date(agora).getFullYear();
  var operacoes = [linhaParte(p, filho, raiz, etapa.id, valorAtualCampo(p.linha, 'previsao', ano), agora, u, naUltima)];
  movidos.forEach(function (m) { operacoes.push(linhaItemParte(m.linha, filho, m.qtd, ano)); });
  movidos.forEach(function (m) {
    operacoes.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(m.linha.id) || p.id + '|' + texto(m.linha.item_id), qtd: m.resta }));
  });
  operacoes.push(op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora }));
  operacoes = operacoes.concat(bx.operacoes);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var partes = g.itens.map(function (m) { return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome); });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo,
        u + ' dividiu ' + p.id + ': ' + partes.join('; ') + ' foram para ' + filho + ' (' + etapa.nome + ')' + textoBaixa(bx.partes[g.dealId]));
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
      zerar.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(x.id) || p.id + '|' + texto(x.item_id), qtd: 0 }));
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
  // A ultima etapa (Resolvido: mover para ela da a baixa) fica sempre por ultimo.
  var ultimaAtual = atuais[atuais.length - 1];
  if (acao.etapas[acao.etapas.length - 1].id !== ultimaAtual.id) {
    return erroAcao(400, 'A última etapa (' + ultimaAtual.nome + ') precisa continuar por último.');
  }
  var mantidas = {};
  acao.etapas.forEach(function (e) { if (e.id) mantidas[e.id] = 1; });
  var removidas = atuais.filter(function (e) { return !mantidas[e.id]; });
  for (i = 0; i < removidas.length; i++) {
    var rid = removidas[i].id;
    var comPedido = lista.some(function (p) { return pedidoAberto(p) && texto(p.linha.etapa) === rid; });
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

// Enviar a oficina so com todo o material na ultima etapa: cada item aberto da
// caixa tem pedido aberto e todos os pedidos abertos dele (original e partes)
// estao na ultima etapa. Etapa que nao existe mais conta como a primeira.
function materialNaUltimaEtapa(faltantes, lista, etapas) {
  var ultima = etapas[etapas.length - 1];
  var etapaDe = {};
  lista.forEach(function (p) { etapaDe[p.id] = texto(p.linha.etapa); });
  var porItem = pedidosAbertosPorItem(lista);
  for (var i = 0; i < faltantes.length; i++) {
    var l = faltantes[i];
    if (!STATUS_ABERTOS[semAcento(l.status)]) continue;
    var resta = restaDaLinha(l);
    if (resta !== null && resta <= 0) continue;
    var ids = porItem[texto(l.id)] || [];
    if (!ids.length) return false;
    for (var k = 0; k < ids.length; k++) if (etapaDe[ids[k]] !== ultima.id) return false;
  }
  return true;
}

function aplicarTratativa(acao, linhas, ctx, lista, etapas) {
  if (!dealEditavel(acao.dealId)) return erroAcao(403, ERRO_NAO_EDITAVEL);
  var faltantes = (linhas.faltantes || []).filter(function (l) { return l && texto(l.deal_id) === acao.dealId; });
  var cpRow = (linhas.caixasPcp || []).filter(function (c) { return c && texto(c.deal_id) === acao.dealId; })[0] || null;
  var g = (linhas.ganhas || []).filter(function (x) { return x && texto(x.deal_id) === acao.dealId; })[0] || null;
  if (!faltantes.length && !g) return erroAcao(404, 'Caixa não encontrada.');
  if (acao.versao !== (cpRow ? texto(cpRow.atualizado_em) : '')) return erroAcao(409, ERRO_VERSAO);

  var os = faltantes.length ? texto(faltantes[0].os) : '';
  if (!os && cpRow) os = texto(cpRow.os);
  if (!os && g) os = texto(g.os);
  var agora = ctx.agora;
  var recebeu = acao.tipo === 'oficina_recebeu';
  if (!recebeu && !materialNaUltimaEtapa(faltantes, lista, etapas)) {
    return erroAcao(409, 'O material desta caixa ainda não chegou (etapa ' + etapas[etapas.length - 1].nome + ').');
  }

  var linhaCp = { deal_id: acao.dealId, os: os, tratativa: recebeu ? 'RECEBIDO' : 'ENVIADO', tratativa_em: agora, atualizado_em: agora };
  if (!cpRow) {
    var resp = '';
    faltantes.forEach(function (l) { if (!resp) resp = texto(l.responsavel); });
    linhaCp.responsavel = resp;
  }
  var operacoes = [op('CAIXAS_PCP', 'appendOrUpdate', 'deal_id', linhaCp)];
  if (recebeu) {
    for (var i = 0; i < faltantes.length; i++) {
      var l = faltantes[i];
      if (!STATUS_ABERTOS[semAcento(l.status)]) continue;
      var falta = numero(l.qtd_falta);
      if (falta === null || isNaN(falta)) continue;
      var bx = numero(l.qtd_baixada);
      if (bx !== null && isNaN(bx)) return erroAcao(400, 'Baixa registrada ilegível na planilha.');
      if (bx !== null && bx >= falta) continue;
      operacoes.push(op('FALTANTES', 'update', 'id', { id: texto(l.id), qtd_baixada: arredondar(falta), atualizado_em_app: agora }));
    }
  }
  var txt = recebeu
    ? ctx.usuario + ' registrou que a oficina recebeu o material'
    : ctx.usuario + ' enviou o material faltante à oficina';
  return {
    ok: true,
    operacoes: operacoes,
    historicos: [linhaHistorico(ctx, acao.dealId, os, '', acao.tipo, txt)],
    versao: agora
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
  'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS'];
var LEITURAS_ACAO = ['FALTANTES', 'CAIXAS_PCP', 'CAIXAS GANHAS', 'PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO',
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
  { aba: 'CAIXAS_PCP', operacao: 'appendOrUpdate', chave: 'deal_id' }
];
// Ordem dos appends (antes do batchUpdate). HISTORICO_APP vai sempre no fim.
var ORDEM_APPEND = ['PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'CAIXAS_PCP', 'FALTANTES'];
var ABA_HISTORICO = 'HISTORICO_APP';

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

// Resposta do values:batchGet -> { linhas: { ABA: [...] }, cabecalhos: { ABA: [...] },
// linhaCabecalho: { ABA: n } }. Os valueRanges vem na ordem pedida.
function planilhaDoLote(resposta, leituras) {
  var vr = resposta && resposta.valueRanges;
  if (!vr || vr.length !== leituras.length) {
    throw new Error('Leitura em lote: esperava ' + leituras.length + ' abas, veio ' + (vr ? vr.length : 0));
  }
  var p = { linhas: {}, cabecalhos: {}, linhaCabecalho: {} };
  leituras.forEach(function (l, i) {
    var aba = nomeDaLeitura(l);
    var inicio = linhaInicialDoRange(vr[i].range);
    var values = vr[i].values || [];
    p.linhas[aba] = linhasDaAba(values, inicio);
    p.cabecalhos[aba] = (values[0] || []).map(function (c) { return texto(c); });
    p.linhaCabecalho[aba] = inicio;
  });
  return p;
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

// operacoes[] + historicos[] -> [{ method, url, body }] na ordem de execucao:
// 1) cabecalhos novos (campo sem coluna vai para a proxima coluna livre);
// 2) values:append por aba (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, CAIXAS_PCP),
//    incluindo appendOrUpdate cuja chave nao existe. OVERWRITE: escreve nas
//    linhas vazias depois da tabela sem deslocar linhas, entao os row_number
//    lidos seguem valendo para o batchUpdate da mesma acao;
// 3) um values:batchUpdate com todas as atualizacoes (so as colunas presentes
//    na operacao, sem a coluna de casamento; a linha vem dos dados lidos);
// 4) values:append no HISTORICO_APP.
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
    return {
      method: 'POST',
      url: base + '/' + encodeURIComponent(rangeDaAba(aba, 'A' + e.linhaCab)) +
        ':append?valueInputOption=RAW&insertDataOption=OVERWRITE',
      body: { values: linhas.map(function (l) { return linhaNoCabecalho(e, l); }) }
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
    reqs.push({ method: 'POST', url: base + ':batchUpdate', body: { valueInputOption: 'RAW', data: cabecalhos } });
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
    reqs.push({ method: 'POST', url: base + ':batchUpdate', body: { valueInputOption: 'RAW', data: dados } });
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

// ===== adaptador: Montar Board =====
// Entrada: a resposta do values:batchGet do HTTP "Ler Planilha" (abas em
// LEITURAS_BOARD), convertida nas mesmas linhas que o node Sheets entregava.
var estado = $getWorkflowStaticData('global');
var abas = planilhaDoLote($('Ler Planilha').first().json, LEITURAS_BOARD).linhas;
var extras = {
  caixasPcp: abas['CAIXAS_PCP'],
  historico: abas['HISTORICO_APP'],
  usuarios: abas['USUARIOS'],
  pedidos: abas['PEDIDOS'],
  pedidosItens: abas['PEDIDOS_ITENS'],
  etapas: abas['ETAPAS_PEDIDO'],
  fornecedores: abas['FORNECEDORES'],
  responsaveis: abas['RESPONSAVEIS']
};
return [{ json: montarRespostaBoard(estado, abas['FALTANTES'], abas['CAIXAS GANHAS'], Date.now(), extras) }];
