/** The API resolves the student's own class from the authenticated identity. */
export const OWN_STUDENT_SCHEDULE_PATH = '/schedules?limit=100';

/** Parent requests select one child's class; the API still enforces child ownership. */
export function childSchedulePath(classId: string | null | undefined): string | null {
  if (!classId) return null;
  return '/schedules?' + new URLSearchParams({ classId, limit: '100' }).toString();
}
