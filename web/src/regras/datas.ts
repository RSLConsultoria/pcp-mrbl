const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})/;

export function paraData(s: string): Date | null {
  const m = RE_DATA.exec(s ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function diasEntre(desde: string, hoje: Date): number | null {
  const d = paraData(desde);
  if (!d) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - d.getTime()) / 86_400_000));
}

export function textoDias(n: number | null): string {
  if (n === null) return '';
  if (n === 0) return 'hoje';
  return `há ${n} ${n > 1 ? 'dias' : 'dia'}`;
}

export function ddmm(s: string): string {
  const m = RE_DATA.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}` : '';
}

export function horaMinuto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "dd/mm HH:MM" no fuso local, para o histórico.
export function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 'aaaa-mm-dd' do dia local.
export function diaIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
