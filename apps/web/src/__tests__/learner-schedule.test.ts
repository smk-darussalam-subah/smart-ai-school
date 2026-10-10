import fs from 'node:fs';
import path from 'node:path';
import { childSchedulePath, OWN_STUDENT_SCHEDULE_PATH } from '../lib/learner-schedule';

describe('learner timetable request contract', () => {
  it('student request uses authenticated ownership, never Keycloak ID as student selector', () => {
    expect(OWN_STUDENT_SCHEDULE_PATH).toBe('/schedules?limit=100');
    expect(new URLSearchParams(OWN_STUDENT_SCHEDULE_PATH.split('?')[1]).has('studentId')).toBe(false);
  });
  it.each([null, undefined, ''])('unassigned child class %s does not fetch sibling schedules', (classId) => {
    expect(childSchedulePath(classId)).toBeNull();
  });
  it('different children select separate class schedules', () => {
    const a = childSchedulePath('11111111-1111-4111-8111-111111111111')!;
    const b = childSchedulePath('22222222-2222-4222-8222-222222222222')!;
    expect(a).not.toBe(b);
    expect(new URLSearchParams(a.split('?')[1]).get('classId')).toBe('11111111-1111-4111-8111-111111111111');
    expect(new URLSearchParams(b.split('?')[1]).get('classId')).toBe('22222222-2222-4222-8222-222222222222');
  });
  it('real server page consumes both contracts and never sends unsupported studentId to schedules', () => {
    const page = fs.readFileSync(path.join(__dirname, '../app/dashboard/akademik/page.tsx'), 'utf8');
    expect(page).toContain('>(OWN_STUDENT_SCHEDULE_PATH, token)');
    expect(page).toContain('const schedulePath = childSchedulePath(child.class?.id)');
    expect(page).not.toContain('/schedules?studentId=');
  });
});
