export interface ArrivalExpectation {
  basis: 'TEACHING' | 'WORKDAY' | 'NONE' | 'UNAVAILABLE' | 'EXEMPT';
  dueAt: string | null;
  recommendedAt: string | null;
  firstTeachingAt: string | null;
}

export function teacherArrival(firstTeachingAt: string | null, minimum: number, target: number): ArrivalExpectation {
  if (!firstTeachingAt) return { basis: 'NONE', dueAt: null, recommendedAt: null, firstTeachingAt: null };
  const first = new Date(firstTeachingAt).getTime();
  return {
    basis: 'TEACHING', firstTeachingAt,
    dueAt: new Date(first - minimum * 60000).toISOString(),
    recommendedAt: new Date(first - target * 60000).toISOString(),
  };
}

export function workdayArrival(date: string, startMinute: number): ArrivalExpectation {
  const stamp = new Date(date + 'T00:00:00+07:00').getTime() + startMinute * 60000;
  const dueAt = new Date(stamp).toISOString();
  return { basis: 'WORKDAY', dueAt, recommendedAt: dueAt, firstTeachingAt: null };
}

export const UNKNOWN_ARRIVAL: ArrivalExpectation = { basis: 'UNAVAILABLE', dueAt: null, recommendedAt: null, firstTeachingAt: null };
export const EXEMPT_ARRIVAL: ArrivalExpectation = { basis: 'EXEMPT', dueAt: null, recommendedAt: null, firstTeachingAt: null };

export function isAttendanceWorkingDay(date: string, workingDays: number[], holidays: { startDate: Date; endDate: Date }[]): boolean {
  const value = new Date(date + 'T00:00:00Z');
  return workingDays.includes(value.getUTCDay() || 7) &&
    !holidays.some((holiday) => holiday.startDate <= value && holiday.endDate >= value);
}
