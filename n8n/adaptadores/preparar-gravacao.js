// ===== adaptador: Preparar Gravacao =====
// Apenas os campos da linha (colunas da planilha); a aba vem de
// $('Processar Acao').first().json.gravacao.aba no IF "E Item?".
var g = $input.first().json.gravacao;
return [{ json: Object.assign({}, g.campos) }];
