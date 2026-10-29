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
var MODELO_GROQ_EMAIL_PCP = 'openai/gpt-oss-20b';
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

// Remetente "Nome <a@b>" (cabeçalho From) -> { nome, endereco }.
function remetenteEmailPcp(de) {
  var t = texto(de);
  var m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(t);
  if (m) return { nome: texto(m[1]), endereco: texto(m[2]).toLowerCase() };
  return { nome: '', endereco: t.toLowerCase() };
}

// ----- Formato bruto da Gmail API (users.messages.get?format=full) -----

// Ids da resposta de users.messages.list. Sem "messages" (nenhum e-mail): lista vazia.
// Só ids com letras, números, traço e sublinhado: o id vai no caminho da URL.
function idsListaGmailPcp(resposta) {
  var ids = [];
  ((resposta && resposta.messages) || []).forEach(function (m) {
    var id = texto(m && m.id);
    if (/^[A-Za-z0-9_-]+$/.test(id) && ids.indexOf(id) < 0) ids.push(id);
  });
  return ids;
}

// Valor do cabeçalho (nome sem diferença de caixa) numa lista [{ name, value }].
function cabecalhoGmailPcp(headers, nome) {
  var alvo = nome.toLowerCase();
  var h = (headers || []).filter(function (x) { return x && texto(x.name).toLowerCase() === alvo; })[0];
  return h ? texto(h.value) : '';
}

var ALFABETO_BASE64_EMAIL_PCP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// base64url (ou base64) -> bytes.
function bytesBase64EmailPcp(dado) {
  var s = texto(dado).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  var bytes = [];
  var buf = 0;
  var bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | ALFABETO_BASE64_EMAIL_PCP.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  return bytes;
}

// Bytes UTF-8 -> texto (sequência inválida vira U+FFFD).
function textoUtf8EmailPcp(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length;) {
    var b = bytes[i];
    var n = b < 0x80 ? 0 : b >= 0xF0 && b < 0xF8 ? 3 : b >= 0xE0 ? 2 : b >= 0xC0 ? 1 : -1;
    if (n < 0) { out += '\uFFFD'; i++; continue; }
    if (n === 0) { out += String.fromCharCode(b); i++; continue; }
    var cp = b & (0x3F >> n);
    var ok = true;
    for (var k = 1; k <= n; k++) {
      var c = bytes[i + k];
      if (c === undefined || (c & 0xC0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (c & 0x3F);
    }
    if (!ok) { out += '\uFFFD'; i++; continue; }
    if (cp > 0xFFFF) {
      cp -= 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    } else {
      out += String.fromCharCode(cp);
    }
    i += n + 1;
  }
  return out;
}

// Corpo de uma parte: base64url decodificado no charset do Content-Type (latin1 ou UTF-8).
function corpoParteGmailPcp(parte) {
  var bytes = bytesBase64EmailPcp(parte && parte.body && parte.body.data);
  if (!bytes.length) return '';
  var tipo = cabecalhoGmailPcp(parte.headers, 'Content-Type').toLowerCase();
  if (/charset\s*=\s*"?(iso-8859-1|latin1|windows-1252|us-ascii)/.test(tipo)) {
    return bytes.map(function (b) { return String.fromCharCode(b); }).join('');
  }
  return textoUtf8EmailPcp(bytes);
}

// Primeira parte (busca em profundidade em payload.parts) com o mimeType pedido e corpo.
function parteGmailPcp(parte, mime) {
  if (!parte) return '';
  if (texto(parte.mimeType).toLowerCase() === mime && !texto(parte.filename)) {
    var t = corpoParteGmailPcp(parte);
    if (t.trim()) return t;
  }
  var partes = parte.parts || [];
  for (var i = 0; i < partes.length; i++) {
    var achou = parteGmailPcp(partes[i], mime);
    if (achou) return achou;
  }
  return '';
}

function quandoEmailPcp(data, internalDate) {
  var d = Date.parse(texto(data));
  if (!isFinite(d)) d = Number(texto(internalDate));
  return isFinite(d) && d > 0 ? new Date(d).toISOString() : '';
}

// Mensagem da Gmail API (format=full) -> e-mail normalizado. Corpo: o text/plain; se só
// houver text/html, o texto sem as tags; sem corpo, o snippet.
function emailDoGmailPcp(json) {
  json = json || {};
  var payload = json.payload || {};
  var headers = payload.headers || [];
  var de = remetenteEmailPcp(cabecalhoGmailPcp(headers, 'From'));
  return {
    id: texto(json.id),
    threadId: texto(json.threadId),
    quando: quandoEmailPcp(cabecalhoGmailPcp(headers, 'Date'), json.internalDate),
    deNome: de.nome,
    deEndereco: de.endereco,
    assunto: cabecalhoGmailPcp(headers, 'Subject'),
    texto: parteGmailPcp(payload, 'text/plain') || textoDoHtmlEmailPcp(parteGmailPcp(payload, 'text/html')) || texto(json.snippet)
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

// gmail: itens do nó Ler E-mail ([{ json }], mensagens da Gmail API); dados: { emails (aba EMAILS_PCP), faltantes, ganhas }.
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

// Nome da caixa no histórico: o aceite grava uma linha por caixa (cada caixa é um card no
// Ploomes, com o próprio registro compilado); com o nome, a Visão da peça, que junta as
// caixas da OS, não mostra duas linhas iguais.
var NOMES_CAIXA_EMAIL_PCP = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento', PREPARACAO: 'Preparação' };
function nomeCaixaEmailPcp(caixas, dealId) {
  var c = (caixas || []).filter(function (x) { return x && texto(x.dealId) === dealId; })[0];
  var tipo = c ? texto(c.tipo) : '';
  return NOMES_CAIXA_EMAIL_PCP[tipo] || (tipo ? tipo.charAt(0) + tipo.slice(1).toLowerCase() : '');
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
        var nome = nomeCaixaEmailPcp(caixas, d);
        registrar(d, 'previsão ' + dataCurta(data) + ' para a caixa' + (nome ? ' ' + nome : ''));
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
    alvos.forEach(function (d) {
      var nome = alvos.length > 1 ? nomeCaixaEmailPcp(caixas, d) : '';
      registrar(d, sufixo + (nome ? ' (caixa ' + nome + ')' : ''));
    });
  }
  operacoes.push({ aba: ABA_EMAILS_PCP, operacao: 'update', chave: 'id', linha: { id: texto(linha.id), status: destino, decidido_em: ctx.agora, decidido_por: ctx.usuario } });
  return { ok: true, idempotente: false, versao: ctx.agora, operacoes: operacoes, historicos: historicos, emailId: texto(linha.id) };
}
