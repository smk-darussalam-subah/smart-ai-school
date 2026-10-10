/** The API resolves the student's own class from the authenticated identity. */
export const OWN_STUDENT_SCHEDULE_PATH = '/schedules?limit=100';

/** Parent requests select one child's class; the API still enforces child ownership. */
export function childSchedulePath(classId: string | null | undefined): string | null {
  if (!classId) return null;
  return '/schedules?' + new URLSearchParams({ classId, limit: '100' }).toString();
}
import type { ApiFetchResult } from './api';

export type LearnerScheduleState = 'ready' | 'error' | 'denied' | 'unassigned';

/** Preserve failed requests instead of presenting them as an empty timetable. */
export function readLearnerSchedule<T>(result: ApiFetchResult<{ data: T[] }>): { data: T[]; state: LearnerScheduleState } {
  if (result.status === 'forbidden') return { data: [], state: 'denied' };
  if (result.status !== 'success' || !result.data || !Array.isArray(result.data.data)) {
    return { data: [], state: 'error' };
  }
  return { data: result.data.data, state: 'ready' };
}
