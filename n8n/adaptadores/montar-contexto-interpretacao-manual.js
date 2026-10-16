// ===== adaptador: Montar Contexto do Intérprete (workflow Interpretar WhatsApp) =====
// O subworkflow do modelo recebe só o corpo do intérprete: o mesmo da entrada.
return [{ json: $('Preparar Interpretação').first().json.entrada }];
