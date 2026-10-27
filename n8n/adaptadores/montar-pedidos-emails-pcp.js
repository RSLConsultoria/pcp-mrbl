// ===== adaptador: Montar Pedidos de Interpretação (workflow Ler E-mails do PCP) =====
// Depois de gravada a reserva: um item por e-mail para o subworkflow do intérprete.
return ($('Selecionar E-mails').first().json.pedidos || []).map(function (p) { return { json: p }; });
