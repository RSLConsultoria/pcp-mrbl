// ===== adaptador: Montar Contexto do Interprete =====
// O modelo recebe somente texto, horário e contexto curto da OS. JIDs e nomes
// de participantes não saem deste workflow.
var preparadaModelo = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
var contextoModelo = preparadaModelo.contextoInterpretacao || {};
return [{ json: {
  texto: texto(contextoModelo.texto),
  quando: texto(contextoModelo.quando),
  os: texto(contextoModelo.os),
  dataCombinada: texto(contextoModelo.dataCombinada),
  instrucoes: 'Interprete a resposta da oficina sem responder ao grupo. Devolva somente o objeto estruturado.',
  schema: {
    tipo: ['NOVA_DATA_COMBINADA', 'PRAZO_CONFIRMADO', 'MOTIVO_ATRASO', 'OBSERVACAO'],
    valor: 'data ISO, data em dd/mm ou expressão relativa quando houver nova data',
    resumo: 'resumo curto em português',
    evidencia: 'trecho curto que sustenta a interpretação',
    confianca: 'número entre 0 e 1'
  }
} }];
