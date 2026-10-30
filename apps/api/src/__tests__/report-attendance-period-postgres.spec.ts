import { PrismaClient, type Student } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { NotificationService } from '../notification/notification.service';
import type { PrismaService } from '../prisma/prisma.service';

const url = process.env.REPORT_ATTENDANCE_PROOF_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:\d+\/diis_report_jp_20261030$/.test(url)
)
  throw Error('Dedicated disposable DB only');
const proof = url ? describe : describe.skip;
proof('Official report attendance — PostgreSQL production producer', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const db = prisma as PrismaService;
  const permissions = new PermissionsService(db);
  const service = new ReportCardsService(
    db,
    new EventEmitter2(),
    permissions,
    {} as NotificationService,
    new AcademicPeriodService(db, permissions),
  );
  let classId: string, studentId: string, secondId: string;
  beforeAll(async () => {
    await prisma.semester.updateMany({ data: { isActive: false } });
    await prisma.academicYear.updateMany({ data: { isActive: false } });
    const yearData = {
      code: '2026/2027',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      isActive: true,
    };
    const year = await prisma.academicYear.upsert({
      where: { code: yearData.code },
      create: yearData,
      update: yearData,
    });
    for (const data of [
      {
        academicYearId: year.id,
        number: 1,
        startDate: new Date('2026-07-13'),
        endDate: new Date('2026-12-19'),
        isActive: true,
      },
      {
        academicYearId: year.id,
        number: 2,
        startDate: new Date('2027-01-11'),
        endDate: new Date('2027-06-12'),
      },
    ])
      await prisma.semester.upsert({
        where: { academicYearId_number: { academicYearId: year.id, number: data.number } },
        create: data,
        update: data,
      });
    const c = await prisma.class.create({
      data: { name: 'X QA JP', grade: 10, majorCode: 'QA', academicYear: year.code },
    });
    classId = c.id;
    const people: Student[] = [];
    for (const n of [1, 2]) {
      const u = await prisma.user.create({
        data: {
          keycloakId: `88000000-0000-4000-8000-00000000000${n}`,
          email: `report-qa-${n}@example.invalid`,
          fullName: `Synthetic ${n}`,
          role: 'SISWA',
        },
      });
      people.push(
        await prisma.student.create({
          data: { userId: u.id, nis: `REPORTQA${n}`, classId, joinedAt: new Date('2026-07-01') },
        }),
      );
    }
    studentId = people[0]!.id;
    secondId = people[1]!.id;
    await prisma.attendance.createMany({
      data: [
        ['2026-07-05', 'alpha'],
        ['2026-07-13', 'hadir'],
        ['2026-12-19', 'izin'],
        ['2026-12-25', 'sakit'],
        ['2027-01-05', 'alpha'],
        ['2027-01-11', 'hadir'],
        ['2027-06-12', 'sakit'],
        ['2027-06-20', 'izin'],
      ].map(([date, status]) => ({
        studentId,
        classId,
        date: new Date(date!),
        status: status as 'hadir' | 'izin' | 'sakit' | 'alpha',
        recordedBy: people[0]!.userId,
        notes: 'Synthetic retained note',
      })),
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it.each([1, 2])('uses official semester %i boundaries, inclusively', async (semester) => {
    const result = await prisma.$transaction((tx) =>
      service['buildAttendanceSnapshot'](tx, studentId, classId, '2026/2027', semester),
    );
    expect(result).toEqual(
      semester === 1
        ? { hadir: 1, izin: 1, sakit: 0, alpha: 0 }
        : { hadir: 1, izin: 0, sakit: 1, alpha: 0 },
    );
  });
  it('does not create absences from another class or student', async () => {
    expect(await service['buildAttendanceSnapshot'](db, secondId, classId, '2026/2027', 1)).toEqual(
      { hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    );
  });
  it('generates new snapshots and preserves checked report and all daily history on refresh', async () => {
    const history = await prisma.attendance.findMany({ orderBy: { date: 'asc' } });
    const input = { classId, academicYear: '2026/2027', semester: 1 };
    expect(await service.generate(input)).toMatchObject({ generated: 2 });
    const report = await prisma.reportCard.findFirstOrThrow({ where: { studentId } });
    await prisma.reportCard.update({ where: { id: report.id }, data: { status: 'checked' } });
    const retained = await prisma.reportCard.findUniqueOrThrow({ where: { id: report.id } });
    expect(await service.generate(input)).toMatchObject({ refreshed: 1, skipped: 1 });
    expect(await prisma.reportCard.findUnique({ where: { id: report.id } })).toEqual(retained);
    expect(await prisma.attendance.findMany({ orderBy: { date: 'asc' } })).toEqual(history);
  });
  it('missing official period fails closed', async () => {
    await expect(
      service['buildAttendanceSnapshot'](db, studentId, classId, '2025/2026', 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
