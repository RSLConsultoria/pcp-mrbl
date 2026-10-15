// ===== adaptador: Limpar Cache =====
// Fim das gravacoes da acao: apaga o cache somente depois de a planilha
// confirmar a operacao, para o proximo GET reler o estado persistido.
limparCacheBoard($getWorkflowStaticData('global'));
return [{ json: { ok: true } }];
