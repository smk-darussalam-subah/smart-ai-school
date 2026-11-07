import { AttendanceService } from '../attendance/attendance.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AcademicPeriodService } from '../academic-period/academic-period.service';

describe.each(['UTC', 'Asia/Jakarta'])(
  'daily heatmap school-date contract, host %s',
  (hostZone) => {
    const original = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = hostZone;
    });
    afterAll(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });
    afterEach(() => jest.useRealTimers());
    it.each([
      ['2026-10-29T16:59:00Z', '2026-10-29', '2026-10-28'],
      ['2026-10-29T17:00:00Z', '2026-10-30', '2026-10-29'],
      ['2026-10-29T23:59:00Z', '2026-10-30', '2026-10-29'],
      ['2026-10-30T00:00:00Z', '2026-10-30', '2026-10-29'],
      ['2026-10-31T17:00:00Z', '2026-11-01', '2026-10-31'],
      ['2026-12-31T17:00:00Z', '2027-01-01', '2026-12-31'],
    ])('%s selects school date %s and previous date %s', async (instant, today, yesterday) => {
      jest.useFakeTimers().setSystemTime(new Date(instant));
      const groupBy = jest.fn(async ({ where }: { where: { date: { gte: Date; lte: Date } } }) =>
        [
          { classId: 'class', date: new Date(yesterday), status: 'hadir', _count: { _all: 2 } },
          { classId: 'class', date: new Date(today), status: 'alpha', _count: { _all: 2 } },
        ].filter((r) => r.date >= where.date.gte && r.date <= where.date.lte),
      );
      const db = {
        class: {
          findMany: jest.fn().mockResolvedValue([{ id: 'class', name: 'Kelas QA', grade: 10 }]),
        },
        attendance: { groupBy },
      };
      const service = new AttendanceService(
        db as unknown as PrismaService,
        {} as EventEmitter2,
        {} as AcademicPeriodService,
      );
      const result = await service.heatmap(2);
      expect(result.overall.today).toEqual({ date: today, total: 2, hadir: 0, pct: 0 });
      expect(result.overall.yesterday).toEqual({ date: yesterday, total: 2, hadir: 2, pct: 100 });
      expect(result.dates).toEqual([yesterday, today]);
      expect(groupBy.mock.calls[0]![0].where.date).toEqual({
        gte: new Date(yesterday),
        lte: new Date(today),
      });
    });
  },
);
