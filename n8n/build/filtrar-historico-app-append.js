// ===== Code node "Filtrar HISTORICO_APP append" =====
// GERADO por n8n/scripts/gerar-code-nodes.js. Nao edite no n8n.

// ===== adaptador: Filtrar <aba> <operacao> =====
// Um destino de escrita: devolve as linhas de $('Processar Acao') para a aba e
// a operacao deste node (DESTINO), cada uma como { json: linha }. Sem linhas,
// devolve um marcador { _vazio: true } que o IF "Tem ...?" desvia da escrita
// (o Sheets nunca recebe item vazio). Le sempre de $('Processar Acao'), entao
// a quantidade de itens que chega do node anterior nao importa.
// CONFERIR (so no primeiro destino): toda operacao precisa de um destino com a
// mesma aba, operacao e chave, e a linha de update precisa da chave; senao o
// node falha antes de qualquer escrita.
var DESTINO = {"aba":"HISTORICO_APP","operacao":"append","chave":"id","fonte":"historicos"};
var CONFERIR = null;
var resultado = $('Processar Acao').first().json;
var operacoes = resultado.operacoes || [];
if (CONFERIR) {
  operacoes.forEach(function (o) {
    var conhecido = CONFERIR.some(function (d) {
      return d.fonte === 'operacoes' && d.aba === o.aba && d.operacao === o.operacao && d.chave === o.chave;
    });
    if (!conhecido) throw new Error('Operacao sem destino no workflow: ' + o.aba + ' ' + o.operacao + ' ' + o.chave);
    if (!o.linha || !Object.keys(o.linha).length) throw new Error('Operacao sem linha: ' + o.aba + ' ' + o.operacao);
    if (o.operacao !== 'append' && (o.linha[o.chave] === undefined || o.linha[o.chave] === '')) {
      throw new Error('Operacao sem chave ' + o.chave + ': ' + o.aba + ' ' + o.operacao);
    }
  });
}
var linhasDestino = DESTINO.fonte === 'historicos'
  ? (resultado.historicos || [])
  : operacoes
    .filter(function (o) { return o.aba === DESTINO.aba && o.operacao === DESTINO.operacao; })
    .map(function (o) { return o.linha; });
if (!linhasDestino.length) return [{ json: { _vazio: true } }];
return linhasDestino.map(function (l) { return { json: l }; });
