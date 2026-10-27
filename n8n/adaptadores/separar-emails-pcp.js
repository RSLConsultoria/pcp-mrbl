// ===== adaptador: Separar E-mails (workflow Ler E-mails do PCP) =====
// Resposta do users.messages.list -> um item por id (o Ler E-mail busca cada um).
// Sem e-mail na busca: um item só com semEmails, e o Tem E-mails? segue direto para a
// planilha (as linhas ERRO ainda voltam ao intérprete).
var idsEmails = idsListaGmailPcp($input.first().json);
if (!idsEmails.length) return [{ json: { semEmails: true } }];
return idsEmails.map(function (id) { return { json: { id: id } }; });
