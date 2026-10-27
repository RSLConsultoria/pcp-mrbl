// ===== adaptador: Montar Erro E-mails (workflow Ler E-mails do PCP) =====
// Nunca copia o texto do e-mail, o remetente ou a saída do modelo para ERROS_APP.
var linhaErroEmails = linhaErroApp({
  corpo: { tipo: 'EMAILS_PCP_LER' },
  erro: 'Falha técnica ao ler ou gravar os e-mails do PCP.'
});
return [{ json: requisicaoErroApp(linhaErroEmails, PLANILHA_ID) }];
