// ===== adaptador: Montar Pedidos de Interpretação (workflow Ler E-mails do PCP) =====
// Depois de gravada a reserva: um item por e-mail para o subworkflow do intérprete.
// Reserva gravada só em parte (um item foi para a saída de erro): nada vai ao intérprete, para
// nenhuma tentativa passar sem ser contada; a próxima rodada tenta de novo.
var selecaoEmails = $('Selecionar E-mails').all();
if ($('Gravar Reservas').all().length !== selecaoEmails.length) return [];
return ($('Selecionar E-mails').first().json.pedidos || []).map(function (p) { return { json: p }; });
