// ===== adaptador: Finalizar E-mails (workflow Ler E-mails do PCP) =====
// Valida cada interpretação (validarInterpretacaoEmailPcp) e monta um batchUpdate só com as
// linhas que viram PENDENTE. Falha do intérprete: a linha fica ERRO para a próxima rodada.
var pedidosEmails = $('Montar Pedidos de Interpretação').all().map(function (i) { return i.json; });
var respostasEmails = $('Interpretar E-mail').all().map(function (i) { return i.json; });
var planilhaRelida = planilhaDoLote($('Reler E-mails').first().json, LEITURAS_EMAILS_PCP_RELER);
var concluidas = concluirEmailsPcp(pedidosEmails, respostasEmails, planilhaRelida.linhas['EMAILS_PCP']);
if (!concluidas.length) return [];
var gravacoesEmails = requisicoesDeEscrita(concluidas, [], planilhaRelida, PLANILHA_ID);
if (gravacoesEmails.length !== 1) throw new Error('As interpretações devem gerar uma única gravação.');
return [{ json: gravacoesEmails[0] }];
