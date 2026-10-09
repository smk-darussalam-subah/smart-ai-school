'use client';
import { createContext, useContext, useMemo } from 'react';
import { patternForPeriod, profileForDate, segmentsForDay, slotsForDay, type BellProfile, type BellPeriod } from '@/lib/bell-patterns';
import { wibTodayISO, scheduleDayOfWeek } from '@/lib/bell-times';
const BellContext = createContext<BellProfile[]>([]);
const PeriodContext = createContext<BellPeriod[]>([]);
export function BellPatternProvider({ profiles, periods = [], children }: { profiles: BellProfile[]; periods?: BellPeriod[]; children: React.ReactNode }) {
  return <BellContext.Provider value={profiles}><PeriodContext.Provider value={periods}>{children}</PeriodContext.Provider></BellContext.Provider>;
}
export function useBellPeriod(academicYear: string | undefined, semester: number) {
  const profiles = useContext(BellContext);
  const periods = useContext(PeriodContext);
  return useMemo(() => {
    const matches = periods.filter((period) => period.academicYear.code === academicYear && period.number === semester);
    return patternForPeriod(profiles, matches.length === 1 ? matches[0]! : null);
  }, [profiles, periods, academicYear, semester]);
}
export function useBellPattern(date = wibTodayISO(), day = scheduleDayOfWeek()) {
  const profiles = useContext(BellContext);
  return useMemo(() => {
    const profile = profileForDate(profiles, date);
    const weeklySlots = [...new Map([1,2,3,4,5,6].flatMap((weekday) => slotsForDay(profile, weekday)).map((slot) => [slot.jp, slot])).values()].sort((a, b) => a.jp - b.jp);
    return { profiles, profile, slots: slotsForDay(profile, day), segments: segmentsForDay(profile, day),
      weeklySlots,
      slotsForDay: (weekday: number) => slotsForDay(profile, weekday), available: Boolean(profile) };
  }, [profiles, date, day]);
}
