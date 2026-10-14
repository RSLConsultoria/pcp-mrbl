// ===== src/producao.js =====
// Regras puras da F4: snapshot da producao, prazo, ordenacao, alteracoes e
// modelos de WhatsApp. Sem I/O e sem import/export para rodar nos Code nodes.

var STATUS_ITEM_ABERTO_PRODUCAO = { ABERTO: 1, PARCIAL: 1 };
var VALORES_ATIVO_PRODUCAO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };
var TIPOS_PRODUCAO = ['alterar_producao', 'aceitar_sugestao_whatsapp', 'ignorar_sugestao_whatsapp', 'enviar_whatsapp'];
var MODELOS_WHATSAPP = { COBRANCA_PRAZO: 1, CONFIRMAR_DATA: 1, MATERIAL_ENVIADO: 1 };
var CAMPO_OFICINA_PLOOMES = 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4';

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

function faltasDaCostura(producao, caixas) {
  var os = texto(producao && producao.os);
  var faltas = [];
  (caixas || []).forEach(function (c) {
    if (!c || texto(c.os) !== os || semAcento(c.tipo) !== 'COSTURA') return;
    (c.itens || []).forEach(function (i) {
      if (i && STATUS_ITEM_ABERTO_PRODUCAO[semAcento(i.status)] && (i.resta === null || Number(i.resta) > 0)) faltas.push(i);
    });
  });
  return faltas;
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
  } else if (!texto(corpo.sugestaoId)) {
    return erroAcao(400, 'Informe a sugestão.');
  }
  return { ok: true };
}

function processarEnvioWhatsapp(corpo, linhas, ctx) {
  var producao = (linhas.producao || []).filter(function (p) { return p && texto(p.deal_id) === texto(corpo.dealId); })[0];
  if (!producao) return erroAcao(404, 'OS não encontrada na produção.');
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
  var id = ctx.gerarId();
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
  var linha = { deal_id: atual.dealId };
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
  var r = decidirSugestaoWhatsapp({
    decisao: corpo.tipo === 'aceitar_sugestao_whatsapp' ? 'ACEITAR' : 'IGNORAR',
    versao: corpo.versao, motivo: corpo.motivo
  }, sugestao, producao, mensagem, ctx);
  if (!r.ok || r.idempotente) return r.ok ? { ok: true, idempotente: true, versao: texto(producao.atualizado_em_ploomes), operacoes: [], historicos: [], ploomes: null } : r;
  var acao = corpo.tipo === 'aceitar_sugestao_whatsapp' ? 'WHATSAPP_SUGESTAO_ACEITA' : 'WHATSAPP_SUGESTAO_IGNORADA';
  r.historicos = [historicoProducao(ctx, texto(producao.deal_id), texto(producao.os), acao, r.textoHistorico)];
  r.versao = ctx.agora;
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

function mensagemProducaoBoard(m) {
  return {
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

function mensagensDaProducao(mensagens, dealId) {
  return (mensagens || []).filter(function (m) {
    return m && texto(m.deal_id) === dealId;
  }).sort(function (a, b) {
    return texto(a.quando) < texto(b.quando) ? 1 : texto(a.quando) > texto(b.quando) ? -1 : 0;
  }).slice(0, 30).map(mensagemProducaoBoard);
}

function sugestoesDaProducao(sugestoes, dealId) {
  var lista = (sugestoes || []).filter(function (s) {
    return s && texto(s.deal_id) === dealId;
  }).sort(function (a, b) {
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
  return (mensagens || []).filter(function (m) {
    return m && semAcento(m.direcao) === 'RECEBIDA' && !texto(m.deal_id) && semAcento(m.associacao) === 'SEM_ASSOCIACAO';
  }).sort(function (a, b) {
    return texto(a.quando) < texto(b.quando) ? 1 : texto(a.quando) > texto(b.quando) ? -1 : 0;
  }).slice(0, 30).map(function (m) {
    var base = mensagemProducaoBoard(m);
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
    p.mensagens = mensagensDaProducao(extras.whatsappMensagens, dealId);
    p.sugestoes = sugestoesDaProducao(extras.whatsappSugestoes, dealId);
    p.historico = historicoDoDeal(extras.historico, dealId);
    return p;
  }));
}
