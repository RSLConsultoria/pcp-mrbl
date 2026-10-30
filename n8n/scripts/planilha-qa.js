// Ambiente de QA com dados reais (spec 2026-10-30): id da planilha "PCP MRBL - QA",
// num lugar só. Não é segredo. Antes de o dono criar a cópia fica o marcador
// CONFIGURAR_PLANILHA_QA; depois, o id real, npm run build e commit (o deploy grava o
// JSON do repositório e voltaria o marcador).
// Todo workflow de homologação lê e grava só nesta planilha; a produção, só na original
// (PLANILHA_ID em src/planilhaLote.js).
const PLANILHA_QA_ID = '1zQlyOo7U_gS_tK2Rcqcqk6m7Oo_3G87H5L5ZkeWRoVw';

function idPlanilhaQaValido(id) {
  if (typeof id !== 'string') return false;
  if (id === 'CONFIGURAR_PLANILHA_QA') return true;
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) && id.indexOf('CONFIGURAR_') !== 0;
}

const RE_MODO_QA = /var MODO_QA = false;/g;
const RE_PLANILHA_ID = /var PLANILHA_ID = '[^']*';/g;

// Texto do código (src/ concatenado, ou um arquivo dele) no modo QA: MODO_QA = true e
// PLANILHA_ID = id da QA. exigir: o texto precisa ter as duas linhas, uma vez cada
// (texto de um Code node inteiro); sem exigir, troca o que achar (um arquivo só).
function paraQa(texto, exigir) {
  const nModo = (texto.match(RE_MODO_QA) || []).length;
  const nId = (texto.match(RE_PLANILHA_ID) || []).length;
  if (exigir && (nModo !== 1 || nId !== 1)) {
    throw new Error('Modo QA: esperava uma linha MODO_QA e uma PLANILHA_ID, veio ' + nModo + ' e ' + nId);
  }
  return texto
    .replace(RE_MODO_QA, 'var MODO_QA = true;')
    .replace(RE_PLANILHA_ID, "var PLANILHA_ID = '" + PLANILHA_QA_ID + "';");
}

module.exports = { PLANILHA_QA_ID, idPlanilhaQaValido, paraQa };
