// ===== adaptador: Pre Validar Acao =====
// Sessao e corpo antes de ler a planilha. Saida { ok: true } segue para as
// leituras; { ok: false, status, body } vai direto ao "Responder Pre".
var estado = $getWorkflowStaticData('global');
var entrada = $('Acao').first().json;
var cabecalho = (entrada.headers || {}).authorization;
return [{ json: preValidarAcao(estado, cabecalho, entrada.body || {}, Date.now()) }];
