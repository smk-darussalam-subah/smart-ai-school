import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../permissions/permissions.guard';
import { StudentSessionAttendanceController } from '../attendance/student-session-attendance.controller';
import type { AuthUser } from '@smk/auth';
import type { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { AcademicPeriodService } from '../academic-period/academic-period.service';
import type { NotificationService } from '../notification/notification.service';
import { StudentSessionAttendanceService } from '../attendance/student-session-attendance.service';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import { LearnerSessionAttendanceSchema } from '../attendance/student-session-attendance.dto';
import { studentAttendanceNoticeTarget } from '../common/helpers/student-session-notification';

const id = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const auth = (role: 'SISWA' | 'ORANG_TUA' | 'GURU'): AuthUser => ({
  keycloakId: id(1),
  username: 'synthetic',
  email: 'qa@example.invalid',
  fullName: 'Akun sintetis',
  roles: [role],
});
const range = { from: '2026-10-01', to: '2026-10-22' };
function learnerFixture(role: 'SISWA' | 'ORANG_TUA' = 'SISWA') {
  const db = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: id(1), role }) },
    student: {
      findFirst: jest.fn().mockResolvedValue({
        id: id(2),
        classId: id(3),
        joinedAt: new Date('2026-07-01'),
        status: 'active',
      }),
    },
    classSession: { findMany: jest.fn().mockResolvedValue([]) },
    subject: { findMany: jest.fn().mockResolvedValue([]) },
    academicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
  const permissions = { hasFreshPermission: jest.fn().mockResolvedValue(true) };
  const periodValue = {
    semesterId: id(4),
    academicYear: '2026/2027',
    semester: 1,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-12-31'),
  };
  const period = {
    getActivePeriod: jest.fn().mockResolvedValue(periodValue),
    findPeriodByCodeAndSemester: jest.fn().mockResolvedValue(periodValue),
  };
  const service = new StudentSessionAttendanceService(
    db as unknown as PrismaService,
    permissions as unknown as PermissionsService,
    period as unknown as AcademicPeriodService,
    {} as NotificationService,
  );
  return { db, permissions, period, service };
}

describe('learning remediation: learner JP and notice authority', () => {
  it.each(['SISWA', 'ORANG_TUA'] as const)(
    'uses the existing scoped permission for %s, not global attendance permission',
    async (role) => {
      const { db, permissions, service } = learnerFixture(role);
      const result = await service.learner(
        { ...range, ...(role === 'ORANG_TUA' ? { studentId: id(2) } : {}) },
        auth(role),
      );
      expect(result).toMatchObject({
        studentId: id(2),
        academicYear: '2026/2027',
        semester: 1,
        totals: { pct: null, unknown: 0 },
      });
      expect(permissions.hasFreshPermission).toHaveBeenCalledWith(
        id(1),
        role === 'SISWA' ? 'attendance.own.read' : 'attendance.child.read',
        db,
      );
      expect(db.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(
            role === 'SISWA' ? { userId: id(1) } : { parentId: id(1), id: id(2) },
          ),
        }),
      );
    },
  );
  it.each(['SISWA', 'ORANG_TUA'] as const)(
    'fresh scoped revocation for %s is not bypassed by another read grant',
    async (role) => {
      const { permissions, service, db } = learnerFixture(role);
      permissions.hasFreshPermission.mockImplementation(
        async (_key: string, code: string) => code === 'academic.attendance.read',
      );
      await expect(
        service.learner({ ...range, studentId: id(2) }, auth(role)),
      ).rejects.toMatchObject({ status: 403 });
      expect(db.classSession.findMany).not.toHaveBeenCalled();
    },
  );
  it.each(['SISWA', 'ORANG_TUA'] as const)(
    'rejects a different student/revoked family relation for %s before reading sessions',
    async (role) => {
      const { db, service } = learnerFixture(role);
      db.student.findFirst.mockResolvedValue(null);
      await expect(
        service.learner({ ...range, studentId: id(9) }, auth(role)),
      ).rejects.toMatchObject({ status: 403 });
      expect(db.classSession.findMany).not.toHaveBeenCalled();
    },
  );
  it('requires an explicit child and an active actor', async () => {
    const { db, service } = learnerFixture('ORANG_TUA');
    await expect(service.learner(range, auth('ORANG_TUA'))).rejects.toMatchObject({ status: 403 });
    db.user.findFirst.mockResolvedValue(null);
    await expect(
      service.learner({ ...range, studentId: id(2) }, auth('ORANG_TUA')),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('binds the selected period rather than selecting among overlapping dates', async () => {
    const { db, period, service } = learnerFixture();
    await service.learner({ ...range, academicYear: '2026/2027', semester: 1 }, auth('SISWA'));
    expect(period.getActivePeriod).not.toHaveBeenCalled();
    expect(period.findPeriodByCodeAndSemester).toHaveBeenCalledWith('2026/2027', 1, db);
    expect(db.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ semesterId: id(4) }) }),
    );
    await expect(
      service.learner(
        { from: '2026-06-30', to: range.to, academicYear: '2026/2027', semester: 1 },
        auth('SISWA'),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects partial period selections and invalid semester numbers at the HTTP DTO boundary', () => {
    expect(
      LearnerSessionAttendanceSchema.safeParse({ ...range, academicYear: '2026/2027' }).success,
    ).toBe(false);
    expect(LearnerSessionAttendanceSchema.safeParse({ ...range, semester: 1 }).success).toBe(false);
    expect(
      LearnerSessionAttendanceSchema.safeParse({
        ...range,
        academicYear: '2026/2027',
        semester: '1',
      }).success,
    ).toBe(true);
    expect(
      LearnerSessionAttendanceSchema.safeParse({ ...range, academicYear: '2026/2027', semester: 3 })
        .success,
    ).toBe(false);
  });
  it('notice targets use child permission and still reject stale attendance and revoked ownership', async () => {
    const records = [{ jp: 1, status: 'alpha', notes: null, revision: 1 }];
    const hash = createHash('sha256')
      .update(JSON.stringify(records.map((r) => [r.jp, r.status, r.notes, r.revision])))
      .digest('hex')
      .slice(0, 24);
    const db = {
      student: { findFirst: jest.fn().mockResolvedValue({ parent: { keycloakId: id(1) } }) },
      classSession: {
        findFirst: jest.fn().mockResolvedValue({
          serviceDate: new Date('2026-10-22'),
          academicYear: { code: '2026/2027' },
          semester: { number: 1 },
        }),
      },
      studentSessionAttendance: { findMany: jest.fn().mockResolvedValue(records) },
    };
    const permission = jest
      .spyOn(PermissionsService.prototype, 'hasFreshPermission')
      .mockResolvedValue(true);
    const log = { recipient: id(1), refId: `${id(2)}:${id(3)}:${hash}` };
    try {
      expect(await studentAttendanceNoticeTarget(db as unknown as PrismaService, log)).toContain(
        'studentId=' + id(2),
      );
      expect(permission).toHaveBeenCalledWith(id(1), 'attendance.child.read', db);
      records[0]!.revision++;
      expect(await studentAttendanceNoticeTarget(db as unknown as PrismaService, log)).toBeNull();
      records[0]!.revision--;
      permission.mockResolvedValue(false);
      expect(await studentAttendanceNoticeTarget(db as unknown as PrismaService, log)).toBeNull();
      permission.mockResolvedValue(true);
      db.student.findFirst.mockResolvedValue(null);
      expect(await studentAttendanceNoticeTarget(db as unknown as PrismaService, log)).toBeNull();
    } finally {
      permission.mockRestore();
    }
  });
});

function auditFixture() {
  const session = {
    id: id(5),
    assignedTeacherId: id(6),
    classId: id(3),
    semesterId: id(4),
    serviceDate: new Date('2026-10-22'),
    subjectSnapshot: 'Matematika',
    scheduledStartAt: new Date('2026-10-22T00:00:00Z'),
    scheduledEndAt: new Date('2026-10-22T01:20:00Z'),
    bellScheduleProfile: {
      segments: [1, 2].map((jp, i) => ({
        type: 'INSTRUCTION',
        jpNumber: jp,
        dayOfWeek: 0,
        startMinute: 420 + i * 40,
        endMinute: 460 + i * 40,
      })),
    },
  };
  const db = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: id(1), role: 'GURU' }) },
    classSession: { findFirst: jest.fn().mockResolvedValue(session) },
    teacher: { findFirst: jest.fn().mockResolvedValue({ id: id(6) }) },
    student: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: id(2), nis: 'QA-01', user: { fullName: 'Siswa sintetis' } }]),
    },
    studentSessionAttendance: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { studentId: id(2), jp: 1, status: 'hadir', notes: null, revision: 1 },
        ]),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
  const permissions = {
    hasFreshPermission: jest.fn().mockResolvedValue(true),
    getActivePositionCodes: jest.fn().mockResolvedValue(new Set()),
  };
  const service = new StudentSessionAttendanceReadService(
    db as unknown as PrismaService,
    permissions as unknown as PermissionsService,
  );
  return { db, permissions, service, session };
}
describe('learning remediation: read-only recap JP', () => {
  it('rejects an oversized roster instead of presenting a truncated audit', async () => {
    const { service, db } = auditFixture();
    db.student.findMany.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: id(100 + index),
        nis: `QA${index}`,
        user: { fullName: 'Sintetis' },
      })),
    );
    await expect(service.read(id(5), {}, auth('GURU'))).rejects.toMatchObject({ status: 409 });
  });
  it('uses personal predicate even for Guru with leadership and leaves unknown JP unfilled', async () => {
    const { service, db, permissions } = auditFixture();
    permissions.getActivePositionCodes.mockResolvedValue(new Set(['KEPALA_SEKOLAH']));
    const result = await service.read(id(5), { scope: 'own' }, auth('GURU'));
    expect(db.classSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: id(5) }, { assignedTeacherId: id(6) }] } }),
    );
    expect(result.slots).toHaveLength(2);
    expect(result.records).toHaveLength(1);
    expect(result.students[0]?.name).toBe('Siswa sintetis');
  });
  it('does not trust a stale leadership claim, and denies an out-of-scope session', async () => {
    const { service, db } = auditFixture();
    db.classSession.findFirst.mockResolvedValue(null);
    await expect(
      service.read(id(5), {}, { ...auth('GURU'), roles: ['GURU', 'KEPALA_SEKOLAH'] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.classSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: id(5) }, { assignedTeacherId: id(6) }] } }),
    );
    expect(db.studentSessionAttendance.findMany).not.toHaveBeenCalled();
  });
  it('fresh permission revocation prevents even a scoped read', async () => {
    const { service, db, permissions } = auditFixture();
    permissions.hasFreshPermission.mockResolvedValue(false);
    await expect(service.read(id(5), {}, auth('GURU'))).rejects.toMatchObject({ status: 403 });
    expect(db.classSession.findFirst).not.toHaveBeenCalled();
  });
  it('reassigned sessions cannot match the single scoped snapshot query', async () => {
    const { service, db } = auditFixture();
    db.classSession.findFirst.mockResolvedValue(null);
    await expect(service.read(id(5), {}, auth('GURU'))).rejects.toMatchObject({ status: 403 });
    expect(db.studentSessionAttendance.findMany).not.toHaveBeenCalled();
  });
});

describe('production controller permission metadata through the real global guard', () => {
  function fixture(method: 'learner' | 'read', code: string | null, user: AuthUser | null) {
    const permissions = {
      hasPermission: jest.fn(
        async (_id: string, _roles: string[], required: string) => required === code,
      ),
    };
    const context = {
      getHandler: () => StudentSessionAttendanceController.prototype[method],
      getClass: () => StudentSessionAttendanceController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    return {
      guard: new PermissionGuard(new Reflector(), permissions as unknown as PermissionsService),
      context,
    };
  }
  it.each([
    ['SISWA', 'attendance.own.read'],
    ['ORANG_TUA', 'attendance.child.read'],
  ] as const)('scoped %s permission passes the actual summary decorator', async (role, code) => {
    const { guard, context } = fixture('learner', code, auth(role));
    expect(await guard.canActivate(context)).toBe(true);
  });
  it('global attendance alone cannot satisfy the learner route', async () => {
    const { guard, context } = fixture('learner', 'academic.attendance.read', auth('SISWA'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
  it('audit needs class-session read permission, not attendance write', async () => {
    const { guard, context } = fixture('read', 'academic.attendance.create', auth('GURU'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
  it('a missing authenticated actor is denied', async () => {
    const { guard, context } = fixture('learner', 'attendance.child.read', null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
});
