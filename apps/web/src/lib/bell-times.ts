// Time helpers are pure: callers supply the resolved daily bell pattern.
// No school clock or JP count is hardcoded here.
export interface JpSlot { jp: number; startMin: number; endMin: number }
export interface BellTimeSegment { label: string; startMin: number; endMin: number; isJp: boolean }
const pad = (number: number) => String(number).padStart(2, '0');
export function fmtMin(minute: number) { return pad(Math.floor(minute / 60)) + ':' + pad(minute % 60); }
export function jpStartLabel(jp: number, slots: JpSlot[]) { const slot = slots.find((item) => item.jp === jp); return slot ? fmtMin(slot.startMin) : ''; }
export function wibNow(now = new Date()): { minutes: number; jsDay: number } {
  const date = new Date(now.getTime() + 7 * 3600000);
  return { minutes: date.getUTCHours() * 60 + date.getUTCMinutes(), jsDay: date.getUTCDay() };
}
export function scheduleDayOfWeek(now = new Date()) { return wibNow(now).jsDay; }
export function wibTodayISO(now = new Date()) { return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function wibDateLabel(now = new Date()) { return now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
export function currentJp(minutes: number, slots: JpSlot[]) { return slots.find((slot) => minutes >= slot.startMin && minutes < slot.endMin)?.jp ?? 0; }
export function jpStatusLabel(minutes: number, segments: BellTimeSegment[]) {
  if (!segments.length) return 'Pola bel belum tersedia';
  const segment = segments.find((item) => minutes >= item.startMin && minutes < item.endMin);
  if (!segment) return minutes < Math.min(...segments.map((item) => item.startMin)) ? 'Belum mulai' : 'Di luar jam pelajaran';
  const range = fmtMin(segment.startMin) + '–' + fmtMin(segment.endMin);
  return segment.label + (segment.isJp ? ' berlangsung (' : ' (') + range + ')';
}
export function currentBreak(minutes: number, segments: BellTimeSegment[]) { return segments.find((item) => !item.isJp && minutes >= item.startMin && minutes < item.endMin) ?? null; }
export function nextBreak(minutes: number, segments: BellTimeSegment[]) { return segments.find((item) => !item.isJp && item.startMin > minutes) ?? null; }
