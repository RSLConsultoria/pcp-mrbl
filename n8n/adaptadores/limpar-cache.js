// ===== adaptador: Limpar Cache =====
// Fim das gravacoes da acao: apaga o cache do board de novo. O Processar Acao ja
// apaga antes de gravar, mas um board lido enquanto o loop gravava guardaria a
// planilha ainda sem a acao por ate 55 s (e o site desfaria a mudanca na tela).
limparCacheBoard($getWorkflowStaticData('global'));
return [{ json: { ok: true } }];
