// ===== adaptador: Selecionar E-mails (workflow Ler E-mails do PCP) =====
// E-mails novos do Gmail e linhas ERRO com menos de 3 tentativas. Saída: as requisições
// da reserva (append das novas como ERRO/1 tentativa e update das tentativas), uma por
// item, com os pedidos ao intérprete no primeiro. Nada a interpretar: nenhum item.
var planilhaEmails = planilhaDoLote($('Ler Planilha E-mails').first().json, LEITURAS_EMAILS_PCP);
var rodadaEmails = selecionarEmailsPcp($('Buscar E-mails').all(), {
  emails: planilhaEmails.linhas['EMAILS_PCP'],
  faltantes: planilhaEmails.linhas['FALTANTES'],
  ganhas: planilhaEmails.linhas['CAIXAS GANHAS']
}, ($('Config').first().json || {}).dominio, new Date().toISOString());
if (!rodadaEmails.pedidos.length) return [];
var reservasEmails = requisicoesDeEscrita(rodadaEmails.operacoes, [], planilhaEmails, PLANILHA_ID);
return reservasEmails.map(function (r, i) {
  return { json: { method: r.method, url: r.url, body: r.body, pedidos: i === 0 ? rodadaEmails.pedidos : [] } };
});
