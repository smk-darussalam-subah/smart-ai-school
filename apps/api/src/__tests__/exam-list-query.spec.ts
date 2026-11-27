import { ExamListSchema, RescheduleExamSchema } from '../assessment/exam-contract';
import { examListPlan } from '../assessment/exam-list-query';
import { effectiveExamClose } from '../assessment/scheduled-exam-runtime';

const now = new Date('2026-11-27T02:00:00.000Z');

describe('exam schedule listing and cutoff', () => {
  it('uses WIB dates and puts unfinished exams in the operational list', () => {
    const input = ExamListSchema.parse({ day: '2026-11-26', through: '2026-11-27', view: 'schedule' });
    const query = examListPlan(input, now);
    expect(query.sort).toBe('priority');
    expect(query.filters).toContainEqual({ opensAt: { lt: new Date('2026-11-27T17:00:00Z') },
      closesAt: { gt: new Date('2026-11-25T17:00:00Z') } });
    expect(query.groups).toHaveLength(4);
    expect(query.groups[1]?.where).toMatchObject({ AND: [
      { publishedAt: { not: null }, cancelledAt: null, session: { status: 'active' } },
      { OR: [{ closesAt: { lte: now } }, { session: { dueAt: { lte: now } } }] },
    ] });
  });

  it('looks up the archived date for completed and cancelled exams', () => {
    const input = ExamListSchema.parse({ day: '2026-11-27', view: 'archive' });
    const query = examListPlan(input, now);
    expect(query.sort).toBe('newest');
    expect(query.groups.map(({ key }) => key)).toEqual(['cancelledAt', 'completedAt', 'opensAt']);
    expect(query.groups[1]?.where).toMatchObject({ cancelledAt: null, session: { status: 'completed',
      completedAt: { gte: new Date('2026-11-26T17:00:00Z'), lt: new Date('2026-11-27T17:00:00Z') } } });
    expect(query.groups[1]?.orderBy).toEqual([{ session: { completedAt: 'desc' } }, { sessionId: 'asc' }]);
  });

  it('includes program classes and restricts room-slot search to the student seat', () => {
    const input = ExamListSchema.parse({ day: '2026-11-27', className: 'X TO', search: 'Lab' });
    const query = examListPlan(input, now, 'synthetic-identity');
    expect(query.filters[0]).toMatchObject({ OR: [
      { session: { class: { name: { contains: 'X TO' } } } },
      { session: { program: { classes: { some: { class: { name: { contains: 'X TO' } } } } } } },
    ] });
    expect(query.filters[1]).toMatchObject({ OR: [
      { room: { contains: 'Lab' } }, { session: { title: { contains: 'Lab' } } },
      { participants: { some: { roomSlot: { room: { contains: 'Lab' } },
        student: { user: { keycloakId: 'synthetic-identity' } } } } },
    ] });
  });

  it('keeps a bounded server timestamp across pages and rejects reversed intervals', () => {
    const input = ExamListSchema.parse({ day: '2026-11-27', view: 'schedule',
      cursor: '54f06ab3-360b-4d53-8b20-a08cfddd4aa6', asOf: '2026-11-27T01:59:00.000Z' });
    expect(examListPlan(input, now).asOf).toEqual(new Date(input.asOf!));
    expect(ExamListSchema.safeParse({ day: '2026-11-27', through: '2026-11-26' }).success).toBe(false);
  });

  it('preserves the official close time while enforcing a recorded early close', () => {
    const scheduled = new Date('2026-11-27T03:00:00Z');
    expect(effectiveExamClose(scheduled, null)).toBe(scheduled);
    expect(effectiveExamClose(scheduled, new Date('2026-11-27T04:00:00Z'))).toBe(scheduled);
    expect(effectiveExamClose(scheduled, now)).toBe(now);
    expect(scheduled.toISOString()).toBe('2026-11-27T03:00:00.000Z');
  });

  it('rejects an invalid or excessively long reschedule window', () => {
    const valid = { opensAt: '2026-11-27T09:00:00+07:00', latestEntryAt: '2026-11-27T10:00:00+07:00',
      closesAt: '2026-11-27T10:00:00+07:00', reason: 'Perubahan jadwal panitia', version: 'a'.repeat(64) };
    expect(RescheduleExamSchema.safeParse(valid).success).toBe(true);
    expect(RescheduleExamSchema.safeParse({ ...valid, closesAt: '2026-11-27T23:00:00+07:00' }).success).toBe(false);
    expect(RescheduleExamSchema.safeParse({ ...valid, latestEntryAt: '2026-11-27T08:00:00+07:00' }).success).toBe(false);
  });
});
