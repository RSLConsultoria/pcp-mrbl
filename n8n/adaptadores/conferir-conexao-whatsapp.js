// ===== adaptador: Conferir Conexão =====
// Resposta do GET /instance/connectionState: só "open" segue para o sendText.
// Só o booleano sai daqui (este item não vai para a planilha).
return [{ json: { conectada: avaliarConexaoWhatsapp($input.first().json || {}).aberta === true } }];
