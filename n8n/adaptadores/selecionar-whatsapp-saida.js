// ===== adaptador: Selecionar Saida WhatsApp =====
var mensagens = $input.all().map(function (item) { return item.json || {}; });
var escolha = selecionarSaidaWhatsapp(mensagens, new Date().toISOString());
if (!escolha) return [];
return [{ json: {
  id: escolha.linha.id,
  grupo_jid: texto(escolha.mensagem && escolha.mensagem.grupo_jid),
  texto: typeof (escolha.mensagem && escolha.mensagem.texto) === 'string' ? escolha.mensagem.texto : '',
  status_envio: escolha.linha.status_envio,
  erro: escolha.linha.erro
} }];
