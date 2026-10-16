// Ids dos subworkflows chamados por Execute Workflow, num lugar só.
// Antes de criar o workflow no n8n fica o marcador CONFIGURAR_*; depois de criado,
// troque pelo id real (não é segredo), rode npm run build e commite: o deploy
// grava o JSON do repositório e voltaria o marcador.
// - INTERPRETE: subworkflow do modelo (credencial fora do repositório).
// - INTERPRETAR_WHATSAPP: "PCP MRBL - Interpretar WhatsApp" (chamado pela API e
//   pelo "PCP MRBL - Retentar Interpretação").
const IDS_SUBWORKFLOWS = {
  INTERPRETE: 'CONFIGURAR_INTERPRETE',
  INTERPRETAR_WHATSAPP: 'CONFIGURAR_INTERPRETAR_WHATSAPP'
};

function idSubworkflowValido(id) {
  if (typeof id !== 'string') return false;
  if (/^CONFIGURAR_[A-Z0-9_]+$/.test(id)) return true;
  return /^[A-Za-z0-9_-]{4,64}$/.test(id) && id.indexOf('CONFIGURAR_') !== 0;
}

module.exports = { IDS_SUBWORKFLOWS, idSubworkflowValido };
