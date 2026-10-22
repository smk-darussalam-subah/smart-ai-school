import {
  jpAttendanceTotals,
  physicalJpStatuses,
  sessionJpSlots,
  attendanceNoticeBody,
} from '../attendance/student-session-attendance.math';
import {
  SessionAttendanceSaveSchema,
  LearnerSessionAttendanceSchema,
} from '../attendance/student-session-attendance.dto';
describe('student session JP contracts', () => {
  it('bounds notification previews while full JP notes remain in attendance records', () => {
    const body = attendanceNoticeBody(
      '\u0000'.repeat(255),
      '2026-10-22',
      '漢'.repeat(255),
      Array.from({ length: 40 }, (_, i) => ({
        jp: i + 1,
        status: 'alpha',
        notes: '\u0000'.repeat(1000),
      })),
    );
    expect(body.length).toBeLessThanOrEqual(500);
    expect(
      Buffer.byteLength(
        JSON.stringify({
          title: 'Peringatan kehadiran sesi',
          body,
          url:
            '/dashboard/akademik?studentId=' +
            'a'.repeat(36) +
            '&attendanceDate=2026-10-22&academicYear=2026%2F2027&semester=1',
          deliveryProof: 'a'.repeat(64),
          tag: 'att-' + 'a'.repeat(24),
        }),
      ),
    ).toBeLessThan(4096);
  });
  it.each([
    [8, 0, 'green', 100],
    [6, 2, 'blue', 75],
    [4, 4, 'yellow', 50],
    [1, 7, 'yellow', 12.5],
    [0, 8, 'red', 0],
  ])('weights %i H / %i A', (h, a, tone, pct) =>
    expect(
      jpAttendanceTotals([...Array(Number(h)).fill('hadir'), ...Array(Number(a)).fill('alpha')]),
    ).toMatchObject({ tone, pct, expected: 8, complete: true }),
  );
  it('unknown is not Alpha or a final rate', () =>
    expect(jpAttendanceTotals(['hadir', 'hadir', null, null])).toMatchObject({
      hadir: 2,
      alpha: 0,
      unknown: 2,
      pct: null,
      tone: 'unknown',
      complete: false,
    }));
  it('empty is not zero attendance', () =>
    expect(jpAttendanceTotals([])).toMatchObject({ pct: null, tone: 'unknown' }));
  it('weights 2JP + 4JP by six physical JP', () =>
    expect(
      jpAttendanceTotals(
        physicalJpStatuses([
          { date: '2026-10-22', slots: [1, 2].map((jp) => ({ jp, status: 'hadir' })) },
          { date: '2026-10-22', slots: [3, 4, 5, 6].map((jp) => ({ jp, status: 'alpha' })) },
        ]),
      ),
    ).toMatchObject({ expected: 6, hadir: 2, pct: 33.33 }));
  it.each([
    [1, 0.04, 'yellow'],
    [2479, 99.96, 'blue'],
  ] as const)('does not round partial attendance into a false boundary (%i)', (h, pct, tone) => {
    expect(
      jpAttendanceTotals([...Array(h).fill('hadir'), ...Array(2480 - h).fill('alpha')]),
    ).toMatchObject({ pct, tone });
  });
  it('overlap does not double count and conflicting decisions are unknown', () =>
    expect(
      physicalJpStatuses([
        {
          date: 'd',
          slots: [
            { jp: 1, status: 'hadir' },
            { jp: 2, status: 'hadir' },
          ],
        },
        {
          date: 'd',
          slots: [
            { jp: 1, status: 'hadir' },
            { jp: 2, status: 'alpha' },
          ],
        },
      ]),
    ).toEqual(['hadir', null]));
  it('retains fractional JP exceptions', () =>
    expect(jpAttendanceTotals(['hadir', 'alpha', 'hadir', 'hadir'])).toMatchObject({
      pct: 75,
      tone: 'blue',
    }));
  it('requires unique students/JP, statuses, revisions and bounded notes', () => {
    const r = {
      studentId: '11111111-1111-4111-8111-111111111111',
      jp: 1,
      status: 'hadir',
      revision: 0,
    };
    expect(SessionAttendanceSaveSchema.safeParse({ records: [r, r] }).success).toBe(false);
    for (const field of [
      { jp: 0 },
      { revision: -1 },
      { notes: 'x'.repeat(1001) },
      { status: 'unknown' },
    ])
      expect(SessionAttendanceSaveSchema.safeParse({ records: [{ ...r, ...field }] }).success).toBe(
        false,
      );
  });
  it('validates real dates and bounded ranges', () => {
    expect(
      LearnerSessionAttendanceSchema.safeParse({ from: '2026-02-31', to: '2026-03-01' }).success,
    ).toBe(false);
    expect(
      LearnerSessionAttendanceSchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success,
    ).toBe(false);
  });
  it('uses retained bell timing, not mutable schedule numbers', () => {
    const session = {
      serviceDate: new Date('2026-10-22'),
      scheduledStartAt: new Date('2026-10-22T00:00:00Z'),
      scheduledEndAt: new Date('2026-10-22T01:20:00Z'),
      bellScheduleProfile: {
        segments: [1, 2].map((jp, index) => ({
          type: 'INSTRUCTION',
          jpNumber: jp,
          dayOfWeek: 0,
          startMinute: 420 + index * 40,
          endMinute: 460 + index * 40,
        })),
      },
    };
    expect(sessionJpSlots(session).map((x) => x.jp)).toEqual([1, 2]);
    expect(
      sessionJpSlots({ ...session, scheduledEndAt: new Date('2026-10-22T01:21:00Z') }),
    ).toEqual([]);
  });
});
