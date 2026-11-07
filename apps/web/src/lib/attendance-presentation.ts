const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const period = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

export const attendanceNumber = (value: number) => number.format(value);

export function attendanceRangeLabel(from: string, to: string): string {
  return period.formatRange(new Date(from + 'T00:00:00+07:00'), new Date(to + 'T00:00:00+07:00'));
}

export function attendanceDayLabel(value: string): string {
  if (!/^\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date('2000-' + value + 'T00:00:00+07:00'));
}
