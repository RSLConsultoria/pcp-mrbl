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
