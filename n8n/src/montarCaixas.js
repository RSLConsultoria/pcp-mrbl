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
  return !!STATUS_ABERTOS[it.status] && (it.falta === null || it.falta > 0);
}

function itemDaLinha(l, ano) {
  var obs = [texto(l.obs_almoxarifado), texto(l.observacao_pcp)]
    .filter(function (s) { return s !== ''; }).join(' · ');
  var nec = numero(l.qtd_necessaria);
  var sep = numero(l.qtd_separada);
  var falta = numero(l.qtd_falta);
  var faltaG = numero(l.qtd_falta_g);
  return {
    id: texto(l.id),
    nome: texto(l.descricao_item),
    cor: texto(l.nome_cor) || texto(l.cor),
    un: texto(l.unidade),
    necessaria: isNaN(nec) ? null : nec,
    separada: isNaN(sep) ? null : sep,
    falta: falta,
    faltaG: faltaG === null || isNaN(faltaG) ? null : faltaG,
    status: semAcento(l.status),
    obs: obs,
    previsao: dataISO(l.previsao, ano),
    resolvidoEm: dataISO(l.data_resolucao, ano)
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
        obs: '',
        previsao: '',
        resolvidoEm: ''
      };
    });
}

function menorData(datas) {
  return datas.filter(function (d) { return d !== ''; }).sort()[0] || '';
}

function montarCaixas(faltantes, ganhas, hoje) {
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
    return marcarSaida({
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
    }, ganhasPorDeal[dealId]);
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
        obs: '', previsao: '', resolvidoEm: ''
      });
    }
    caixas.push(marcarSaida({
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
    }, g));
  });

  caixas.sort(function (a, b) {
    if (a.registradoEm !== b.registradoEm) return a.registradoEm < b.registradoEm ? -1 : 1;
    return a.os < b.os ? -1 : a.os > b.os ? 1 : 0;
  });
  return { caixas: caixas, avisos: avisos };
}
