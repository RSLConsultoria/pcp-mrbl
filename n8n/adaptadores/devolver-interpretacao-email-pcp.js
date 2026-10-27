// ===== adaptador: Devolver Interpretação (subworkflow Intérprete E-mail do PCP) =====
// { emailId, interpretacao }; conteúdo que não é JSON derruba o subworkflow (nova tentativa).
return [{ json: respostaGroqEmailPcp($input.first().json || {}, $('Montar Pedido Groq').first().json.emailId) }];
