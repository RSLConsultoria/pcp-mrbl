// ===== adaptador: Resultado WhatsApp =====
// As tentativas anteriores vêm da linha lida da fila (a seleção não as grava).
var mensagem = $('Selecionar Saida WhatsApp').first().json || {};
var lidaFila = $('Ler Fila WhatsApp').all().map(function (item) { return item.json || {}; })
  .filter(function (m) { return texto(m.id) === texto(mensagem.id); })[0] || {};
var resposta = $input.first().json || {};
return [{ json: resultadoSaidaWhatsapp(Object.assign({}, mensagem, { envio_tentativas: lidaFila.envio_tentativas }),
  resposta, new Date().toISOString()) }];
