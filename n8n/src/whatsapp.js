// ===== src/whatsapp.js =====
// Regras puras da F4 para receber, associar e validar a interpretacao de
// mensagens de grupos. O interprete e silencioso: este arquivo nunca envia.

var TIPOS_INTERPRETACAO_WHATSAPP = {
  NOVA_DATA_COMBINADA: 1,
  PRAZO_CONFIRMADO: 1,
  MOTIVO_ATRASO: 1,
  OBSERVACAO: 1
};

function grupoWhatsappAtivo(grupos, jid) {
  var alvo = texto(jid);
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

function normalizarEventoWhatsapp(payload, grupos) {
  payload = payload || {};
  var evento = semAcento(payload.event).replace(/[._-]/g, '');
  if (evento !== 'MESSAGESUPSERT') return { ok: false, motivo: 'EVENTO_IGNORADO' };
  var d = payload.data || {};
  var chave = d.key || {};
  if (chave.fromMe === true) return { ok: false, motivo: 'MENSAGEM_PROPRIA' };
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
    if (texto(m.grupo_jid) !== texto(msg.grupoJid) || texto(m.respondida)) return false;
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

function somarDiasISO(data, dias) {
  var ms = Date.parse(data + 'T12:00:00Z');
  if (!isFinite(ms)) return '';
  return new Date(ms + dias * 86400000).toISOString().slice(0, 10);
}

function resolverDataInterpretada(valor, quando) {
  var bruto = texto(valor);
  var normal = semAcento(bruto).toLowerCase();
  var base = texto(quando).slice(0, 10);
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
  if (confianca < 0.7) {
    tipo = 'OBSERVACAO';
    data = '';
  }
  return { ok: true, tipo: tipo, valor: tipo === 'NOVA_DATA_COMBINADA' ? data : '', resumo: resumo, evidencia: evidencia, confianca: confianca };
}

function producaoParaAssociacaoWhatsapp(p) {
  p = p || {};
  return {
    dealId: texto(p.dealId !== undefined ? p.dealId : p.deal_id),
    os: texto(p.os),
    oficinaId: texto(p.oficinaId !== undefined ? p.oficinaId : p.oficina_id),
    versao: texto(p.versao !== undefined ? p.versao : p.atualizado_em_ploomes),
    ativa: p.em_costura === undefined || semAcento(p.em_costura) === 'SIM'
  };
}

// Etapa pura usada pelo workflow de entrada depois da leitura da planilha e da
// chamada opcional ao modelo. Ela só devolve operações de planilha: nunca envia
// mensagem e nunca responde ao grupo.
function processarEntradaWhatsapp(payload, dados, interpretacao, contexto) {
  dados = dados || {};
  contexto = contexto || {};
  var normalizado = normalizarEventoWhatsapp(payload, dados.oficinas || []);
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
  var mensagemId = texto(gerarId());
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
  if (!precisaInterpretar || interpretacao === undefined || interpretacao === null) {
    return { ok: true, precisaInterpretar: precisaInterpretar, operacoes: operacoes };
  }

  var validada = validarInterpretacaoWhatsapp(interpretacao, msg.quando || agora);
  if (!validada.ok) {
    return { ok: true, precisaInterpretar: true, erroInterpretacao: validada.erro, operacoes: operacoes };
  }
  var prod = producoes.filter(function (p) { return p.dealId === associacao.dealId; })[0] || {};
  operacoes.push({
    aba: 'WHATSAPP_SUGESTOES', operacao: 'append', chave: 'id',
    linha: {
      id: texto(gerarId()), mensagem_id: mensagemId, deal_id: associacao.dealId, os: associacao.os,
      tipo: validada.tipo, valor: validada.valor, resumo: validada.resumo, evidencia: validada.evidencia,
      confianca: validada.confianca, status: 'PENDENTE', criado_em: agora,
      decidido_em: '', decidido_por: '', versao: texto(prod.versao)
    }
  });
  return { ok: true, precisaInterpretar: true, operacoes: operacoes };
}

var CAMPO_DATA_COMBINADA_PLOOMES = 'deal_E53BDEC3-F829-413D-9421-91D5D7411349';

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
  if (texto(corpo.versao) && texto(corpo.versao) !== texto(producao.atualizado_em_ploomes)) {
    return erroAcao(409, 'Esta OS mudou. Atualize a página e tente de novo.');
  }

  var agora = texto(contexto.agora);
  var usuario = texto(contexto.usuario);
  var operacoes = [];
  var ploomes = null;
  var tipo = semAcento(sugestao.tipo);
  var motivo = texto(corpo.motivo).replace(/(\r\n|\n|\r)+/g, ' ');
  if (decisao === 'ACEITAR' && tipo === 'NOVA_DATA_COMBINADA') {
    if (!motivo) return erroAcao(400, 'Informe o motivo da alteração da data combinada.');
    var data = texto(sugestao.valor);
    if (!dataValida(data)) return erroAcao(400, 'Data interpretada inválida.');
    operacoes.push({ aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: { deal_id: dealId, data_combinada: data } });
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
