// ===== Code node "Processar Login" =====
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

function montarRespostaBoard(estado, faltantes, ganhas, agora) {
  var r = montarCaixas(faltantes, ganhas, new Date(agora));
  var corpo = { geradoEm: new Date(agora).toISOString(), caixas: r.caixas, avisos: r.avisos };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}

// ===== adaptador: Processar Login =====
// Entrada: linhas da aba USUARIOS ($input). Corpo do POST vem do webhook.
var estado = $getWorkflowStaticData('global');
var corpo = $('Login').first().json.body || {};
var usuarios = $input.all().map(function (i) { return i.json; });
return [{ json: processarLogin(require('crypto'), estado, corpo, usuarios, Date.now()) }];
