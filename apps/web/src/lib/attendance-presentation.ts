const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const period = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});
const dayMonth = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});

export const attendanceNumber = (value: number) => number.format(value);

export function attendanceRangeLabel(from: string, to: string): string {
  const end = period.format(new Date(to + 'T00:00:00+07:00'));
  if (from === to) return end;

  const startDate = new Date(from + 'T00:00:00+07:00');
  // ICU versions disagree on the whitespace around the date range separator.
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${Number(from.slice(8, 10))}–${end}`;
  }
  const start = (from.slice(0, 4) === to.slice(0, 4) ? dayMonth : period).format(startDate);
  return `${start} – ${end}`;
}

export function attendanceDayLabel(value: string): string {
  if (!/^\d{2}-\d{2}$/.test(value)) return value;
  return dayMonth.format(new Date('2000-' + value + 'T00:00:00+07:00'));
}
