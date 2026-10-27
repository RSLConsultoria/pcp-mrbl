// ===== adaptador: Montar Pedido Groq (subworkflow Intérprete E-mail do PCP) =====
// Entrada: o contexto montado pelo Ler E-mails (texto limpo, assunto, OS, itens em aberto).
var entradaEmail = $input.first().json || {};
return [{ json: { emailId: texto(entradaEmail.emailId), corpo: pedidoGroqEmailPcp(entradaEmail) } }];
