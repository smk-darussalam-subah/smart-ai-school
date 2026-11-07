import type { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { readAttendancePeriod } from '../attendance/attendance-period';
import { jpDailyTotals, physicalJpAttendance } from '../attendance/student-session-attendance.math';

const period = (semester = 1) => ({
  id: 'period-' + semester,
  number: semester,
  startDate: new Date(semester === 1 ? '2026-07-13' : '2027-01-11'),
  endDate: new Date(semester === 1 ? '2026-12-19' : '2027-06-12'),
  academicYear: { id: 'year', code: '2026/2027' },
});
describe('Official report attendance boundaries and daily JP read model', () => {
  it.each([1, 2])('snapshots inclusive configured boundaries for semester %i', async (semester) => {
    const p = period(semester);
    const records = [
      { date: new Date(p.startDate.getTime() - 86400000), status: 'alpha' },
      { date: p.startDate, status: 'hadir' },
      { date: p.endDate, status: 'izin' },
      { date: new Date(p.endDate.getTime() + 86400000), status: 'sakit' },
    ];
    const groupBy = jest.fn(
      async (query: {
        where: { studentId: string; classId: string; date: { gte: Date; lte: Date } };
      }) => {
        expect(query.where.studentId).toBe('student');
        expect(query.where.classId).toBe('class');
        return records
          .filter((r) => r.date >= query.where.date.gte && r.date <= query.where.date.lte)
          .map((r) => ({ status: r.status, _count: { _all: 1 } }));
      },
    );
    const db = {
      semester: { findMany: jest.fn().mockResolvedValue([p]) },
      attendance: { groupBy },
    };
    const service = Object.create(ReportCardsService.prototype) as ReportCardsService;
    const result = await service['buildAttendanceSnapshot'](
      db as unknown as Prisma.TransactionClient,
      'student',
      'class',
      '2026/2027',
      semester,
    );
    expect(result).toEqual({ hadir: 1, izin: 1, sakit: 0, alpha: 0 });
    expect(groupBy.mock.calls[0]![0].where.date).toEqual({ gte: p.startDate, lte: p.endDate });
  });
  it.each([
    { periods: [] },
    { periods: [period(), period()] },
    { periods: [{ ...period(), endDate: new Date('2026-06-01') }] },
  ])('rejects missing/ambiguous/reversed periods without a daily query', async ({ periods }) => {
    const groupBy = jest.fn();
    const db = {
      semester: { findMany: jest.fn().mockResolvedValue(periods) },
      attendance: { groupBy },
    };
    const service = Object.create(ReportCardsService.prototype) as ReportCardsService;
    await expect(
      service['buildAttendanceSnapshot'](
        db as unknown as Prisma.TransactionClient,
        'student',
        'class',
        '2026/2027',
        1,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(groupBy).not.toHaveBeenCalled();
  });
  it.each([
    { academicYear: '2026/2028', semester: 1 },
    { academicYear: '2026/2027', semester: 3 },
    { academicYear: '2026/2027' },
  ])('rejects invalid period input before querying', async (input) => {
    const findMany = jest.fn();
    await expect(
      readAttendancePeriod(
        { semester: { findMany } } as unknown as Prisma.TransactionClient,
        input,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('retains mixed statuses, unknown, and private reasons independently', () => {
    const sessions = [
      {
        date: '2026-10-19',
        slots: [
          { jp: 1, status: 'hadir', notes: null },
          { jp: 2, status: 'hadir', notes: null },
          { jp: 3, status: 'izin', notes: 'Alasan A' },
          { jp: 4, status: 'sakit', notes: 'Alasan B' },
          { jp: 5, status: 'alpha', notes: null },
          { jp: 6, status: null, notes: null },
        ],
      },
    ];
    const original = JSON.stringify(sessions);
    const summary = jpDailyTotals(physicalJpAttendance(sessions));
    expect(summary.totals).toMatchObject({
      expected: 6,
      recorded: 5,
      hadir: 2,
      izin: 1,
      sakit: 1,
      alpha: 1,
      unknown: 1,
      complete: false,
      pct: null,
    });
    expect(summary.days).toEqual([{ date: '2026-10-19', ...summary.totals }]);
    expect(JSON.stringify(sessions)).toBe(original);
    expect(JSON.stringify(summary)).not.toContain('Alasan');
  });
  it('deduplicates overlaps; disagreements and partial co-teaching are unknown', () => {
    const rows = [
      {
        date: '2026-10-19',
        slots: [
          { jp: 1, status: 'hadir' },
          { jp: 2, status: 'izin' },
          { jp: 3, status: 'hadir' },
        ],
      },
      {
        date: '2026-10-19',
        slots: [
          { jp: 1, status: 'hadir' },
          { jp: 2, status: 'sakit' },
          { jp: 3, status: null },
        ],
      },
      { date: '2026-10-20', slots: [{ jp: 1, status: 'alpha' }] },
    ];
    const summary = jpDailyTotals(physicalJpAttendance(rows));
    expect(summary.totals).toMatchObject({
      expected: 4,
      hadir: 1,
      alpha: 1,
      unknown: 2,
      pct: null,
    });
    expect(summary.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20']);
  });
});
