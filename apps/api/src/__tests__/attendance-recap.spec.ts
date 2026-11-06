import {
  AttendanceRecapSchema,
  recapMetrics,
  type RecapStatus,
} from '../attendance/attendance-recap.dto';

const rows = (codes: string) =>
  codes.split('').map((status, i) => ({ studentId: `s${i % 2}`, status: status as RecapStatus }));
describe('aggregate JP contract', () => {
  it('separates temporary attendance from completeness and excludes future/cancelled JP', () => {
    expect(recapMetrics(rows('HHHHISAAUUNNCC'))).toEqual({
      H: 4,
      I: 1,
      S: 1,
      A: 2,
      U: 2,
      N: 2,
      C: 2,
      recorded: 8,
      due: 10,
      attendancePct: 50,
      coveragePct: 80,
      provisional: true,
      students: 2,
    });
  });
  it('does not turn unknown into Alpha or 0 percent', () => {
    expect(recapMetrics(rows('UU'))).toMatchObject({
      attendancePct: null,
      coveragePct: 0,
      A: 0,
      U: 2,
    });
  });
  it.each(['', 'NN', 'CC', 'NNCC'])(
    'does not invent rates with no due denominator: %s',
    (value) => {
      expect(recapMetrics(rows(value))).toMatchObject({
        attendancePct: null,
        coveragePct: null,
        due: 0,
      });
    },
  );
  it('weights unequal classes by physical JP', () => {
    expect(
      recapMetrics(rows('H'.repeat(132) + 'I'.repeat(10) + 'S'.repeat(6) + 'A'.repeat(12)))
        .attendancePct,
    ).toBe(82.5);
  });
  it('coerces only validated integer query parameters', () => {
    expect(
      AttendanceRecapSchema.parse({
        academicYear: '2026/2027',
        semester: '1',
        page: '2',
        jp: '10',
      }),
    ).toMatchObject({ semester: 1, page: 2, jp: 10 });
  });
  it.each([
    { semester: 'NaN' },
    { semester: '3' },
    { academicYear: '2026/2027' },
    { from: '2026-11-03' },
    { from: '2026-11-03', to: '2026-11-02' },
    { view: 'audit' },
    { view: 'detail', studentId: 'foreign' },
    { pageSize: 10000 },
    { jp: 0 },
    { jpFrom: 1 },
    { jpFrom: 4, jpTo: 2 },
    { jp: 1, jpFrom: 1, jpTo: 2 },
    { context: 'all-data' },
    { admin: true },
  ])('rejects invalid or unrecognized input %j', (value) => {
    expect(AttendanceRecapSchema.safeParse(value).success).toBe(false);
  });
});
