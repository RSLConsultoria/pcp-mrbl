// ===== adaptador: Montar Recarga (Recarregar QA) =====
// Grava na QA os valores lidos da original e a data da carga na QA_CONTROLE.
return [{ json: requisicaoRecargaQa($('Ler Original').first().json, Date.now()) }];
