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
