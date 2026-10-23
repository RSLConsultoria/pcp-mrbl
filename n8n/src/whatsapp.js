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
  var trecho = textoComparavelWhatsapp(evidencia);
  if (comparavel && trecho && (' ' + comparavel + ' ').indexOf(' ' + trecho + ' ') < 0) {
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
    var todosCandidatos = candidatosAssociacaoWhatsapp(dados.producao, msg.oficinaId, dados.mensagens, dataISOEmSaoPaulo(agora));
    var pergunta = perguntaAbertaWhatsapp(dados.mensagens, msg.grupoJid, agora);
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
        mensagem: linhaMensagem, candidatos: todosCandidatos, pergunta: pergunta, original: original,
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
  'para entender a resposta. Devolva somente o objeto estruturado.';

var SCHEMA_INTERPRETE_WHATSAPP = {
  tipo: ['NOVA_DATA_COMBINADA', 'PRAZO_CONFIRMADO', 'MOTIVO_ATRASO', 'OBSERVACAO'],
  valor: 'data ISO, data em dd/mm ou expressão relativa quando houver nova data',
  resumo: 'resumo curto em português',
  evidencia: 'trecho curto que sustenta a interpretação',
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
