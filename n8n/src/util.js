// ===== src/util.js =====
// Helpers de leitura das linhas da planilha. Sem import/export: este
// arquivo entra inteiro no texto dos Code nodes do n8n.

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// null = celula vazia; NaN = preenchida com algo que nao e numero.
function numero(v) {
  var t = texto(v).replace(',', '.');
  if (t === '') return null;
  var n = Number(t);
  return isFinite(n) ? n : NaN;
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// Aceita 'aaaa-mm-dd', 'aaaa-mm-dd hh:mm', 'dd/mm/aaaa', 'dd/mm/aa' e
// 'dd/mm' (usa anoPadrao). Devolve 'aaaa-mm-dd' ou '' quando nao reconhece.
function dataISO(v, anoPadrao) {
  var t = texto(v);
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) {
    var ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(anoPadrao);
    return ano + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  }
  return '';
}

function semAcento(s) {
  return texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
