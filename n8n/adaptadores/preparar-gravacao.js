// ===== adaptador: Preparar Gravacao =====
// Colunas da linha + a coluna-chave do casamento (id / deal_id); a aba vem de
// $('Processar Acao').first().json.gravacao.aba no IF "E Item?".
var g = $input.first().json.gravacao;
return [{ json: linhaDeGravacao(g) }];
