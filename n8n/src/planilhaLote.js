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
// Entrada do WhatsApp (e o workflow Interpretar WhatsApp): FALTANTES e CAIXAS GANHAS
// dão as faltas abertas da OS ao contexto do intérprete.
var LEITURAS_WHATSAPP_ENTRADA = ['OFICINAS', 'PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'FALTANTES', 'CAIXAS GANHAS'];
// Agendamento das novas tentativas do intérprete (workflow Retentar Interpretação).
var LEITURAS_RETENTAR_INTERPRETACAO = ['PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
// Sync da produção (a cada 5 min): as médias da previsão entram na projeção das OS previstas.
var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS', 'PREVISAO_MEDIAS'];
// Workflow diário "PCP MRBL - Médias de Previsão".
var LEITURAS_MEDIAS_PREVISAO = ['PREVISAO_MEDIAS'];

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
  // Médias da previsão (19/10): linha casada pela coluna chave (tipo|etapa|faixa|oficina_id).
  { aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave' },
  { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave' }
];
// Ordem dos appends (antes do batchUpdate). HISTORICO_APP vai sempre no fim.
var ORDEM_APPEND = ['PEDIDOS', 'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'CAIXAS_PCP', 'FALTANTES',
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
var ABAS_F4 = { PRODUCAO: 1, OFICINAS: 1, WHATSAPP_MENSAGENS: 1, WHATSAPP_SUGESTOES: 1, PREVISAO_MEDIAS: 1 };
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
