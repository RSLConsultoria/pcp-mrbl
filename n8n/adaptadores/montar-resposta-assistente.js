// ===== adaptador: Montar Resposta do Assistente =====
// Resposta completa do Groq (ou o erro do HTTP Request) -> { status, body } para o site.
return [{ json: respostaGroqAssistente($input.first().json) }];
