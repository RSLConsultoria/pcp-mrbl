// ===== adaptador: Montar Aviso Limite Groq (API, depois do Responder Assistente) =====
// A resposta já foi ao site; aqui só registra que o Groq recusou por limite (GROQ_LIMITE no
// ERROS_APP, no máximo 1 linha por minuto). Sem texto da conversa nem dados de quem perguntou.
// Best-effort: nada aqui pode derrubar o workflow; sem aviso, o ramo para.
try {
  var itemAvisoGroq = $input.first().json || {};
  var linhaAvisoGroq = avisoLimiteGroqAssistente($getWorkflowStaticData('global'), itemAvisoGroq, Date.now());
  if (!linhaAvisoGroq) return [];
  return [{ json: requisicaoErroApp(linhaAvisoGroq, PLANILHA_ID) }];
} catch (e) {
  return [];
}
