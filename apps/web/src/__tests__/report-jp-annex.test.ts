import { readReportJpAnnex, reportJpCsv, reportJpHtml } from '../lib/report-jp-annex';

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const identity = { studentId: id(3), classId: id(4), academicYear: '2026/2027', semester: 1 };
export function annexFixture() {
  const totals = {
    expected: 6,
    recorded: 5,
    unknown: 1,
    hadir: 2,
    izin: 1,
    sakit: 1,
    alpha: 1,
    complete: false,
    pct: null,
    tone: 'unknown',
  };
  return {
    version: 1,
    unit: 'student_session_jp',
    ...identity,
    semesterId: id(1),
    from: '2026-07-13',
    to: '2026-12-19',
    observedThrough: '2026-10-20',
    generatedAt: '2026-10-20T03:00:00Z',
    rosterBasis: 'current_roster_and_recorded_history',
    totals,
    days: [{ date: '2026-10-19', ...totals }],
    sessions: [
      {
        id: id(10),
        date: '2026-10-19',
        subject: 'Matematika',
        teacher: 'Guru QA',
        className: 'X QA',
        slots: ['hadir', 'hadir', 'izin', 'sakit', 'alpha', null].map((status, i) => ({
          jp: i + 1,
          startAt: new Date(Date.parse('2026-10-19T00:30:00Z') + i * 2400000).toISOString(),
          endAt: new Date(Date.parse('2026-10-19T00:30:00Z') + (i + 1) * 2400000).toISOString(),
          status,
          notes: status === 'izin' ? 'Alasan A' : status === 'sakit' ? 'Alasan B' : null,
          revision: status ? 1 : null,
          updatedAt: status ? '2026-10-19T05:00:00Z' : null,
        })),
      },
    ],
  };
}
it('binds saved mixed-status annex and preserves unknown instead of a false final percentage', () => {
  const read = readReportJpAnnex(annexFixture(), identity);
  expect(read.state).toBe('ready');
  if (read.state === 'ready') {
    expect(read.data.totals.pct).toBeNull();
    expect(read.data.sessions[0]!.slots[2]!.notes).toBe('Alasan A');
  }
});
it.each([undefined, null])('treats absent annex as missing, not zero JP', (value) => {
  expect(readReportJpAnnex(value, identity)).toEqual({ state: 'missing' });
});
it.each([
  'studentId',
  'classId',
  'academicYear',
  'semester',
  'version',
  'totals',
  'days',
  'date',
  'unknown',
  'cutoff',
  'empty',
])('fails closed on inconsistent %s', (key) => {
  const data = annexFixture();
  if (key === 'studentId') data.studentId = id(99);
  if (key === 'classId') data.classId = id(99);
  if (key === 'academicYear') data.academicYear = '2025/2026';
  if (key === 'semester') data.semester = 2;
  if (key === 'version') data.version = 2;
  if (key === 'totals') data.totals.hadir = 5;
  if (key === 'days') data.days = [];
  if (key === 'date') data.sessions[0]!.date = '2026-07-01';
  if (key === 'unknown') data.sessions[0]!.slots[5]!.notes = 'not authorized';
  if (key === 'cutoff') data.observedThrough = '2026-12-19';
  if (key === 'empty') data.sessions = [];
  expect(readReportJpAnnex(data, identity).state).toBe('invalid');
});
it('cannot show an annex if report class identity is unavailable', () => {
  expect(readReportJpAnnex(annexFixture(), { ...identity, classId: undefined }).state).toBe(
    'invalid',
  );
});
it('reconciles overlapping status conflicts without losing separate reasons', () => {
  const data = annexFixture(),
    other = structuredClone(data.sessions[0]!);
  other.id = id(20);
  other.slots[2]!.status = 'sakit';
  other.slots[2]!.notes = 'Alasan berbeda';
  data.sessions.push(other);
  data.totals = { ...data.totals, izin: 0, recorded: 4, unknown: 2 };
  data.days = [{ date: '2026-10-19', ...data.totals }];
  expect(readReportJpAnnex(data, identity).state).toBe('ready');
});
it('exports exactly the saved counts and reasons, with spreadsheet/HTML injection controls', () => {
  const input = annexFixture();
  input.sessions[0]!.slots[2]!.notes = '=HYPERLINK("https://example.invalid")';
  input.sessions[0]!.slots[3]!.notes = '<img src=x onerror=alert(1)> & alasan';
  const read = readReportJpAnnex(input, identity);
  expect(read.state).toBe('ready');
  if (read.state !== 'ready') throw Error('fixture invalid');
  const csv = reportJpCsv(read.data);
  expect(csv).toContain('"TOTAL","2","1","1","1","1","6","Belum lengkap"');
  expect(csv).toContain('"\'=HYPERLINK(');
  expect(csv).toContain('Revisi');
  const html = reportJpHtml(read.data, '<script>private</script>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;img');
  expect(html).toContain('Hitungan JP terpisah dari catatan hari');
});
it('does not use the current clock to recalculate an issued snapshot', () => {
  const input = annexFixture();
  jest.useFakeTimers().setSystemTime(new Date('2030-01-01'));
  try {
    expect(readReportJpAnnex(input, identity).state).toBe('ready');
  } finally {
    jest.useRealTimers();
  }
});
it('accepts a genuinely empty snapshot without inventing absences', () => {
  const data = annexFixture();
  data.sessions = [];
  data.days = [];
  data.totals = {
    ...data.totals,
    expected: 0,
    recorded: 0,
    unknown: 0,
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpha: 0,
  };
  expect(readReportJpAnnex(data, identity).state).toBe('ready');
});
