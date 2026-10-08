// ===== adaptador: Selecionar Envio =====
var DEALS_PERMITIDOS = ['607479158'];  // TESTE: so o card de teste ate o go-live
var rows = $input.all().map(function (i) { return i.json; });
var sel = selecionarPendentes(rows);
if (DEALS_PERMITIDOS.length) {
  sel = sel.filter(function (l) { return DEALS_PERMITIDOS.indexOf(String(l.deal_id)) >= 0; });
}
return sel.map(function (l) { return { json: { linha: l } }; });
