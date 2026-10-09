import type { JpSlot } from './bell-times';
export type BellSegmentType = 'INSTRUCTION' | 'BREAK' | 'CEREMONY' | 'OTHER';
export interface BellSegment {
  id?: string;
  dayOfWeek: number;
  jpNumber: number | null;
  label: string;
  type: BellSegmentType;
  startMinute: number;
  endMinute: number;
  sortOrder: number;
}
export interface BellProfile {
  id: string;
  code: string;
  name: string;
  kind: 'NORMAL' | 'RAMADAN' | 'EXAM' | 'SPECIAL';
  effectiveFrom: string;
  effectiveUntil: string | null;
  provenance: string;
  revokedAt: string | null;
  segments: BellSegment[];
}
export interface BellPeriod {
  number: number;
  startDate: string;
  endDate: string;
  academicYear: { code: string };
}
export interface BellTimingCatalog {
  profiles: Omit<BellProfile, 'provenance' | 'revokedAt'>[];
  periods: BellPeriod[];
}
export type PeriodBellSlot = JpSlot & { timingVaries: boolean };

/** Same weekday occurrence/intersection contract as API assertWeeklyRange. */
export function patternForPeriod(profiles: BellProfile[], period: BellPeriod | null) {
  const union = new Map<number, Map<number, PeriodBellSlot>>();
  const common = new Map<number, Set<number>>();
  let problem = period ? '' : 'Pilih tahun ajaran dan semester yang sudah dikonfigurasi.';
  if (period) {
    const from = new Date(period.startDate.slice(0, 10) + 'T00:00:00Z').getTime();
    const until = new Date(period.endDate.slice(0, 10) + 'T00:00:00Z').getTime();
    if (!Number.isFinite(from) || !Number.isFinite(until) || until < from || until - from > 366 * 86400000)
      problem = 'Rentang semester tidak valid.';
    else for (let stamp = from; stamp <= until; stamp += 86400000) {
      const value = new Date(stamp);
      const day = value.getUTCDay();
      if (day === 0) continue;
      const profile = profileForDate(profiles, value.toISOString().slice(0, 10));
      if (!profile || patternProblem(profile.segments)) {
        problem = 'Cakupan bel semester belum lengkap, tunggal, dan valid. Konfigurasikan bel dahulu.';
        break;
      }
      const slots = slotsForDay(profile, day);
      const numbers = new Set(slots.map((slot) => slot.jp));
      const prior = common.get(day);
      common.set(day, prior ? new Set([...prior].filter((jp) => numbers.has(jp))) : numbers);
      const daily = union.get(day) ?? new Map<number, PeriodBellSlot>();
      for (const slot of slots) {
        const previous = daily.get(slot.jp);
        daily.set(slot.jp, { ...slot, timingVaries: Boolean(previous?.timingVaries || previous &&
          (previous.startMin !== slot.startMin || previous.endMin !== slot.endMin)) });
      }
      union.set(day, daily);
    }
  }
  const slotsForPeriodDay = (day: number): PeriodBellSlot[] => problem ? [] :
    [...(union.get(day)?.values() ?? [])].sort((a, b) => a.jp - b.jp);
  const validSlotsForDay = (day: number) => slotsForPeriodDay(day).filter((slot) => common.get(day)?.has(slot.jp));
  return { available: !problem, problem, period, slotsForDay: slotsForPeriodDay, validSlotsForDay,
    weeklySlots: [...new Set([...union.values()].flatMap((slots) => [...slots.keys()]))].sort((a, b) => a - b),
    varies: [...union.values()].some((slots) => [...slots.values()].some((slot) => slot.timingVaries)) };
}
export const SCHOOL_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export function segmentsForDay(profile: BellProfile | null, day: number): BellSegment[] {
  if (!profile) return [];
  const daily = profile.segments.some((segment) => (segment.dayOfWeek ?? 0) !== 0);
  return profile.segments
    .filter((segment) => (segment.dayOfWeek ?? 0) === (daily ? day : 0))
    .sort((a, b) => a.startMinute - b.startMinute);
}
export function slotsForDay(profile: BellProfile | null, day: number): JpSlot[] {
  return segmentsForDay(profile, day)
    .filter((segment) => segment.type === 'INSTRUCTION')
    .map((segment) => ({
      jp: segment.jpNumber!,
      startMin: segment.startMinute,
      endMin: segment.endMinute,
    }));
}
export function profileForDate(profiles: BellProfile[], date: string): BellProfile | null {
  const matches = profiles.filter(
    (profile) =>
      !profile.revokedAt &&
      profile.effectiveFrom.slice(0, 10) <= date &&
      (!profile.effectiveUntil || profile.effectiveUntil.slice(0, 10) >= date),
  );
  return matches.length === 1 ? matches[0]! : null;
}
export function patternProblem(segments: BellSegment[]): string | null {
  for (const day of new Set(segments.map((segment) => segment.dayOfWeek))) {
    const rows = segments
      .filter((segment) => segment.dayOfWeek === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    let jp = 0;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;
      if (
        !row.label.trim() ||
        !Number.isFinite(row.startMinute) ||
        !Number.isFinite(row.endMinute) ||
        row.startMinute < 0 ||
        row.endMinute > 1440 ||
        row.endMinute <= row.startMinute
      )
        return 'Lengkapi label dan rentang waktu yang valid.';
      if (index && rows[index - 1]!.endMinute > row.startMinute)
        return 'Waktu bertumpuk. Sesuaikan segmen sebelum menyimpan.';
      if (row.type === 'INSTRUCTION' && row.jpNumber !== ++jp)
        return 'Nomor JP harus berurutan sesuai waktu.';
    }
  }
  return null;
}
export function normalizeDay(rows: BellSegment[], day: number): BellSegment[] {
  let jp = 0;
  return [...rows]
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((row, index) => ({
      dayOfWeek: day,
      type: row.type,
      jpNumber: row.type === 'INSTRUCTION' ? ++jp : null,
      label: row.type === 'INSTRUCTION' ? 'JP ' + jp : row.label,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      sortOrder: index + 1,
    }));
}
