import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { ReportCardsService } from '../report-cards/report-cards.service';
import {
  readReportJpAnnexes,
  reportAttendanceForRead,
  reportAttendanceForList,
} from '../report-cards/report-jp-annex';

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const period = {
  id: id(1),
  number: 1,
  startDate: new Date('2026-07-13'),
  endDate: new Date('2026-12-19'),
  academicYear: { id: id(2), code: '2026/2027' },
};
const students = [{ id: id(3), joinedAt: new Date('2026-07-13'), eligible: true }];
function session(first = 1, last = 6) {
  const date = '2026-10-19';
  return {
    id: id(10 + first),
    classId: id(4),
    semesterId: period.id,
    serviceDate: new Date(date),
    scheduledStartAt: new Date(Date.parse(date + 'T00:30:00Z') + (first - 1) * 2400000),
    scheduledEndAt: new Date(Date.parse(date + 'T00:30:00Z') + last * 2400000),
    subjectSnapshot: 'Matematika',
    assignedTeacherName: 'Guru QA',
    classNameSnapshot: 'X QA',
    bellScheduleProfile: {
      segments: Array.from({ length: 6 }, (_, i) => ({
        type: 'INSTRUCTION',
        dayOfWeek: 0,
        jpNumber: i + 1,
        startMinute: 450 + i * 40,
        endMinute: 490 + i * 40,
      })),
    },
    studentAttendance: ['hadir', 'hadir', 'izin', 'sakit', 'alpha']
      .slice(first - 1, last)
      .map((status, i) => ({
        studentId: id(3),
        jp: first + i,
        status,
        notes: status === 'izin' ? 'Alasan A' : status === 'sakit' ? 'Alasan B' : null,
        revision: 1,
        updatedAt: new Date(date + 'T05:00:00Z'),
      })),
  };
}
function fixture(rows = [session()]) {
  const db = {
    classSession: { findMany: jest.fn().mockResolvedValue(rows) },
    academicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    db,
    read: (targets = students, now = new Date('2026-10-20T03:00:00Z')) =>
      readReportJpAnnexes(db as unknown as Prisma.TransactionClient, period, id(4), targets, now),
  };
}
it('captures H2/I1/S1/A1/unknown1 without changing notes or the daily ledger', async () => {
  const row = session(),
    original = JSON.stringify(row),
    f = fixture([row]);
  const data = (await f.read()).get(id(3))!;
  expect(data.totals).toMatchObject({
    expected: 6,
    recorded: 5,
    unknown: 1,
    hadir: 2,
    izin: 1,
    sakit: 1,
    alpha: 1,
    pct: null,
  });
  expect(data.days).toEqual([{ date: '2026-10-19', ...data.totals }]);
  expect(data.sessions[0]!.slots[2]!.notes).toBe('Alasan A');
  expect(data.sessions[0]!.slots[3]!.notes).toBe('Alasan B');
  expect(data.sessions[0]!.slots[5]).toMatchObject({
    status: null,
    notes: null,
    revision: null,
    updatedAt: null,
  });
  expect(JSON.stringify(row)).toBe(original);
  expect(f.db.classSession.findMany).toHaveBeenCalledTimes(1);
  expect(f.db.academicCalendar.findMany).toHaveBeenCalledTimes(1);
  expect(f.db.classSession.findMany.mock.calls[0]![0].where).toMatchObject({
    classId: id(4),
    semesterId: period.id,
    serviceDate: { gte: period.startDate, lte: new Date('2026-10-20') },
  });
});
it('overlap counts once, conflict becomes unknown, and separate session reasons survive', async () => {
  const a = session(1, 3),
    b = {
      ...session(1, 3),
      id: id(40),
      studentAttendance: session(1, 3).studentAttendance.map((r) =>
        r.jp === 3 ? { ...r, status: 'sakit', notes: 'Alasan lain' } : r,
      ),
    };
  const data = (await fixture([a, b]).read()).get(id(3))!;
  expect(data.totals).toMatchObject({
    expected: 3,
    hadir: 2,
    izin: 0,
    sakit: 0,
    unknown: 1,
    pct: null,
  });
  expect(data.sessions.map((s) => s.slots[2]!.notes)).toEqual(['Alasan A', 'Alasan lain']);
});
it('does not invent old class membership, while retaining actual saved history', async () => {
  const f = fixture();
  const result = await f.read([
    { ...students[0]!, joinedAt: new Date('2026-11-01'), eligible: false },
    { id: id(5), joinedAt: new Date('2026-11-01'), eligible: true },
  ]);
  expect(result.get(id(3))!.totals.recorded).toBe(5);
  expect(result.get(id(5))!.totals.expected).toBe(0);
  expect(JSON.stringify(result.get(id(5)))).not.toContain('Alasan A');
});
it('does not query for all-issued reports or before the configured period begins', async () => {
  const f = fixture();
  await f.read([]);
  await f.read(students, new Date('2026-07-01'));
  expect(f.db.classSession.findMany).not.toHaveBeenCalled();
});
it('excludes holidays and Sundays without writing records', async () => {
  const f = fixture();
  f.db.academicCalendar.findMany.mockResolvedValue([
    { startDate: new Date('2026-10-19'), endDate: new Date('2026-10-19') },
  ]);
  expect((await f.read()).get(id(3))!.totals.expected).toBe(0);
});
it('class batch query count is constant for multiple report students', async () => {
  const f = fixture();
  await f.read(
    Array.from({ length: 100 }, (_, i) => ({
      id: id(100 + i),
      eligible: true,
      joinedAt: new Date('2026-07-13'),
    })),
  );
  expect(f.db.classSession.findMany).toHaveBeenCalledTimes(1);
  expect(f.db.academicCalendar.findMany).toHaveBeenCalledTimes(1);
});
it.each(['class', 'period', 'slots', 'overflow'])(
  'rejects invalid %s scope/data rather than publishing partial results',
  async (kind) => {
    const row = session();
    if (kind === 'class') row.classId = id(99);
    if (kind === 'period') row.semesterId = id(99);
    if (kind === 'slots') row.bellScheduleProfile.segments = [];
    const f = fixture(kind === 'overflow' ? Array.from({ length: 10001 }, () => row) : [row]);
    await expect(f.read()).rejects.toBeInstanceOf(ConflictException);
  },
);
it('redacts mismatched saved annex bindings without changing daily counts', () => {
  const context = { studentId: id(3), classId: id(4), academicYear: '2026/2027', semester: 1 };
  expect(
    reportAttendanceForRead(
      { hadir: 2, jp: { ...context, studentId: id(99), notes: 'private' } },
      context,
    ),
  ).toEqual({ hadir: 2, jp: { unavailable: true } });
});
it('keeps list payloads free of session reasons while retaining daily counts and an availability marker', () => {
  const context = { studentId: id(3), classId: id(4), academicYear: '2026/2027', semester: 1 };
  expect(
    reportAttendanceForList({ hadir: 1, jp: { ...context, notes: 'private reason' } }, context),
  ).toEqual({ hadir: 1, jpAvailable: true });
  expect(reportAttendanceForList({ hadir: 7, izin: 1 }, context)).toEqual({ hadir: 7, izin: 1 });
});
it('bounds serialized snapshot size instead of truncating private reasons', async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({
    ...session(),
    id: id(1000 + i),
    studentAttendance: session().studentAttendance.map((r) => ({ ...r, notes: 'x'.repeat(1000) })),
  }));
  await expect(fixture(rows).read()).rejects.toBeInstanceOf(ConflictException);
});
it.each(['P2034', 'P2002'])('retries only rolled-back %s report conflicts', async (code) => {
  const transaction = jest
    .fn()
    .mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fixture conflict', {
        code,
        clientVersion: '5.22.0',
        meta: { modelName: 'ReportCard', target: ['student_id', 'academic_year', 'semester'] },
      }),
    )
    .mockResolvedValueOnce('saved');
  const service = Object.assign(Object.create(ReportCardsService.prototype), {
    prisma: { $transaction: transaction },
  }) as ReportCardsService;
  expect(await service['reportSnapshotTransaction'](async () => 'saved')).toBe('saved');
  expect(transaction).toHaveBeenCalledTimes(2);
});
it('does not retry unrelated uniqueness failures and bounds repeated serialization conflicts', async () => {
  const error = new Prisma.PrismaClientKnownRequestError('unrelated', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { modelName: 'Other', target: ['id'] },
  });
  const transaction = jest.fn().mockRejectedValue(error),
    service = Object.assign(Object.create(ReportCardsService.prototype), {
      prisma: { $transaction: transaction },
    }) as ReportCardsService;
  await expect(service['reportSnapshotTransaction'](async () => 'saved')).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(1);
  transaction.mockReset().mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError('serialization', {
      code: 'P2034',
      clientVersion: '5.22.0',
    }),
  );
  await expect(service['reportSnapshotTransaction'](async () => 'saved')).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(transaction).toHaveBeenCalledTimes(3);
});
