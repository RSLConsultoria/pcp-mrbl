// ===== adaptador: Resultado sem Conexão =====
// A instância não estava "open" (ou não deu para conferir): o sendText nem foi
// chamado, então é certeza de que não saiu. Volta para a fila com tentativas + 1.
var mensagemSemConexao = $('Selecionar Saida WhatsApp').first().json || {};
var lidaSemConexao = $('Ler Fila WhatsApp').all().map(function (item) { return item.json || {}; })
  .filter(function (m) { return texto(m.id) === texto(mensagemSemConexao.id); })[0] || {};
var conexao = avaliarConexaoWhatsapp($('Consultar Conexão').first().json || {});
return [{ json: resultadoSemConexaoWhatsapp(Object.assign({}, mensagemSemConexao, { envio_tentativas: lidaSemConexao.envio_tentativas }),
  conexao, new Date().toISOString()) }];
