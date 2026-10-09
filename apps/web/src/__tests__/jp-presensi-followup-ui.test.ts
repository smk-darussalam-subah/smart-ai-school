import { patternForPeriod, slotsForDay, type BellProfile, type BellPeriod } from '@/lib/bell-patterns';
import { resolveSchedule, scheduledInstructionMinutes, transformApiSchedule } from '@/app/dashboard/akademik/_components/siswa/siswa-data';

function profile(id: string, from: string, until: string, count: number, minutes = 40): BellProfile {
  return { id, code: id, name: id, kind: 'NORMAL', provenance: 'synthetic', revokedAt: null,
    effectiveFrom: from, effectiveUntil: until,
    segments: Array.from({ length: count }, (_, index) => ({ dayOfWeek: 0, type: 'INSTRUCTION' as const,
      jpNumber: index + 1, label: 'JP ' + (index + 1), startMinute: 420 + index * minutes,
      endMinute: 420 + (index + 1) * minutes, sortOrder: index + 1 })) };
}
const semester: BellPeriod = { number: 2, startDate: '2027-01-04', endDate: '2027-01-16', academicYear: { code: '2026/2027' } };
describe('JP follow-up: selected period and actual instruction duration', () => {
  it('selects future 12-JP semester, independent of current 10-JP profile', () => {
    const current = profile('current', '2026-07-13', '2026-12-31', 10);
    const future = profile('future', '2027-01-01', '2027-06-30', 12, 30);
    const result = patternForPeriod([current, future], semester);
    expect(result.available).toBe(true);
    expect(result.weeklySlots).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(result.validSlotsForDay(1)).toHaveLength(12);
    expect(result.validSlotsForDay(1)[11]).toMatchObject({ jp: 12, startMin: 750, endMin: 780 });
  });
  it('intersects every weekday occurrence and flags timing variations, not only period start', () => {
    const first = profile('first', '2027-01-01', '2027-01-09', 12, 30);
    const second = profile('second', '2027-01-10', '2027-06-30', 10, 45);
    const result = patternForPeriod([first, second], semester);
    expect(result.available).toBe(true);
    expect(result.weeklySlots).toHaveLength(12);
    expect(result.validSlotsForDay(1)).toHaveLength(10);
    expect(result.validSlotsForDay(1)[0]?.timingVaries).toBe(true);
    expect(result.varies).toBe(true);
  });
  it('fails closed on coverage holes, ambiguity, invalid segments and missing selected period', () => {
    const source = profile('source', '2027-01-01', '2027-01-09', 10);
    for (const profiles of [[source], [source, { ...source, id: 'overlap' }], [{ ...source, segments: [{ ...source.segments[0]!, endMinute: 410 }] }]]) {
      const result = patternForPeriod(profiles, semester);
      expect(result.available).toBe(false);
      expect(result.validSlotsForDay(1)).toEqual([]);
    }
    expect(patternForPeriod([source], null).available).toBe(false);
  });
  it('handles distinct weekdays rather than using one day count or clock', () => {
    const source = profile('daily', '2027-01-01', '2027-06-30', 10);
    source.segments = [1,2,3,4,5,6].flatMap((day) => source.segments.slice(0, day === 5 ? 8 : 10).map((segment) => ({ ...segment, dayOfWeek: day })));
    const result = patternForPeriod([source], semester);
    expect(result.validSlotsForDay(5)).toHaveLength(8);
    expect(result.validSlotsForDay(2)).toHaveLength(10);
  });
  it('sums scheduled 30/40/45-minute daily instructions while excluding a break', () => {
    const source = profile('mixed', '2026-01-01', '2027-12-31', 2);
    source.segments = [1,2,3].flatMap((day) => {
      const length = [30,40,45][day - 1]!;
      return [
        { ...source.segments[0]!, dayOfWeek: day, startMinute: 420, endMinute: 420 + length },
        { dayOfWeek: day, jpNumber: null, label: 'Istirahat', type: 'BREAK' as const, startMinute: 420 + length, endMinute: 440 + length, sortOrder: 2 },
        { ...source.segments[1]!, dayOfWeek: day, startMinute: 440 + length, endMinute: 440 + 2 * length, sortOrder: 3 },
      ];
    });
    const raw = [1,2,3].map((day) => ({ dayOfWeek: day, jpStart: 1, jpEnd: 2, room: null }));
    const schedule = transformApiSchedule(raw, source);
    expect(Object.values(schedule).flatMap((day) => Object.keys(day))).toHaveLength(6);
    expect(scheduledInstructionMinutes(schedule, source)).toBe(230);
    expect(slotsForDay(source, 1)).toHaveLength(2);
    expect(scheduledInstructionMinutes(schedule, null)).toBeNull();
    expect(resolveSchedule(raw, null)).toMatchObject({ timingAvailable: false, isSim: false });
  });
});
