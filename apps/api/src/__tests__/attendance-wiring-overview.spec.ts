import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { readSessionAttendanceOverview } from '../attendance/session-attendance-overview';
import { SessionAttendanceOverviewSchema } from '../attendance/student-session-attendance.dto';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import { ClassActivitiesService } from '../class-activities/class-activities.service';
import type { PrivateObjectStorageService } from '../storage/private-object-storage.service';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-10-19',
  now = new Date(date + 'T08:00:00Z');
const query = { academicYear: '2026/2027', semester: 1, from: date, to: date };
function fixture() {
  const row = {
    id: id(20),
    scheduleId: id(21),
    classId: id(22),
    subjectSnapshot: 'Matematika',
    jpStart: 1,
    jpEnd: 2,
    serviceDate: new Date(date),
    scheduledStartAt: new Date(date + 'T00:30:00Z'),
    scheduledEndAt: new Date(date + 'T01:50:00Z'),
    bellScheduleProfile: {
      segments: [
        { type: 'INSTRUCTION', jpNumber: 1, dayOfWeek: 0, startMinute: 450, endMinute: 490 },
        { type: 'INSTRUCTION', jpNumber: 2, dayOfWeek: 0, startMinute: 490, endMinute: 530 },
      ],
    },
    class: {
      students: [
        { id: id(1), joinedAt: new Date('2026-07-01') },
        { id: id(2), joinedAt: new Date('2026-07-01') },
      ],
    },
    studentAttendance: [
      { studentId: id(1), jp: 1, status: 'hadir' },
      { studentId: id(1), jp: 2, status: 'hadir' },
    ],
  };
  const db = {
    semester: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: id(3),
          number: 1,
          startDate: new Date('2026-07-13'),
          endDate: new Date('2026-12-19'),
          academicYear: { id: id(4), code: '2026/2027' },
        },
      ]),
    },
    classSession: { findMany: jest.fn().mockResolvedValue([row]) },
    academicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: {
      groupBy: jest.fn(() => {
        throw Error('Legacy daily attendance must not be read');
      }),
    },
  };
  const read = (extra = {}, authorized: Prisma.ClassSessionWhereInput = {}) =>
    readSessionAttendanceOverview(
      db as unknown as Prisma.TransactionClient,
      { ...query, ...extra },
      authorized,
      now,
    );
  return { db, row, read };
}
describe('JP aggregate producer: bounded, scoped and no daily conversion', () => {
  it('returns independent completion per owned daily session, without roster identities or daily reads', async () => {
    const f = fixture(),
      second = structuredClone(f.row);
    f.row.studentAttendance = [1, 2].flatMap((n) =>
      [1, 2].map((jp) => ({ studentId: id(n), jp, status: 'hadir' })),
    );
    second.id = id(23);
    second.scheduleId = id(24);
    f.db.classSession.findMany.mockResolvedValue([f.row, second]);
    const data = await f.read({ scope: 'own' }, { assignedTeacherId: id(30) });
    expect(data.sessionCompletion).toEqual([
      expect.objectContaining({
        sessionId: id(20),
        classId: id(22),
        expected: 4,
        recorded: 4,
        unknown: 0,
        complete: true,
      }),
      expect.objectContaining({
        sessionId: id(23),
        classId: id(22),
        expected: 4,
        recorded: 2,
        unknown: 2,
        complete: false,
      }),
    ]);
    expect(f.db.classSession.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      assignedTeacherId: id(30),
    });
    expect(f.db.classSession.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.attendance.groupBy).not.toHaveBeenCalled();
    expect(JSON.stringify(data.sessionCompletion)).not.toContain(id(1));
  });
  it('does not certify an empty roster or return session metadata for aggregate/long-range reads', async () => {
    const f = fixture();
    f.row.class.students = [];
    f.row.studentAttendance = [];
    expect((await f.read({ scope: 'own' })).sessionCompletion).toEqual([
      expect.objectContaining({ expected: 0, recorded: 0, complete: false }),
    ]);
    expect((await f.read()).sessionCompletion).toBeUndefined();
    expect((await f.read({ scope: 'own', from: '2026-10-18' })).sessionCompletion).toBeUndefined();
  });
  it('counts student-JP, preserving unknown rather than Alpha or zero percent', async () => {
    const { read, db } = fixture();
    const result = await read();
    expect(result.totals).toMatchObject({
      expected: 4,
      recorded: 2,
      unknown: 2,
      hadir: 2,
      alpha: 0,
      pct: null,
    });
    expect(result.days[0]).toMatchObject({ date, expected: 4, unknown: 2 });
    expect(db.attendance.groupBy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(id(1));
  });
  it('preserves a real 0 percent, and mixed statuses without converting to days', async () => {
    const f = fixture();
    f.row.studentAttendance = [1, 2].flatMap((n) =>
      [1, 2].map((jp) => ({ studentId: id(n), jp, status: 'alpha' })),
    );
    expect((await f.read()).totals).toMatchObject({ expected: 4, recorded: 4, unknown: 0, pct: 0 });
    f.row.studentAttendance[0]!.status = 'hadir';
    expect((await f.read()).totals.pct).toBe(25);
  });
  it('deduplicates co-teaching and makes a contradictory overlapping JP unknown', async () => {
    const f = fixture();
    const other = structuredClone(f.row);
    f.db.classSession.findMany.mockResolvedValue([f.row, other]);
    expect((await f.read()).totals.expected).toBe(4);
    other.studentAttendance[0]!.status = 'izin';
    expect((await f.read()).totals).toMatchObject({ recorded: 1, unknown: 3, pct: null });
  });
  it('keeps recorded historical students without inventing earlier membership', async () => {
    const f = fixture();
    f.row.class.students[1]!.joinedAt = new Date('2026-10-20');
    f.row.studentAttendance.push({ studentId: id(9), jp: 1, status: 'izin' });
    expect((await f.read()).totals).toMatchObject({ expected: 4, recorded: 3, unknown: 1 });
  });
  it('binds period, major and subject alongside authoritative object scope', async () => {
    const f = fixture();
    await f.read(
      { subject: 'Matematika', majorCode: 'AKL' },
      { assignedTeacherId: id(10), classId: id(11) },
    );
    expect(f.db.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { assignedTeacherId: id(10), classId: id(11) },
            expect.objectContaining({
              semesterId: id(3),
              subjectSnapshot: 'Matematika',
              class: { majorCode: 'AKL' },
            }),
          ],
        },
      }),
    );
  });
  it('rejects dates outside the configured semester, not using fixed July/January boundaries', async () => {
    await expect(fixture().read({ from: '2026-07-01' })).rejects.toThrow(BadRequestException);
  });
  it('fails closed on an ambiguous period, malformed slots or a truncated roster', async () => {
    const f = fixture();
    f.db.semester.findMany.mockResolvedValue([]);
    await expect(f.read()).rejects.toThrow(ConflictException);
    const g = fixture();
    g.row.bellScheduleProfile.segments = [];
    await expect(g.read()).rejects.toThrow(ConflictException);
    const h = fixture();
    h.row.class.students = Array.from({ length: 1001 }, (_, n) => ({
      id: id(n),
      joinedAt: new Date('2026-07-01'),
    }));
    await expect(h.read()).rejects.toThrow(ConflictException);
  });
  it('excludes configured holidays', async () => {
    const f = fixture();
    f.db.academicCalendar.findMany.mockResolvedValue([
      { startDate: new Date(date), endDate: new Date(date) },
    ]);
    expect((await f.read()).totals).toMatchObject({ expected: 0, recorded: 0, pct: null });
  });
  it.each([
    { semester: 'bad' },
    { from: '2026-02-30', to: date },
    { academicYear: '2026/2027' },
    { from: date },
    { scope: 'all' },
    { studentId: id(1) },
    { from: '2026-01-01', to: '2026-12-01' },
  ])('strict query rejects %j', (bad) => {
    expect(SessionAttendanceOverviewSchema.safeParse(bad).success).toBe(false);
  });
});

describe('JP overview service authorization', () => {
  function setup(role = 'GURU', positions: string[] = []) {
    const f = fixture();
    const db = {
      ...f.db,
      user: {
        findFirst: jest.fn().mockResolvedValue({ role }),
        findUnique: jest.fn().mockResolvedValue({ id: id(20), isActive: true, deletedAt: null }),
      },
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: id(10) }) },
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: id(4), code: '2026/2027' }]) },
      appointment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ majorId: id(21), major: { id: id(21), code: 'AKL' } }]),
      },
    };
    const permissions = {
      hasFreshPermission: jest.fn().mockResolvedValue(true),
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(positions)),
    };
    const prisma = { $transaction: (run: (tx: typeof db) => unknown) => run(db) };
    const service = new StudentSessionAttendanceReadService(
      prisma as unknown as PrismaService,
      permissions as unknown as PermissionsService,
    );
    const actor = { keycloakId: 'synthetic', roles: ['SUPER_ADMIN'] } as AuthUser;
    return { ...f, db, permissions, service, actor };
  }
  it('uses authoritative teacher role rather than caller elevated claims', async () => {
    const f = setup();
    await f.service.overview(query, f.actor);
    expect(f.db.classSession.findMany.mock.calls[0]![0].where.AND[0]).toEqual({
      assignedTeacherId: id(10),
    });
  });
  it('allows active KS operations, but scope own remains the actual teacher', async () => {
    const f = setup('GURU', ['KEPALA_SEKOLAH']);
    await f.service.overview(query, f.actor);
    expect(f.db.classSession.findMany.mock.calls[0]![0].where.AND[0]).toEqual({});
    await f.service.overview({ ...query, scope: 'own' }, f.actor);
    expect(f.db.classSession.findMany.mock.calls[1]![0].where.AND[0]).toEqual({
      assignedTeacherId: id(10),
    });
  });
  it('stops permission revocation before reading sessions', async () => {
    const f = setup();
    f.permissions.hasFreshPermission.mockResolvedValue(false);
    await expect(f.service.overview(query, f.actor)).rejects.toThrow(ForbiddenException);
    expect(f.db.classSession.findMany).not.toHaveBeenCalled();
  });
  it('keeps KAPROG appointment scope even when a different major is requested', async () => {
    const f = setup('GURU', ['KAPROG']);
    await f.service.overview({ ...query, majorCode: 'TKJ', teacherId: id(10) }, f.actor);
    const where = f.db.classSession.findMany.mock.calls[0]![0].where.AND;
    expect(where[0]).toMatchObject({
      academicYearId: id(4),
      assignedTeacherId: id(10),
      class: { isActive: true, academicYear: '2026/2027', majorCode: { in: ['AKL'] } },
    });
    expect(where[1]).toMatchObject({ class: { majorCode: 'TKJ' } });
    f.db.appointment.findMany.mockResolvedValue([]);
    await expect(f.service.overview(query, f.actor)).rejects.toThrow(ForbiddenException);
  });
  it.each(['SUPER_ADMIN', 'TATA_USAHA'])(
    '%s still binds requested object filters',
    async (role) => {
      const f = setup(role);
      await f.service.overview({ ...query, classId: id(11), teacherId: id(10) }, f.actor);
      expect(f.db.classSession.findMany.mock.calls[0]![0].where.AND[0]).toEqual({
        classId: id(11),
        assignedTeacherId: id(10),
      });
    },
  );
  it.each(['SISWA', 'ORANG_TUA', 'INDUSTRI'])(
    'rejects %s even with a stale permission claim',
    async (role) => {
      const f = setup(role);
      await expect(f.service.overview(query, f.actor)).rejects.toThrow(ForbiddenException);
    },
  );
});

describe('actual journal serializer contract', () => {
  it('exposes the authoritative teacherId required by the recap reader', async () => {
    const stored = {
      id: id(1),
      teacherId: id(2),
      classId: id(3),
      date: new Date(date),
      title: 'Synthetic journal',
      description: null,
      category: 'pembelajaran',
      photoUrl: null,
      createdAt: new Date(date),
      teacher: { id: id(2), user: { fullName: 'Synthetic teacher' } },
      class: { id: id(3), name: 'Synthetic class' },
    };
    const db = {
      classActivity: {
        findMany: jest.fn(async ({ select }: { select: Record<string, unknown> }) => [
          Object.fromEntries(
            Object.keys(select).map((key) => [key, stored[key as keyof typeof stored]]),
          ),
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ClassActivitiesService(
      db as unknown as PrismaService,
      {} as PrivateObjectStorageService,
    );
    const result = JSON.parse(
      JSON.stringify(
        await service.findAll({ page: 1, limit: 100 }, { roles: ['SUPER_ADMIN'] } as AuthUser),
      ),
    );
    expect(result.data[0].teacherId).toBe(id(2));
    expect(result.data[0].teacher.id).toBe(result.data[0].teacherId);
  });
});
