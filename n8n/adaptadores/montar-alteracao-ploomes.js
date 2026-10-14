// ===== adaptador: Montar Alteracao Ploomes =====
// Converte a alteracao semantica do Processar Acao no PATCH oficial do Ploomes.
// A planilha so pode ser gravada depois que esta requisicao tiver sucesso.
var resultado = $('Processar Acao').first().json;
var alteracao = resultado.status === 200 ? resultado.ploomes : null;
if (!alteracao) return [{ json: { gravar: false } }];

var dealId = texto(alteracao.dealId);
if (!/^\d+$/.test(dealId)) throw new Error('Deal invalido para gravacao no Ploomes.');
var props = [];
var campos = alteracao.campos || {};
Object.keys(campos).forEach(function (chave) {
  var valor = texto(campos[chave]);
  if (chave === CAMPO_DATA_COMBINADA_PLOOMES) {
    if (valor && !dataValida(valor)) throw new Error('Data combinada invalida para gravacao no Ploomes.');
    props.push({ FieldKey: chave, DateTimeValue: valor ? valor + 'T00:00:00' : null });
    return;
  }
  if (chave === CAMPO_OFICINA_PLOOMES) {
    if (valor && !/^\d+$/.test(valor)) throw new Error('Oficina invalida para gravacao no Ploomes.');
    props.push({ FieldKey: chave, IntegerValue: valor ? Number(valor) : null });
    return;
  }
  throw new Error('Campo nao permitido para gravacao no Ploomes: ' + chave);
});
if (!props.length) return [{ json: { gravar: false } }];
return [{ json: {
  gravar: true,
  url: 'https://public-api2.ploomes.com/Deals(' + dealId + ')',
  registro: { OtherProperties: props }
} }];
