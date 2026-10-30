// ===== src/recargaQa.js =====
// "Utilitário - Recarregar QA (manual)" (spec 2026-10-30): copia as abas do app da
// planilha original para a planilha QA. A original só é lida (o batchGet fica no node
// "Ler Original" do workflow); aqui só se monta a limpeza e a gravação, sempre em
// PLANILHA_ID, que no modo QA é a planilha QA. Fora do modo QA, recusa.

var ABAS_RECARGA_QA = ['FALTANTES', 'CAIXAS GANHAS', 'CAIXAS_PCP', 'USUARIOS', 'HISTORICO_APP', 'PEDIDOS',
  'PEDIDOS_ITENS', 'ETAPAS_PEDIDO', 'FORNECEDORES', 'RESPONSAVEIS', 'ERROS_APP', 'PRODUCAO', 'OFICINAS',
  'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS', 'EMAILS_PCP'];
// Aba de controle da QA: linha 1 = cabeçalho (copiado_em, abas), linha 2 = data ISO da
// carga e número de abas copiadas. Lida pela API homolog (faixa do site).
var ABA_QA_CONTROLE = 'QA_CONTROLE';
var RANGE_QA_CONTROLE = rangeDaAba(ABA_QA_CONTROLE, 'A1:B2');
// Pendência do envio ao Ploomes copiada da original: na QA não sobe de novo.
var STATUS_COPIADO_QA = 'COPIADO_QA';

function conferirRecargaQa(resposta) {
  if (!MODO_QA) throw new Error('A recarga do QA só roda no modo QA.');
  var destino = texto(PLANILHA_ID);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(destino) || destino.indexOf('CONFIGURAR_') === 0) {
    throw new Error('Planilha QA não configurada (PLANILHA_QA_ID).');
  }
  if (resposta && texto(resposta.spreadsheetId) === destino) {
    throw new Error('A planilha lida é a QA: a recarga nunca grava na original nem copia a QA nela mesma.');
  }
  var vr = resposta && resposta.valueRanges;
  if (!vr || vr.length !== ABAS_RECARGA_QA.length) {
    throw new Error('Leitura da original: esperava ' + ABAS_RECARGA_QA.length + ' abas, veio ' + (vr ? vr.length : 0));
  }
  return vr;
}

function requisicaoLimpezaQa(resposta) {
  conferirRecargaQa(resposta);
  return {
    method: 'POST',
    url: URL_PLANILHAS + PLANILHA_ID + '/values:batchClear',
    body: { ranges: ABAS_RECARGA_QA.map(function (aba) { return rangeDaAba(aba); }) }
  };
}

// HISTORICO_APP: ploomes_status PENDENTE vira COPIADO_QA (cópia nova, sem mexer na resposta).
function valoresRecargaQa(aba, values) {
  var linhas = (values || []).map(function (l) { return (l || []).slice(); });
  if (aba !== 'HISTORICO_APP' || !linhas.length) return linhas;
  var col = linhas[0].map(function (c) { return texto(c); }).indexOf('ploomes_status');
  if (col < 0) return linhas;
  for (var i = 1; i < linhas.length; i++) {
    if (texto(linhas[i][col]) === 'PENDENTE') linhas[i][col] = STATUS_COPIADO_QA;
  }
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
