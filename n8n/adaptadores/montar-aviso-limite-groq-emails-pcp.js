// ===== adaptador: Montar Aviso Limite Groq (workflow Ler E-mails do PCP) =====
// Conta as recusas por limite do Groq na rodada (saídas do Interpretar E-mail) e grava uma
// linha resumida GROQ_LIMITE no ERROS_APP. Sem texto do e-mail nem remetente.
// Best-effort: nada aqui pode derrubar o workflow; sem recusa, o ramo para.
try {
  var respostasAvisoGroq = $input.all().map(function (i) { return i.json; });
  var linhaAvisoGroqEmails = avisoLimiteGroqEmailsPcp(respostasAvisoGroq, Date.now());
  if (!linhaAvisoGroqEmails) return [];
  return [{ json: requisicaoErroApp(linhaAvisoGroqEmails, PLANILHA_ID) }];
} catch (e) {
  return [];
}
