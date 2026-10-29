// ===== src/assistente.js =====
// Assistente (F5d): o site roda as ferramentas sobre o board que já carregou; aqui só
// confere a sessão e o limite, monta o pedido ao Groq (prompt + ferramentas + conversa) e
// valida a resposta. Nada é gravado: a conversa vive só no navegador. Nenhuma ferramenta
// envia ou grava; a cobrança só sai do clique em "Confirmar e enviar" no site.

var MODELO_GROQ_ASSISTENTE = 'openai/gpt-oss-120b';
var ASSISTENTE_LIMITE_HORA = 120;
var ASSISTENTE_JANELA_MS = 3600 * 1000;
// Groq gratuito: 8.000 tokens por minuto. A conversa vai enxuta: só as últimas 12 mensagens
// (a pergunta atual sempre inteira) e o que é de perguntas anteriores vai cortado.
var ASSISTENTE_MAX_MENSAGENS = 12;
var ASSISTENTE_MAX_TEXTO = 2000;
var ASSISTENTE_MAX_RESULTADO = 6000;
var ASSISTENTE_MAX_ANTIGO = 800;
var ASSISTENTE_MAX_RESPOSTA = 4000;
var ASSISTENTE_MAX_CHAMADAS = 5;
var ASSISTENTE_MAX_ID = 64;
var ERRO_ASSISTENTE = 'Não consegui responder agora. Tente de novo.';
var ERRO_ASSISTENTE_LIMITE = 'Muitas perguntas seguidas. Espere alguns minutos.';
var ERRO_ASSISTENTE_PEDIDO = 'Pedido inválido.';
// Limite do Groq (tokens por minuto do plano gratuito): o site espera e tenta de novo sozinho.
var ERRO_ASSISTENTE_GROQ_OCUPADO = 'Muita procura agora. Tentando de novo…';
var ASSISTENTE_ESPERA_PADRAO = 5;
var ASSISTENTE_ESPERA_MAX = 20;

function ferramentaAssistente(nome, descricao, propriedades, obrigatorios) {
  var parametros = { type: 'object', properties: propriedades || {} };
  if (obrigatorios && obrigatorios.length) parametros.required = obrigatorios;
  return { type: 'function', function: { name: nome, description: descricao, parameters: parametros } };
}

// Espelhadas em web/src/regras/assistente.ts (o teste do site confere os nomes).
// Descrições curtas: vão em todo pedido ao Groq.
var FERRAMENTAS_ASSISTENTE = [
  ferramentaAssistente('buscar_os', 'Busca OS por número, peça, cliente ou oficina.',
    { texto: { type: 'string', description: 'OS, peça, cliente ou oficina.' } }, ['texto']),
  ferramentaAssistente('listar_atrasadas', 'OS na Costura com prazo vencido ou vencendo em até dias_ate_vencer dias, a mais atrasada primeiro.',
    { oficina: { type: 'string', description: 'Filtro opcional.' },
      dias_ate_vencer: { type: 'integer', description: 'Padrão 3.' } }),
  ferramentaAssistente('faltas_da_os', 'Itens em falta em aberto da OS: quanto falta, previsão e pedido.',
    { os: { type: 'string', description: 'Número da OS.' } }, ['os']),
  ferramentaAssistente('caixas_paradas', 'Caixas com falta em aberto, que não saíram, paradas há dias ou mais.',
    { dias: { type: 'integer', description: 'Padrão 7.' } }),
  ferramentaAssistente('pedidos_abertos', 'Pedidos de compra não concluídos: etapa, fornecedor e previsão.',
    { os: { type: 'string', description: 'Filtro opcional.' },
      fornecedor: { type: 'string', description: 'Fornecedor ou cliente (opcional).' } }),
  ferramentaAssistente('sem_resposta', 'OS com cobrança no WhatsApp sem resposta da oficina há mais de 24 h.', {}),
  ferramentaAssistente('abrir_tela', 'Abre uma tela do app. Visão da peça: tela peca com a OS.',
    { tela: { type: 'string', enum: ['no-ploomes', 'saidas', 'solicitacoes', 'producao', 'peca'] },
      os: { type: 'string', description: 'Só para peca.' } }, ['tela']),
  ferramentaAssistente('preparar_cobranca', 'Monta um cartão de cobrança de prazo no WhatsApp para a pessoa conferir. Não envia nada: só o clique em Confirmar e enviar envia.',
    { alvo: { type: 'string', enum: ['atrasadas', 'todas', 'oficinas'], description: 'atrasadas = vencidas ou vencendo em 3 dias; todas = todas na Costura; oficinas = as das oficinas informadas.' },
      oficinas: { type: 'array', items: { type: 'string' }, description: 'Obrigatório no alvo oficinas; nos outros, filtra.' } }, ['alvo'])
];

var NOMES_FERRAMENTAS_ASSISTENTE = FERRAMENTAS_ASSISTENTE.map(function (f) { return f.function.name; });

var INSTRUCOES_ASSISTENTE = [
  'Você é o assistente do PCP da MRBL, uma confecção. Responda em português do Brasil, em texto simples (sem Markdown, negrito ou tabelas) e curto.',
  'Use só dados das ferramentas; se não achar, diga. Nunca invente OS, datas, quantidades ou nomes.',
  'Cite as OS pelo número (ex.: "OS 12345").',
  'Listas: no máximo 10 itens; se houver mais, diga o total e ofereça mostrar o resto. Escreva cada item uma vez: nunca repita a lista nem trechos da resposta, e não termine com "(continua)".',
  'Para cobrar oficinas, use preparar_cobranca e avise que nada é enviado até a pessoa clicar em Confirmar e enviar no cartão.',
  'Você não grava baixa, previsão, observação nem pedido: abra a tela certa com abrir_tela.',
  'No máximo 5 chamadas de ferramenta por pergunta.'
].join(' ');

function cortarTextoAssistente(v, max) {
  var t = typeof v === 'string' ? v : '';
  return t.length > max ? t.slice(0, max) : t;
}

function objetoSimples(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function idChamadaValido(id) {
  return typeof id === 'string' && id.trim() !== '' && id.length <= ASSISTENTE_MAX_ID;
}

// Mensagem do site -> mensagem do Groq; null quando não serve. antiga = de uma pergunta
// anterior: resultado de ferramenta e resposta vão cortados bem mais curto.
function mensagemGroqAssistente(m, antiga) {
  if (!objetoSimples(m)) return null;
  if (m.papel === 'usuario') {
    var tu = cortarTextoAssistente(m.texto, ASSISTENTE_MAX_TEXTO).trim();
    return tu ? { role: 'user', content: tu } : null;
  }
  if (m.papel === 'assistente') {
    if (Array.isArray(m.chamadas)) {
      if (!m.chamadas.length || m.chamadas.length > ASSISTENTE_MAX_CHAMADAS) return null;
      var chamadas = [];
      for (var i = 0; i < m.chamadas.length; i++) {
        var c = m.chamadas[i];
        if (!objetoSimples(c) || !idChamadaValido(c.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(c.nome) < 0) return null;
        var args = c.argumentos === undefined ? {} : c.argumentos;
        if (!objetoSimples(args)) return null;
        chamadas.push({ id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(args) } });
      }
      return { role: 'assistant', content: '', tool_calls: chamadas };
    }
    var ta = cortarTextoAssistente(m.texto, antiga ? ASSISTENTE_MAX_ANTIGO : ASSISTENTE_MAX_TEXTO).trim();
    return ta ? { role: 'assistant', content: ta } : null;
  }
  if (m.papel === 'ferramenta') {
    if (!idChamadaValido(m.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(m.nome) < 0) return null;
    if (m.resultado === undefined || m.resultado === null) return null;
    var r = typeof m.resultado === 'string' ? m.resultado : JSON.stringify(m.resultado);
    return { role: 'tool', tool_call_id: m.id, name: m.nome, content: cortarTextoAssistente(r, antiga ? ASSISTENTE_MAX_ANTIGO : ASSISTENTE_MAX_RESULTADO) };
  }
  return null;
}

// Conversa inteira -> mensagens do Groq; null se alguma não serve. A pergunta atual (da
// última do usuário em diante) vai inteira; antes dela, só o que couber nas 12, começando
// numa pergunta (a resposta de uma ferramenta sem a chamada derruba o pedido).
function mensagensGroqAssistente(mensagens) {
  if (!Array.isArray(mensagens) || !mensagens.length) return null;
  var atual = -1;
  for (var k = mensagens.length - 1; k >= 0; k--) {
    if (objetoSimples(mensagens[k]) && mensagens[k].papel === 'usuario') { atual = k; break; }
  }
  if (atual < 0) return null;
  var lista = [];
  for (var i = 0; i < mensagens.length; i++) {
    var g = mensagemGroqAssistente(mensagens[i], i < atual);
    if (!g) return null;
    lista.push(g);
  }
  var daAtual = lista.slice(atual);
  var vagas = ASSISTENTE_MAX_MENSAGENS - daAtual.length;
  var anteriores = vagas > 0 ? lista.slice(0, atual).slice(-vagas) : [];
  while (anteriores.length && anteriores[0].role !== 'user') anteriores.shift();
  return anteriores.concat(daAtual);
}

function pedidoGroqAssistente(mensagens, hoje) {
  return {
    model: MODELO_GROQ_ASSISTENTE,
    temperature: 0.2,
    reasoning_effort: 'low',
    max_completion_tokens: 1600,
    tool_choice: 'auto',
    tools: FERRAMENTAS_ASSISTENTE,
    messages: [{ role: 'system', content: INSTRUCOES_ASSISTENTE + ' Hoje é ' + hoje + ' (São Paulo).' }]
      .concat(mensagensGroqAssistente(mensagens) || [])
  };
}

// Dia de São Paulo (UTC-3, sem horário de verão desde 2019).
function hojeSaoPauloAssistente(agora) {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Janela deslizante de 1 h por e-mail, no static data do workflow. true = pode.
function contarPedidoAssistente(estado, email, agora) {
  if (!estado.assistente) estado.assistente = Object.create(null);
  Object.keys(estado.assistente).forEach(function (e) {
    var ainda = (estado.assistente[e] || []).filter(function (ts) { return agora - ts < ASSISTENTE_JANELA_MS; });
    if (ainda.length) estado.assistente[e] = ainda;
    else delete estado.assistente[e];
  });
  var lista = proprio(estado.assistente, email) || [];
  if (lista.length >= ASSISTENTE_LIMITE_HORA) return false;
  estado.assistente[email] = lista.concat([agora]);
  return true;
}

// POST /pcp-assistente. Pronto = vai direto ao Responder Assistente.
function validarPedidoAssistente(estado, cabecalho, corpo, agora) {
  corpo = objetoSimples(corpo) ? corpo : {};
  var cab = texto(cabecalho) || (typeof corpo.token === 'string' && corpo.token ? 'Bearer ' + corpo.token : '');
  var sessao = sessaoDoCabecalho(estado, cab, agora);
  if (!sessao) return { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } };
  var lista = Array.isArray(corpo.mensagens) ? corpo.mensagens : null;
  var groq = lista && mensagensGroqAssistente(lista);
  var ultima = lista && lista[lista.length - 1];
  if (!groq || !ultima || ultima.papel === 'assistente') return { pronto: true, status: 400, body: { erro: ERRO_ASSISTENTE_PEDIDO } };
  if (!contarPedidoAssistente(estado, sessao.email, agora)) return { pronto: true, status: 429, body: { erro: ERRO_ASSISTENTE_LIMITE } };
  var hoje = /^\d{4}-\d{2}-\d{2}$/.test(texto(corpo.hoje)) && dataValida(texto(corpo.hoje)) ? texto(corpo.hoje) : hojeSaoPauloAssistente(agora);
  return { pronto: false, corpo: pedidoGroqAssistente(lista, hoje) };
}

function erroGroqAssistente() {
  return { status: 502, body: { erro: ERRO_ASSISTENTE } };
}

// Segundos do header retry-after (qualquer caixa), arredondados para cima, de 1 a 20.
function esperaGroqAssistente(headers) {
  var bruto;
  if (objetoSimples(headers)) {
    Object.keys(headers).forEach(function (k) { if (k.toLowerCase() === 'retry-after') bruto = headers[k]; });
  }
  var n = Number(bruto);
  if (bruto === undefined || bruto === null || bruto === '' || !isFinite(n)) return ASSISTENTE_ESPERA_PADRAO;
  return Math.min(ASSISTENTE_ESPERA_MAX, Math.max(1, Math.ceil(n)));
}

// Resposta do HTTP Request (resposta completa, sem erro) ou o corpo direto ->
// { status: 200, body: { texto } | { chamadas } }, 429 do Groq com o tempo para tentar de
// novo (diferente do 429 do limite por usuário, que não traz tentarEmSegundos) ou 502 amigável.
// Recusa por limite do Groq (429 ou rate_limit_exceeded) leva limiteGroq: true, fora do corpo
// que vai ao site, para o aviso GROQ_LIMITE no ERROS_APP depois da resposta.
function respostaGroqAssistente(resposta) {
  var r = respostaGroqAssistenteSemAviso(resposta);
  if (limiteGroqNaResposta(resposta)) r.limiteGroq = true;
  return r;
}

// Aviso GROQ_LIMITE do Assistente (item que foi ao Responder Assistente): só na recusa por
// limite do Groq e no máximo 1 por minuto. null = não grava nada.
function avisoLimiteGroqAssistente(estado, item, agora) {
  if (!objetoSimples(item) || item.limiteGroq !== true) return null;
  if (!podeAvisarLimiteGroq(estado, 'assistente', agora)) return null;
  return linhaLimiteGroq('assistente', MODELO_GROQ_ASSISTENTE, agora, 1);
}

function respostaGroqAssistenteSemAviso(resposta) {
  if (!objetoSimples(resposta)) return erroGroqAssistente();
  var corpo = resposta;
  if (Number(resposta.statusCode) === 429) {
    return { status: 429, body: { erro: ERRO_ASSISTENTE_GROQ_OCUPADO, tentarEmSegundos: esperaGroqAssistente(resposta.headers) } };
  }
  if (resposta.statusCode !== undefined || resposta.body !== undefined) {
    if (Number(resposta.statusCode) !== 200) return erroGroqAssistente();
    corpo = resposta.body;
  }
  var msg = objetoSimples(corpo) && Array.isArray(corpo.choices) && corpo.choices[0] && corpo.choices[0].message;
  if (!objetoSimples(msg)) return erroGroqAssistente();
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    var chamadas = [];
    var calls = msg.tool_calls.slice(0, ASSISTENTE_MAX_CHAMADAS);
    for (var i = 0; i < calls.length; i++) {
      var c = calls[i] || {};
      var f = c['function'] || {};
      if (!idChamadaValido(c.id) || NOMES_FERRAMENTAS_ASSISTENTE.indexOf(f.name) < 0) return erroGroqAssistente();
      var bruto = typeof f.arguments === 'string' ? f.arguments.trim() : f.arguments;
      var args;
      if (bruto === '' || bruto === undefined || bruto === null) args = {};
      else if (typeof bruto === 'string') {
        try { args = JSON.parse(bruto); } catch (e) { return erroGroqAssistente(); }
      } else args = bruto;
      if (!objetoSimples(args)) return erroGroqAssistente();
      chamadas.push({ id: c.id, nome: f.name, argumentos: args });
    }
    return { status: 200, body: { chamadas: chamadas } };
  }
  var t = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (!t) return erroGroqAssistente();
  return { status: 200, body: { texto: cortarTextoAssistente(t, ASSISTENTE_MAX_RESPOSTA) } };
}
