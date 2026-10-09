// ===== adaptador: Montar Erro =====
// Saida de erro do Gravar Lote / Gravar Anexo (requisicao que falhou mesmo depois
// das tentativas). As execucoes com erro nao sao salvas (o corpo do login traz a
// senha), entao a falha fica registrada numa linha da aba ERROS_APP (append sem
// retry, pelo Gravar Erro) e o site recebe 500 com o aviso para chamar o PCP:
// parte da acao pode ter sido gravada. Tudo aqui e best-effort: nada pode
// derrubar o node, senao o webhook fica sem resposta.
function tentar(f) {
  try { return f(); } catch (e) { return undefined; }
}
var estado = tentar(function () { return $getWorkflowStaticData('global'); }) || {};
limparCacheBoard(estado);  // o que ja foi gravado aparece na proxima leitura
var entrada = tentar(function () { return $('Acao').first().json; }) || {};
var proc = tentar(function () { return $('Processar Acao').first().json; }) || {};
var erroItem = tentar(function () { return $input.first().json; }) || {};
// o item do lote (url/passo) vem do Loop Escritas; a saida de erro do HTTP traz so o erro
var lote = tentar(function () { return $('Loop Escritas').first().json; }) || {};
if (!lote.url && erroItem.url) lote = erroItem;
var linha = linhaErroApp({
  agora: Date.now(),
  sessao: tentar(function () { return sessaoDoCabecalho(estado, (entrada.headers || {}).authorization, Date.now()); }),
  corpo: entrada.body,
  historicos: proc.historicos,
  lote: lote,
  erro: erroItem.error !== undefined ? erroItem.error : erroItem
});
var req = requisicaoErroApp(linha, PLANILHA_ID);
return [{ json: { method: req.method, url: req.url, body: req.body, resposta: { erro: ERRO_GRAVACAO } } }];
