// ===== src/acoes.js =====
// Regras das acoes de escrita (baixa, previsao, observacao, responsavel). Funcoes puras; sem import/export. Depende de util.js.

var TIPOS_ACAO = ['baixa', 'previsao_item', 'obs_item', 'responsavel', 'previsao_caixa', 'obs_caixa'];
var TIPOS_ITEM = ['baixa', 'previsao_item', 'obs_item'];

function linhaDeGravacao(gravacao) {
  var linha = Object.assign({}, gravacao.campos);
  var ch = gravacao.chave;
  if (ch && linha[ch.coluna] === undefined) linha[ch.coluna] = ch.valor;
  return linha;
}

function erroAcao(status, erro) {
  return { ok: false, status: status, erro: erro };
}

function dataValida(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  var a = Number(m[1]);
  var mes = Number(m[2]);
  var dia = Number(m[3]);
  var d = new Date(Date.UTC(a, mes - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function validarAcao(corpo, perfil) {
  if (!corpo || typeof corpo !== 'object') return erroAcao(400, 'Corpo inválido.');
  var tipo = corpo.tipo;
  if (tipo === 'mover') return erroAcao(400, 'Mover caixa foi desativado: as etapas vêm do Ploomes.');
  if (TIPOS_ACAO.indexOf(tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var dealId = texto(corpo.dealId);
  if (dealId === '') return erroAcao(400, 'Caixa não informada.');
  var itemId = texto(corpo.itemId);
  if (TIPOS_ITEM.indexOf(tipo) >= 0 && itemId === '') return erroAcao(400, 'Item não informado.');

  var valor = corpo.valor;
  if (tipo === 'baixa') {
    var n = typeof valor === 'number' ? valor : numero(valor);
    if (n !== null && isFinite(n)) n = arredondar(n);
    if (n === null || !isFinite(n) || n <= 0) return erroAcao(400, 'Informe uma quantidade maior que zero');
    valor = n;
  } else if (tipo === 'previsao_item' || tipo === 'previsao_caixa') {
    valor = valor === null || valor === undefined ? '' : texto(valor);
    if (valor !== '' && !dataValida(valor)) return erroAcao(400, 'Data inválida.');
  } else if (tipo === 'obs_item' || tipo === 'obs_caixa') {
    if (typeof valor !== 'string') return erroAcao(400, 'Texto inválido.');
    valor = valor.trim().replace(/(\r\n|\n|\r)+/g, ' ');
    if (valor.length > 500) return erroAcao(400, 'Texto com no máximo 500 caracteres.');
  } else if (tipo === 'responsavel') {
    if (typeof valor !== 'string') return erroAcao(400, 'Responsável inválido.');
    valor = valor.trim();
    if (valor.length > 100) return erroAcao(400, 'Nome do responsável muito longo.');
  }

  var acao = { tipo: tipo, dealId: dealId, valor: valor, versao: texto(corpo.versao) };
  if (TIPOS_ITEM.indexOf(tipo) >= 0) acao.itemId = itemId;
  return { ok: true, acao: acao };
}

// 'aaaa-mm-dd' -> 'dd/mm'
function dataCurta(iso) {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

function arredondar(n) {
  return Math.round(n * 1000) / 1000;
}

function formatarQtd(n) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function textoDaAcao(acao, ctx) {
  var u = ctx.usuario;
  var item = ctx.nomeItem;
  switch (acao.tipo) {
    case 'baixa':
      return u + ' deu baixa: ' + formatarQtd(acao.valor) + ' ' + ctx.un + ' de ' + item +
        ' (resta ' + formatarQtd(ctx.resta) + ' ' + ctx.un + ')';
    case 'previsao_item':
      return acao.valor === ''
        ? u + ' removeu a previsão de ' + item
        : u + ' definiu previsão de ' + item + ': ' + dataCurta(acao.valor);
    case 'obs_item':
      return u + ' anotou em ' + item + ': "' + acao.valor + '"';
    case 'responsavel':
      return acao.valor === ''
        ? u + ' removeu o responsável'
        : u + ' definiu responsável: ' + acao.valor;
    case 'previsao_caixa':
      return acao.valor === ''
        ? u + ' removeu a previsão geral da caixa'
        : u + ' definiu previsão geral da caixa: ' + dataCurta(acao.valor);
    case 'obs_caixa':
      return u + ' anotou na caixa: "' + acao.valor + '"';
  }
  return '';
}

function aplicarAcao(acao, alvo, contexto) {
  var ehItem = TIPOS_ITEM.indexOf(acao.tipo) >= 0;
  if (ehItem && !alvo) return erroAcao(404, 'Item não encontrado.');

  var versaoAtual = alvo ? texto(ehItem ? alvo.atualizado_em_app : alvo.atualizado_em) : '';
  if (texto(acao.versao) !== versaoAtual) {
    return erroAcao(409, 'Alguém alterou esta caixa agora há pouco.');
  }

  var agora = contexto.agora;
  var campos = {};
  var ctxTexto = {
    usuario: contexto.usuario, nomeItem: contexto.nomeItem, un: contexto.un
  };

  if (acao.tipo === 'baixa') {
    var falta = numero(alvo.qtd_falta);
    var baixada = numero(alvo.qtd_baixada);
    if (baixada !== null && isNaN(baixada)) return erroAcao(400, 'Baixa registrada ilegível na planilha.');
    if (baixada === null) baixada = 0;
    if (falta === null || !isFinite(falta)) {
      return erroAcao(400, 'Item sem quantidade faltante registrada.');
    }
    var resta = arredondar(Math.max(0, falta - baixada));
    if (acao.valor > resta) return erroAcao(400, 'Falta só ' + formatarQtd(resta) + ' ' + contexto.un);
    ctxTexto.resta = arredondar(resta - acao.valor);
    campos.qtd_baixada = arredondar(baixada + acao.valor);
    campos.atualizado_em_app = agora;
  } else if (acao.tipo === 'previsao_item') {
    campos.previsao = acao.valor;
    campos.atualizado_em_app = agora;
  } else if (acao.tipo === 'obs_item') {
    campos.observacao_pcp = acao.valor;
    campos.atualizado_em_app = agora;
  } else {
    campos.deal_id = acao.dealId;
    campos.os = contexto.os;
    if (!alvo && acao.tipo !== 'responsavel') campos.responsavel = texto(contexto.responsavelAtual);
    if (acao.tipo === 'responsavel') campos.responsavel = acao.valor;
    else if (acao.tipo === 'previsao_caixa') campos.previsao = acao.valor;
    else if (acao.tipo === 'obs_caixa') campos.observacao = acao.valor;
    campos.atualizado_em = agora;
  }

  var gravacao = ehItem
    ? { aba: 'FALTANTES', chave: { coluna: 'id', valor: acao.itemId }, campos: campos }
    : { aba: 'CAIXAS_PCP', chave: { coluna: 'deal_id', valor: acao.dealId }, campos: campos };

  var historico = {
    id: contexto.gerarId(),
    quando: agora,
    usuario: contexto.usuario,
    email: contexto.email,
    deal_id: acao.dealId,
    os: contexto.os,
    item_id: ehItem ? acao.itemId : '',
    acao: acao.tipo,
    texto: textoDaAcao(acao, ctxTexto),
    ploomes_status: 'PENDENTE',
    ploomes_id: '',
    tentativas: 0,
    erro: ''
  };

  // F3: a mesma gravacao como lista de operacoes (FALTANTES = update por id;
  // CAIXAS_PCP = appendOrUpdate por deal_id). gravacao/historico ficam por
  // compatibilidade com os adaptadores da F2.
  var operacao = {
    aba: gravacao.aba,
    operacao: ehItem ? 'update' : 'appendOrUpdate',
    chave: gravacao.chave.coluna,
    linha: linhaDeGravacao(gravacao)
  };
  return { ok: true, gravacao: gravacao, historico: historico, operacoes: [operacao], historicos: [historico] };
}
