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
  /^(De|From|Enviado|Sent)\s*:/i,
  /^Em\s.+\sescreveu\s*:?$/i,
  /^On\s.+\swrote\s*:?$/i,
  /^-{2,}\s*(Original|Mensagem original|Mensagem encaminhada|Forwarded)/i,
  /^_{8,}$/,
  /^>/
];
// "Em seg., 27 de out. ... <x@y>" com o "escreveu:" na linha de baixo (o Gmail quebra a linha).
var INICIO_HISTORICO_QUEBRADO_EMAIL_PCP = [/^Em\s.+/i, /^On\s.+/i];
var FIM_HISTORICO_QUEBRADO_EMAIL_PCP = [/^escreveu\s*:?$/i, /^wrote\s*:?$/i];
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
    var prox = i + 1 < linhas.length ? linhas[i + 1].trim() : '';
    if (casaAlgumEmailPcp(l, INICIO_HISTORICO_QUEBRADO_EMAIL_PCP) && casaAlgumEmailPcp(prox, FIM_HISTORICO_QUEBRADO_EMAIL_PCP)) break;
    if (l) fica.push(l);
  }
  return fica.join(' ').replace(/\s+/g, ' ').trim().slice(0, LIMITE_TEXTO_EMAIL_PCP);
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
      if (i && itemEstaAberto(i)) {
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
  lista.forEach(function (c) {
    var bruto = texto(c);
    var ci = textoComparavelWhatsapp(bruto);
    if (!ci) return;
    (itensAbertos || []).forEach(function (i) {
      var n1 = textoComparavelWhatsapp(i.nome);
      var n2 = textoComparavelWhatsapp(nomeItemEmailPcp(i));
      var bate = bruto === texto(i.id) || ci === n1 || ci === n2 ||
        (ci.length >= 4 && n1.length >= 4 && (n1.indexOf(ci) >= 0 || ci.indexOf(n1) >= 0));
      if (bate && ids.indexOf(texto(i.id)) < 0) ids.push(texto(i.id));
    });
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
var LIMITE_RODADA_EMAIL_PCP = 10;
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
