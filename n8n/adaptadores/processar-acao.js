// ===== adaptador: Processar Acao =====
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
var corpo = entrada.body || {};
var linhas = {
  faltantes: $('Ler FALTANTES Acao').all().map(function (i) { return i.json; }),
  caixasPcp: $('Ler CAIXAS_PCP Acao').all().map(function (i) { return i.json; }),
  ganhas: $('Ler CAIXAS GANHAS Acao').all().map(function (i) { return i.json; })
};
var gerarId = function () { return require('crypto').randomUUID(); };
return [{ json: processarAcao(estado, cabecalho, corpo, linhas, Date.now(), gerarId) }];
