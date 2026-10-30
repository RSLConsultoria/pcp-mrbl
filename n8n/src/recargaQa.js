// ===== src/recargaQa.js =====
// "Utilitário - Recarregar QA (manual)" (spec 2026-10-30): copia as abas do app da
// planilha original para a planilha QA. A original só é lida (o batchGet fica no node
// "Ler Original" do workflow); aqui só se monta a limpeza e a gravação, sempre em
// PLANILHA_ID, que no modo QA é a planilha QA. Fora do modo QA, recusa.

var ABAS_RECARGA_QA = ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'USUARIOS', 'HISTORICO_APP', 'PEDIDOS',
  'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS', 'ERROS_APP', 'PRODUCAO', 'OFICINAS',
  'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS', 'EMAILS_PCP'];
// Aba de controle da QA: linha 1 = cabeçalho (copiado_em, abas), linha 2 = data ISO da
// carga e número de abas copiadas. Lida pela API homolog (faixa do site). Também é
// limpa antes da gravação: se a gravação falhar, a faixa não mostra uma carga velha.
var ABA_QA_CONTROLE = 'QA_CONTROLE';
var RANGE_QA_CONTROLE = rangeDaAba(ABA_QA_CONTROLE, 'A1:B2');
// Pendência do envio ao Ploomes copiada da original: na QA não sobe de novo.
var STATUS_COPIADO_QA = 'COPIADO_QA';
var ERRO_WHATSAPP_COPIADO_QA = 'Copiada da original no QA: não reenviada.';

// O que vem pendente da original não é processado de novo pelos workflows de
// homologação: envio ao Ploomes, fila e intérprete do WhatsApp, intérprete de e-mail.
function regrasRecargaQa() {
  return {
    HISTORICO_APP: [{ coluna: 'ploomes_status', de: ['PENDENTE'], para: STATUS_COPIADO_QA }],
    WHATSAPP_MENSAGENS: [
      { coluna: 'status_envio', de: ['PENDENTE', 'ENVIANDO'], para: 'ERRO', junto: { erro: ERRO_WHATSAPP_COPIADO_QA } },
      { coluna: 'interpretacao_status', de: ['PENDENTE'], para: 'ERRO' }
    ],
    EMAILS_PCP: [{ coluna: 'status', de: ['ERRO'], para: 'ERRO', junto: { tentativas: MAX_TENTATIVAS_EMAIL_PCP } }]
  };
}

// Nome da aba no range devolvido pela API ("'CAIXAS GANHAS'!A1:Z9" ou "USUARIOS!A1:C3").
function abaDoRangeQa(range) {
  var r = texto(range);
  var i = r.lastIndexOf('!');
  var nome = i >= 0 ? r.slice(0, i) : r;
  if (nome.charAt(0) === "'" && nome.charAt(nome.length - 1) === "'") nome = nome.slice(1, -1).replace(/''/g, "'");
  return nome;
}

function conferirRecargaQa(resposta) {
  if (!MODO_QA) throw new Error('A recarga do QA só roda no modo QA.');
  var destino = texto(PLANILHA_ID);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(destino) || destino.indexOf('CONFIGURAR_') === 0) {
    throw new Error('Planilha QA não configurada (PLANILHA_QA_ID).');
  }
  if (resposta && texto(resposta.spreadsheetId) === destino) {
    throw new Error('A planilha lida é a QA: a recarga só copia da original para a QA.');
  }
  var vr = resposta && resposta.valueRanges;
  if (!vr || vr.length !== ABAS_RECARGA_QA.length) {
    throw new Error('Leitura da original: esperava ' + ABAS_RECARGA_QA.length + ' abas, veio ' + (vr ? vr.length : 0));
  }
  ABAS_RECARGA_QA.forEach(function (aba, i) {
    var lida = abaDoRangeQa(vr[i] && vr[i].range);
    if (lida !== aba) throw new Error('Leitura da original fora de ordem: esperava ' + aba + ', veio ' + lida);
  });
  return vr;
}

function requisicaoLimpezaQa(resposta) {
  conferirRecargaQa(resposta);
  return {
    method: 'POST',
    url: URL_PLANILHAS + PLANILHA_ID + '/values:batchClear',
    body: { ranges: ABAS_RECARGA_QA.map(function (aba) { return rangeDaAba(aba); }).concat([RANGE_QA_CONTROLE]) }
  };
}

// Cópia nova das linhas (a resposta não muda), com as regras de regrasRecargaQa.
function valoresRecargaQa(aba, values) {
  var linhas = (values || []).map(function (l) { return (l || []).slice(); });
  var regras = regrasRecargaQa()[aba];
  if (!regras || !linhas.length) return linhas;
  var cab = linhas[0].map(function (c) { return texto(c); });
  regras.forEach(function (r) {
    var col = cab.indexOf(r.coluna);
    if (col < 0) return;
    for (var i = 1; i < linhas.length; i++) {
      if (r.de.indexOf(texto(linhas[i][col])) < 0) continue;
      linhas[i][col] = r.para;
      Object.keys(r.junto || {}).forEach(function (c) {
        var j = cab.indexOf(c);
        if (j < 0) return;
        while (linhas[i].length <= j) linhas[i].push('');
        linhas[i][j] = r.junto[c];
      });
    }
  });
  return linhas;
}

function requisicaoRecargaQa(resposta, agora) {
  var vr = conferirRecargaQa(resposta);
  var data = [];
  ABAS_RECARGA_QA.forEach(function (aba, i) {
    var values = valoresRecargaQa(aba, vr[i].values);
    if (values.length) data.push({ range: rangeDaAba(aba, 'A1'), values: values });
  });
  data.push({ range: RANGE_QA_CONTROLE, values: [['copiado_em', 'abas'], [new Date(agora).toISOString(), ABAS_RECARGA_QA.length]] });
  return {
    method: 'POST',
    url: URL_PLANILHAS + PLANILHA_ID + '/values:batchUpdate',
    body: { valueInputOption: 'RAW', data: data }
  };
}
