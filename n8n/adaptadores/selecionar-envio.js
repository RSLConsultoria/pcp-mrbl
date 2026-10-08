// ===== adaptador: Selecionar Envio =====
// Um item por grupo (deal) pronto para virar um registro compilado:
// { grupo: { deal_id, os, linhas } }. Buscar Contato roda uma vez por grupo.
var DEALS_PERMITIDOS = ['607479158'];  // TESTE: so o card de teste ate o go-live
var rows = $input.all().map(function (i) { return i.json; });
if (DEALS_PERMITIDOS.length) {
  rows = rows.filter(function (l) { return l && DEALS_PERMITIDOS.indexOf(texto(l.deal_id)) >= 0; });
}
return selecionarGrupos(rows, Date.now()).map(function (g) { return { json: { grupo: g } }; });
