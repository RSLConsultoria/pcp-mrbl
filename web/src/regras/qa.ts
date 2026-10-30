// Ambiente de QA (spec 2026-10-30): só a API homolog manda board.qa.copiadoEm (data ISO
// da última recarga da planilha QA). A faixa usa o horário de São Paulo.
export function textoFaixaQa(copiadoEm: string): string {
  return `AMBIENTE DE QA · dados copiados em ${dataHoraSaoPaulo(copiadoEm)} · nada altera a planilha original`;
}

function dataHoraSaoPaulo(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '--/-- --:--';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')} ${p('hour')}:${p('minute')}`;
}
