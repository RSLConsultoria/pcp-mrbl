// ===== adaptador: Montar Busca (workflow Ler E-mails do PCP) =====
// O domínio da confecção vem do node Config (marcador CONFIGURAR_DOMINIO no repositório).
// Sem domínio configurado o workflow para aqui, antes de ler o Gmail.
var buscaEmailsPcp = buscaGmailEmailsPcp(($('Config').first().json || {}).dominio);
if (!buscaEmailsPcp) throw new Error('Configure o domínio da confecção no node Config antes de ativar.');
return [{ json: { q: buscaEmailsPcp } }];
