// ===== adaptador: Processar Login =====
// Entrada: linhas da aba USUARIOS ($input). Corpo do POST vem do webhook.
var estado = $getWorkflowStaticData('global');
var corpo = $('Login').first().json.body || {};
var usuarios = $input.all().map(function (i) { return i.json; });
return [{ json: processarLogin(require('crypto'), estado, corpo, usuarios, Date.now()) }];
