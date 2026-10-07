// ===== adaptador: Marcar Invalidas =====
var rows = $input.all().map(function (i) { return i.json; });
return linhasInvalidas(rows).map(function (o) { return { json: o }; });
