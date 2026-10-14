import {
  readSchedulingMonitoring,
  type MonitoringCapabilities,
} from '../analytics/scheduling-dashboard';
import type { PrismaService } from '../prisma/prisma.service';
const all: MonitoringCapabilities = {
  assignments: true,
  attendance: true,
  journal: true,
  schedules: true,
  sessions: true,
  lms: true,
};
const now = new Date('2026-10-13T04:00:00Z'),
  query = { academicYear: '2026/2027', semester: 1 };
const assignment = (id = 'a1', subject = 'Matematika') => ({
  id,
  teacherId: 't1',
  classId: 'c1',
  subject,
  hoursPerWeek: 4,
  teacher: { user: { fullName: 'Guru Sintetis' } },
  class: { name: 'Kelas Sintetis' },
  grades: [{ score: '80' }, { score: '70' }],
});
function fixture() {
  return {
    semester: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
      }),
    },
    teachingAssignment: { findMany: jest.fn().mockResolvedValue([assignment()]) },
    attendance: {
      groupBy: jest.fn().mockResolvedValue([
        { classId: 'c1', status: 'hadir', _count: { _all: 18 } },
        { classId: 'c1', status: 'alpha', _count: { _all: 2 } },
      ]),
    },
    classActivity: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ teacherId: 't1', classId: 'c1', _count: { _all: 3 } }]),
    },
    schedule: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ teachingAssignmentId: 'a1', dayOfWeek: 2, jpStart: 1, jpEnd: 4 }]),
    },
    bellScheduleProfile: {
      findMany: jest.fn().mockResolvedValue([
        {
          effectiveFrom: new Date('2026-01-01'),
          effectiveUntil: null,
          segments: Array.from({ length: 4 }, (_, index) => ({
            dayOfWeek: 0,
            type: 'INSTRUCTION',
            jpNumber: index + 1,
            startMinute: 420 + index * 40,
            endMinute: 460 + index * 40,
            sortOrder: index,
          })),
        },
      ]),
    },
    classSession: {
      groupBy: jest.fn().mockResolvedValue(
        ['COMPLETED', 'STARTED', 'MISSED', 'CANCELLED', 'SUPERSEDED'].map((status) => ({
          assignedTeacherId: 't1',
          classId: 'c1',
          teachingAssignmentId: 'a1',
          status,
          _count: { _all: 1 },
        })),
      ),
    },
    lmsModule: {
      findMany: jest.fn().mockResolvedValue([
        {
          teacherId: 't1',
          classId: 'c1',
          subject: 'Matematika',
          progress: [{ status: 'completed' }, { status: 'active' }],
        },
      ]),
    },
    kktpConfig: { findUnique: jest.fn().mockResolvedValue({ kktp: 80 }) },
  };
}
describe('scheduling/dashboard integration', () => {
  it('binds identities, official KKTP and metric units without synthetic JP attendance', async () => {
    const db = fixture(),
      result = await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now);
    expect(result.data[0]).toMatchObject({
      assignmentId: 'a1',
      teacherId: 't1',
      classId: 'c1',
      gradeCount: 2,
      passedGradeCount: 1,
      tuntasPct: 50,
      kktp: 80,
      kktpProvenance: 'config',
      jurnalCount: 3,
      journalScope: 'teacher_class',
      hadirPct: 90,
      scheduledJp: 4,
      sessions: {
        due: 3,
        completed: 1,
        active: 1,
        missed: 1,
        cancelled: 1,
        superseded: 1,
        unit: 'materialized_due_sessions',
      },
      attendance: { unit: 'daily_class_records', recorded: 20, present: 18 },
      lms: { completed: 1, recorded: 2 },
    });
    expect(db.classSession.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ semesterId: 's1', scheduledStartAt: { lte: now } }),
      }),
    );
  });
  it('missing grades and attendance are unknown, not zero-percent failure', async () => {
    const db = fixture();
    db.teachingAssignment.findMany.mockResolvedValue([{ ...assignment(), grades: [] }]);
    db.attendance.groupBy.mockResolvedValue([]);
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now)).data[0],
    ).toMatchObject({ tuntasPct: null, avg: null, status: 'unknown', hadirPct: null });
  });
  it('journal identity is teacher/class with a bounded configured window', async () => {
    const db = fixture();
    db.teachingAssignment.findMany.mockResolvedValue([assignment(), assignment('a2', 'Fisika')]);
    const result = await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now);
    expect(result.data.map((row) => row.jurnalCount)).toEqual([3, 3]);
    expect(db.classActivity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['teacherId', 'classId'],
        where: expect.objectContaining({
          date: { gte: new Date('2026-07-01'), lt: new Date('2026-10-14') },
        }),
      }),
    );
  });
  it('default capabilities deny before database reads', async () => {
    const db = fixture();
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, undefined, now)).state,
    ).toBe('denied');
    expect(db.semester.findFirst).not.toHaveBeenCalled();
    expect(db.teachingAssignment.findMany).not.toHaveBeenCalled();
  });
  it.each(['attendance', 'journal', 'schedules', 'sessions', 'lms'] as const)(
    'does not read revoked domain %s',
    async (key) => {
      const db = fixture(),
        result = await readSchedulingMonitoring(
          db as unknown as PrismaService,
          query,
          { ...all, [key]: false },
          now,
        );
      const methods = {
        attendance: db.attendance.groupBy,
        journal: db.classActivity.groupBy,
        schedules: db.schedule.findMany,
        sessions: db.classSession.groupBy,
        lms: db.lmsModule.findMany,
      };
      expect(methods[key]).not.toHaveBeenCalled();
      expect(result.domains).toHaveProperty(key, 'denied');
    },
  );
  it('isolates domain failure without substituting zero', async () => {
    const db = fixture();
    db.attendance.groupBy.mockRejectedValue(new Error('synthetic outage'));
    const result = await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now);
    expect(result.domains).toMatchObject({ attendance: 'unavailable', journal: 'ready' });
    expect(result.data[0]?.attendance.recorded).toBeNull();
  });
  it('semester 2 uses the following calendar year, never a guessed July–December window', async () => {
    const db = fixture();
    db.semester.findFirst.mockResolvedValue({
      id: 's2',
      startDate: new Date('2027-01-04'),
      endDate: new Date('2027-06-30'),
    });
    const result = await readSchedulingMonitoring(
      db as unknown as PrismaService,
      { ...query, semester: 2 },
      all,
      new Date('2027-02-01T03:00:00Z'),
    );
    expect(result.window).toMatchObject({ from: '2027-01-04', to: '2027-02-01' });
  });
  it('does not attach today attendance to a future semester', async () => {
    const db = fixture();
    db.semester.findFirst.mockResolvedValue({
      id: 'future',
      startDate: new Date('2027-01-04'),
      endDate: new Date('2027-06-30'),
    });
    const result = await readSchedulingMonitoring(
      db as unknown as PrismaService,
      { ...query, semester: 2 },
      all,
      now,
    );
    expect(result.window).toBeNull();
    expect(db.attendance.groupBy).not.toHaveBeenCalled();
    expect(result.data[0]?.hadirPct).toBeNull();
  });
  it('binds every filter at the source and echoes it for stale-response rejection', async () => {
    const db = fixture(),
      filters = { classId: 'c1', teacherId: 't1', subject: 'Matematika', majorCode: 'TKJ' };
    const result = await readSchedulingMonitoring(
      db as unknown as PrismaService,
      { ...query, ...filters },
      all,
      now,
    );
    expect(db.teachingAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academicYear: query.academicYear,
          classId: 'c1',
          teacherId: 't1',
          subject: 'Matematika',
          class: { majorCode: 'TKJ' },
        },
      }),
    );
    expect(result.filters).toEqual(filters);
  });
  it('refuses oversized scope and missing configured periods', async () => {
    const db = fixture();
    db.teachingAssignment.findMany.mockResolvedValue(
      Array.from({ length: 5001 }, (_, i) => assignment(String(i))),
    );
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now)).state,
    ).toBe('unavailable');
    expect(db.schedule.findMany).not.toHaveBeenCalled();
    db.semester.findFirst.mockResolvedValue(null);
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now)).reason,
    ).toContain('Periode');
  });
  it('does not certify stored JP outside the canonical instructional bell pattern', async () => {
    const db = fixture();
    db.schedule.findMany.mockResolvedValue([
      { teachingAssignmentId: 'a1', dayOfWeek: 2, jpStart: 1, jpEnd: 5 },
    ]);
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now)).data[0]
        ?.scheduledJp,
    ).toBeNull();
    db.bellScheduleProfile.findMany.mockRejectedValue(new Error('synthetic missing coverage'));
    expect(
      (await readSchedulingMonitoring(db as unknown as PrismaService, query, all, now)).data[0]
        ?.scheduledJp,
    ).toBeNull();
  });
});
