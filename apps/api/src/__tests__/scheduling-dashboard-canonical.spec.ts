import type { AuthUser } from '@smk/auth';
import { AnalyticsService } from '../analytics/analytics.service';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { AttendanceQuerySchema } from '../staff-attendance/staff-attendance.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import type { PermissionsService } from '../permissions/permissions.service';
import type { SchoolConfigService } from '../school-config/school-config.service';
const year = '2026/2027',
  date = '2026-10-13';
describe('canonical staff presence aggregation', () => {
  function fixture() {
    const employees = Array.from({ length: 101 }, (_, i) => ({
      id: `u${i + 1}`,
      fullName: `Guru ${String(i + 1).padStart(3, '0')}`,
      createdAt: new Date('2026-01-01'),
      role: 'GURU',
      teacher: { id: `t${i + 1}` },
      staff: null,
    }));
    const db = {
      schoolProfile: {
        findFirst: jest.fn().mockResolvedValue({
          attendanceMode: 'REVIEW',
          attendanceWorkingDays: [1, 2, 3, 4, 5, 6],
          attendanceStartMinute: 420,
          attendanceEndMinute: 900,
          attendanceTeacherLeadMin: 0,
          attendanceTeacherLeadTarget: 0,
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue(employees) },
      staffAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'canonical',
            userId: 'u2',
            date: new Date(date),
            checkInAt: new Date(`${date}T00:05:00Z`),
            checkOutAt: new Date(`${date}T06:00:00Z`),
            arrivalBasis: 'TEACHING',
            expectedArrivalAt: new Date(`${date}T00:00:00Z`),
            recommendedArrivalAt: null,
            firstTeachingAt: new Date(`${date}T00:00:00Z`),
            locationInStatus: 'INSIDE',
            locationOutStatus: 'INSIDE',
          },
        ]),
      },
      academicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([{ staff: { userId: 'u1' } }]) },
      semester: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 's1', number: 1, academicYear: { code: year } }]),
      },
      schedule: {
        findMany: jest.fn().mockResolvedValue(
          employees.slice(1, 100).map((e) => ({
            jpStart: 1,
            jpEnd: 2,
            concurrencyGroup: null,
            teachingAssignment: { teacherId: e.teacher.id },
          })),
        ),
      },
    };
    const bell = {
      resolveForDate: jest.fn().mockResolvedValue({}),
      resolveInstructionWindow: jest
        .fn()
        .mockReturnValue({ startAt: new Date(`${date}T00:00:00Z`) }),
    };
    const service = new StaffAttendanceService(
      db as unknown as PrismaService,
      bell as unknown as BellScheduleService,
      {} as PermissionsService,
    );
    return { db, bell, service };
  }
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(`${date}T08:00:00Z`));
  });
  afterEach(() => jest.useRealTimers());
  it('aggregates all 101 teachers before page/search filtering and honors principal exemption', async () => {
    const { service } = fixture();
    const report = await service.report(
      AttendanceQuerySchema.parse({
        from: date,
        to: date,
        limit: 1,
        search: 'Guru 002',
        unit: 'TEACHER',
      }),
    );
    expect(report.data).toHaveLength(1);
    expect(report.total).toBe(1);
    expect(report.teacherSummary).toMatchObject({
      total: 101,
      present: 1,
      inside: 1,
      required: 99,
      late: 1,
      absent: 98,
      notRequired: 1,
      notScheduled: 1,
      unknown: 0,
    });
    expect(JSON.stringify(report.teacherSummary)).not.toMatch(/latitude|longitude|fullName|latIn/);
  });
  it('unknown bell/schedule authority cannot create absent or late counts', async () => {
    const { service, bell } = fixture();
    bell.resolveForDate.mockRejectedValue(new Error('synthetic unavailable'));
    const report = await service.report(
      AttendanceQuerySchema.parse({ from: date, to: date, limit: 1 }),
    );
    expect(report.teacherSummary).toMatchObject({
      total: 101,
      present: 1,
      notRequired: 1,
      absent: 0,
      unknown: 99,
    });
  });
  it('teacher-filter scope is bound at the employee database query', async () => {
    const { service, db } = fixture();
    await service.report(AttendanceQuerySchema.parse({ from: date, to: date }), ['t2']);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacher: { is: { id: { in: ['t2'] }, deletedAt: null } },
        }),
      }),
    );
  });
});
describe('legacy grade-summary consumer cannot manufacture CP attainment', () => {
  function fixture() {
    const db = {
      semester: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      teacher: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student1' }) },
      grade: {
        findMany: jest.fn().mockResolvedValue([
          {
            score: 80,
            type: 'uh',
            studentId: 'student1',
            assignment: {
              subject: 'Matematika',
              classId: 'c1',
              class: { name: 'Kelas sintetis' },
            },
          },
        ]),
      },
      kktpConfig: { findUnique: jest.fn().mockResolvedValue({ kktp: 85 }) },
      rpp: { findMany: jest.fn() },
    };
    const service = new AnalyticsService(
      db as unknown as PrismaService,
      {} as SchoolConfigService,
      {} as StaffAttendanceService,
    );
    return { db, service };
  }
  it('returns honest NA/pass-rate, never proxies grades into CP or reads RPP under a grade-only permission', async () => {
    const { db, service } = fixture();
    const result = await service.cpProgress({ academicYear: year, semester: 1 }, {
      roles: ['SUPER_ADMIN'],
    } as AuthUser);
    expect(result).toMatchObject({
      cpBreakdown: [],
      cpState: 'unavailable',
      mapelProgress: [{ mapel: 'Matematika', na: 80, progres: 0, kktp: 85, tuntas: 0, total: 1 }],
    });
    expect(db.rpp.findMany).not.toHaveBeenCalled();
  });
  it.each(['GURU', 'SISWA'])(
    'binds %s ownership and selected class simultaneously at storage',
    async (role) => {
      const { db, service } = fixture();
      await service.cpProgress({ academicYear: year, semester: 1, classId: 'c2' }, {
        roles: [role],
        keycloakId: 'synthetic',
      } as AuthUser);
      expect(db.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academicYear: year,
            semester: 1,
            assignment: role === 'GURU' ? { classId: 'c2', teacherId: 't1' } : { classId: 'c2' },
            ...(role === 'SISWA' ? { studentId: 'student1' } : {}),
          }),
        }),
      );
    },
  );
  it('does not infer an academic period from the current clock', async () => {
    const { db, service } = fixture();
    db.semester.findFirst.mockResolvedValue(null);
    await expect(
      service.cpProgress({ academicYear: year, semester: 2 }, {
        roles: ['SUPER_ADMIN'],
      } as AuthUser),
    ).rejects.toThrow('Periode');
    expect(db.grade.findMany).not.toHaveBeenCalled();
  });
});
