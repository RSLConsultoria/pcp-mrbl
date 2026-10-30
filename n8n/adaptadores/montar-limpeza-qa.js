// ===== adaptador: Montar Limpeza (Recarregar QA) =====
// Limpa na QA as abas que vão ser copiadas. Só monta a requisição para PLANILHA_ID (a QA).
return [{ json: requisicaoLimpezaQa($('Ler Original').first().json) }];
