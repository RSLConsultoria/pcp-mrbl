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
  'NAO_OS quando a mensagem não fala de nenhuma peça (saudação, ok, figurinha). Devolva só o objeto.';

var SCHEMA_ASSOCIADOR_WHATSAPP = {
  resultado: ['OS', 'DUVIDA', 'NAO_OS'],
  os: 'número da OS escolhida (só em OS)',
  candidatos: 'lista de 2 ou 3 números de OS (só em DUVIDA)',
  confianca: 'número entre 0 e 1',
  motivo: 'frase curta em português'
};

function ultimaMensagemPcpAssociador(mensagens, dealId) {
  var enviadas = (mensagens || []).filter(function (m) {
    return m && texto(m.deal_id) === dealId && semAcento(m.direcao) === 'ENVIADA' && mensagemVistaPelaOficina(m);
  }).sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); });
  var ultima = enviadas[enviadas.length - 1];
  return ultima ? { quando: texto(ultima.quando), texto: cortarTextoInterprete(ultima.texto) } : null;
}

function candidatosAssociacaoWhatsapp(producoes, oficinaId, mensagens, hojeISO) {
  return (producoes || []).filter(function (p) {
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
  if (resultado === 'NAO_OS') return { ok: true, resultado: 'NAO_OS', dealId: '', os: '', candidatos: [], confianca: confianca, motivo: motivo };
  if (resultado === 'DUVIDA') return duvida() || falha('Candidatos inválidos do associador.');
  var os = texto(valor.os);
  if (!porOs[os]) return falha('OS fora da lista de candidatos.');
  if (confianca >= LIMITE_CONFIANCA_ASSOCIADOR) {
    return { ok: true, resultado: 'OS', dealId: porOs[os].dealId, os: os, candidatos: [], confianca: confianca, motivo: motivo };
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

  var daPergunta = entrada.pergunta ? texto(entrada.pergunta.pergunta_candidatos).split(';') : [];
  if (entrada.pergunta && v.resultado === 'OS' && daPergunta.indexOf(v.dealId) >= 0) {
    var cand = porDeal[v.dealId];
    var original = entrada.original || {};
    return {
      ok: true, resultado: 'OS',
      operacoes: [
        opMensagemWhatsapp(linhaLigadaIA(mensagem, cand, v, agora, false)),
        opMensagemWhatsapp(linhaLigadaIA(original, cand, v, agora, true)),
        opMensagemWhatsapp({ id: texto(entrada.pergunta.id), deal_id: cand.dealId, os: cand.os, pergunta_fechada_em: agora })
      ],
      interpretar: { mensagemId: texto(original.id), dealId: cand.dealId }
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
  if (v.resultado === 'DUVIDA' && !entrada.pergunta) {
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
    operacoes.push(opMensagemWhatsapp({ id: texto(m.id), pergunta_fechada_em: texto(agora) }));
    var original = porId[texto(m.pergunta_mensagem_id)];
    if (original && semAcento(original.associacao) === 'IA_DUVIDA') {
      operacoes.push(opMensagemWhatsapp({ id: texto(original.id), associacao: 'SEM_ASSOCIACAO' }));
    }
  });
  return { operacoes: operacoes };
}
