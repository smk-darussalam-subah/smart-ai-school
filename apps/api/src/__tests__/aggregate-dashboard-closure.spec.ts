import { AnalyticsService } from '../analytics/analytics.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SchoolConfigService } from '../school-config/school-config.service';
import type { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';

describe('Aggregate scope and period closure', () => {
  const period = {
    id: 'sem2',
    number: 2,
    startDate: new Date('2026-01-07'),
    endDate: new Date('2026-06-19'),
    academicYear: { id: 'previous', code: '2025/2026' },
  };
  const db = {
    grade: { findMany: jest.fn(), groupBy: jest.fn() },
    attendance: { groupBy: jest.fn() },
    semester: { findMany: jest.fn() },
    kktpConfig: { findUnique: jest.fn() },
    student: { count: jest.fn() },
    teachingAssignment: { findMany: jest.fn() },
    rpp: { groupBy: jest.fn() },
  };
  const school = { getActiveSemester: jest.fn(), getActiveAcademicYear: jest.fn() };
  const staff = { report: jest.fn() };
  const service = new AnalyticsService(
    db as unknown as PrismaService,
    school as unknown as SchoolConfigService,
    staff as unknown as StaffAttendanceService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.grade.findMany.mockResolvedValue([]);
    db.grade.groupBy.mockResolvedValue([]);
    db.attendance.groupBy.mockResolvedValue([]);
    db.semester.findMany.mockResolvedValue([period]);
    db.kktpConfig.findUnique.mockResolvedValue(null);
    db.student.count.mockResolvedValue(30);
    db.teachingAssignment.findMany.mockResolvedValue([{ teacherId: 'teacher' }]);
    staff.report.mockResolvedValue({
      teacherSummary: {
        total: 14,
        present: 0,
        inside: 0,
        unknown: 0,
        dueRequired: 0,
        presentRequired: 0,
      },
    });
  });
  it.each(['AKL', 'FOREIGN'])(
    'keeps class and major intersection for %s, including a contradictory pair',
    async (majorCode) => {
      await service.grades({
        academicYear: '2025/2026',
        semester: 2,
        classId: 'class-akl',
        majorCode,
      });
      const expected = { classId: 'class-akl', class: { majorCode } };
      expect(db.grade.findMany.mock.calls[0][0].where.assignment).toEqual(expected);
      expect(db.grade.groupBy.mock.calls[0][0].where.assignment).toEqual(expected);
      expect(db.attendance.groupBy.mock.calls[0][0].where).toEqual({
        date: { gte: period.startDate, lte: period.endDate },
        classId: 'class-akl',
        class: { academicYear: '2025/2026', majorCode },
      });
    },
  );
  it('reads the selected official semester, never the active school year', async () => {
    const result = await service.grades({ academicYear: '2025/2026', semester: 2 });
    expect(db.semester.findMany.mock.calls[0][0].where).toEqual({
      number: 2,
      academicYear: { code: '2025/2026' },
    });
    expect(result.correlation.basis).toEqual({
      unit: 'student_daily',
      from: '2026-01-07',
      to: '2026-06-19',
    });
    expect(school.getActiveAcademicYear).not.toHaveBeenCalled();
  });
  it('does not silently invent an attendance period', async () => {
    db.semester.findMany.mockResolvedValue([]);
    await expect(service.grades({ academicYear: '2025/2026', semester: 2 })).rejects.toThrow(
      'Periode kehadiran',
    );
    expect(db.attendance.groupBy).not.toHaveBeenCalled();
  });
  it('keeps future periods empty instead of querying a reversed date window', async () => {
    db.semester.findMany.mockResolvedValue([
      { ...period, startDate: new Date('2099-01-07'), endDate: new Date('2099-06-19') },
    ]);
    expect(
      (await service.grades({ academicYear: '2098/2099', semester: 2 })).correlation,
    ).toMatchObject({ n: 0, points: [], basis: { to: null } });
    expect(db.attendance.groupBy).not.toHaveBeenCalled();
  });
  it('counts operational students in the same selected year/major as teacher assignments', async () => {
    const result = await service.teacherCompliance(
      { academicYear: '2025/2026', semester: 2, majorCode: 'AKL' },
      false,
      true,
      true,
    );
    expect(result).toMatchObject({
      totalTeachers: 14,
      studentsActive: 30,
      scope: { academicYear: '2025/2026', semester: 2, majorCode: 'AKL' },
    });
    expect(db.student.count.mock.calls[0][0].where).toEqual({
      status: 'active',
      deletedAt: null,
      user: { isActive: true, deletedAt: null },
      class: { isActive: true, academicYear: '2025/2026', majorCode: 'AKL' },
    });
  });
  it('does not read students without student.read capability', async () => {
    expect(
      (await service.teacherCompliance({ academicYear: '2025/2026', semester: 2 })).studentsActive,
    ).toBeNull();
    expect(db.student.count).not.toHaveBeenCalled();
  });
});
