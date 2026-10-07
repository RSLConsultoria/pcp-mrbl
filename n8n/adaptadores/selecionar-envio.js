// ===== adaptador: Selecionar Envio =====
var rows = $input.all().map(function (i) { return i.json; });
return selecionarPendentes(rows).map(function (l) { return { json: { linha: l } }; });
