import type { AuthUser } from '@smk/auth';
import { StudentAnalyticsService } from '../analytics/analytics.service';
import { StudentDashboardService } from '../student-dashboard/student-dashboard.service';
import { StudentDashboardController } from '../student-dashboard/student-dashboard.controller';
import { PrismaService } from '../prisma/prisma.service';
import { naOf } from '../analytics/analytics.math';
import { AttendanceService } from '../attendance/attendance.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AcademicPeriodService } from '../academic-period/academic-period.service';

const parent = { keycloakId: 'parent', roles: ['ORANG_TUA'] } as AuthUser;
const child = (id: string) => ({
  id,
  nis: id,
  classId: `class-${id}`,
  class: { name: id },
  user: { fullName: `Synthetic ${id}` },
});
const db = () => ({
  user: { findUnique: jest.fn().mockResolvedValue({ id: 'parent-user' }) },
  student: { findMany: jest.fn().mockResolvedValue([child('a'), child('b')]) },
  teachingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  grade: { findMany: jest.fn().mockResolvedValue([]) },
  attendance: { findMany: jest.fn().mockResolvedValue([]) },
  lmsModuleProgress: { findMany: jest.fn().mockResolvedValue([]) },
  kktpConfig: { findUnique: jest.fn().mockResolvedValue({ kktp: 80 }) },
});

describe('Cross-role dashboard impact: real services, synthetic repository', () => {
  it.each([
    [{ uh: 100, sikap: 40 }, 74.3],
    [{ uh: 100, uts: 70 }, 85],
    [{ uh: 79.6 }, 79.6],
    [{ uh: 0 }, 0],
    [{}, null],
  ])('uses one-decimal official NA for %j', (values, expected) =>
    expect(naOf(values)).toBe(expected),
  );

  it.each(['getTeachers', 'getTimeline'] as const)(
    '%s binds the selected second child',
    async (method) => {
      const prisma = db(),
        service = new StudentDashboardService(prisma as unknown as PrismaService);
      await service[method](parent, 'b');
      if (method === 'getTeachers')
        expect(prisma.teachingAssignment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { classId: 'class-b' } }),
        );
      else
        for (const model of [prisma.grade, prisma.attendance, prisma.lmsModuleProgress])
          expect(model.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ studentId: 'b' }) }),
          );
    },
  );
  it.each(['getTeachers', 'getTimeline'] as const)(
    '%s refuses foreign or ambiguous child, without domain query',
    async (method) => {
      const prisma = db(),
        service = new StudentDashboardService(prisma as unknown as PrismaService);
      await expect(service[method](parent, 'foreign')).rejects.toThrow('kewenangan');
      await expect(service[method](parent)).rejects.toThrow('kewenangan');
      expect(prisma.teachingAssignment.findMany).not.toHaveBeenCalled();
      expect(prisma.grade.findMany).not.toHaveBeenCalled();
    },
  );
  it('keeps single-child compatibility and controller validation', async () => {
    const prisma = db();
    prisma.student.findMany.mockResolvedValue([child('b')]);
    const service = new StudentDashboardService(prisma as unknown as PrismaService);
    await service.getTeachers(parent);
    const controller = new StudentDashboardController(service);
    expect(() => controller.getTeachers(parent, { studentId: 'invalid' })).toThrow('tidak valid');
    expect(() => controller.getTimeline(parent, { studentId: ['a', 'b'] })).toThrow('tidak valid');
  });
  it.each([
    [95, 75, 50],
    [95, 85, 100],
    [75, 65, 0],
    [79.6, 80, 50],
  ])('learner NA/KKTP agree with per-student class result %i/%i', async (a, b, pct) => {
    const prisma = db();
    prisma.grade.findMany.mockResolvedValue([
      { studentId: 'a', score: a, type: 'uh', assignment: { subject: 'Bahasa Indonesia' } },
      { studentId: 'a', score: a, type: 'uh', assignment: { subject: 'Bahasa Indonesia' } },
      { studentId: 'b', score: b, type: 'uh', assignment: { subject: 'Bahasa Indonesia' } },
    ] as never);
    const result = await new StudentAnalyticsService(
      prisma as unknown as PrismaService,
    ).studentGrades({ academicYear: '2026/2027', semester: 1 }, parent);
    const rows = result.data.flatMap((item) => item.subjects);
    expect(rows.map((row) => row.na)).toEqual([a, b]);
    expect((rows.filter((row) => row.status === 'tuntas').length / rows.length) * 100).toBe(pct);
    expect(prisma.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicYear: '2026/2027',
          semester: 1,
          studentId: { in: ['a', 'b'] },
        }),
      }),
    );
  });
  it('daily attendance does not infer a subject from the recorder; trend remains in range', async () => {
    const prisma = {
      attendance: {
        findMany: jest.fn().mockResolvedValue(
          ['hadir', 'alpha'].map((status, index) => ({
            id: `r${index}`,
            studentId: `s${index}`,
            classId: 'class',
            date: new Date('2026-09-29'),
            status,
            notes: null,
            recordedBy: `teacher${index}`,
            class: { name: 'X' },
            student: { id: `s${index}`, nis: 'SYN', user: { fullName: 'Synthetic' } },
          })),
        ),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      teacher: { findMany: jest.fn() },
    };
    const service = new AttendanceService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      {} as AcademicPeriodService,
    );
    const result = await service.sessions({ from: '2026-09-28', to: '2026-09-30', trendDays: 10 }, {
      roles: ['SUPER_ADMIN'],
    } as AuthUser);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ subject: 'Harian kelas', total: 2, pct: 50 });
    expect(result.trend.map((row) => row.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    expect(prisma.teacher.findMany).not.toHaveBeenCalled();
    await expect(service.sessions({ subject: 'Guess', trendDays: 10 }, parent)).rejects.toThrow(
      'tidak memiliki relasi mapel',
    );
  });
});
