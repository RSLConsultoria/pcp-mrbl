// ===== adaptador: Selecionar Envio =====
var DEALS_PERMITIDOS = [];  // vazio = todos. No primeiro teste, só o card de teste.
var rows = $input.all().map(function (i) { return i.json; });
var sel = selecionarPendentes(rows);
if (DEALS_PERMITIDOS.length) {
  sel = sel.filter(function (l) { return DEALS_PERMITIDOS.indexOf(String(l.deal_id)) >= 0; });
}
return sel.map(function (l) { return { json: { linha: l } }; });
