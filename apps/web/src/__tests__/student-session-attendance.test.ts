const mockRead = jest.fn(),
  mockFetch = jest.fn(),
  mockSession = jest.fn();
jest.mock('@/components/ui/dialog', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const box = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement('div', null, children);
  return { Dialog: box, DialogContent: box, DialogTitle: box, DialogDescription: box };
});
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DailyAttendanceCalculation from '@/app/dashboard/akademik/_components/DailyAttendanceCalculation';
jest.mock('next-auth', () => ({ getServerSession: () => mockSession() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: () => {
    throw Error('NEXT_REDIRECT');
  },
}));
jest.mock('@/lib/api', () => ({
  apiFetchResult: (...args: unknown[]) => mockRead(...args),
  apiErrorMessage: () => 'Absensi ditolak',
}));
import {
  LearnerJpSchema,
  SessionRosterSchema,
  JpTotalsSchema,
  groupAttendanceSlots,
} from '@/lib/session-attendance';
import {
  fetchLearnerSessionAttendance,
  fetchSessionAttendanceRoster,
  saveSessionAttendance,
} from '@/app/dashboard/akademik/session-attendance-actions';
const id = '82000000-0000-4000-8000-000000000001',
  id2 = '82000000-0000-4000-8000-000000000002';
const query = { from: '2026-10-01', to: '2026-10-22', studentId: id };
function sample() {
  const totals = {
    expected: 2,
    recorded: 2,
    unknown: 0,
    hadir: 1,
    izin: 1,
    sakit: 0,
    alpha: 0,
    complete: true,
    pct: 50,
    tone: 'yellow',
  };
  return {
    studentId: id,
    from: query.from,
    to: query.to,
    unit: 'student_session_jp',
    academicYear: '2026/2027',
    semester: 1,
    scope: 'Synthetic',
    totals,
    days: [{ date: '2026-10-22', ...totals }],
    sessions: [
      {
        id: id2,
        date: '2026-10-22',
        subject: 'Bahasa Indonesia',
        subjectCode: 'BINDO',
        teacher: 'Synthetic Guru',
        className: 'X SYN',
        status: 'STARTED',
        slots: [
          {
            jp: 1,
            startAt: '2026-10-22T00:00:00.000Z',
            endAt: '2026-10-22T00:40:00.000Z',
            status: 'hadir',
            notes: null,
            updatedAt: null,
          },
          {
            jp: 2,
            startAt: '2026-10-22T00:40:00.000Z',
            endAt: '2026-10-22T01:20:00.000Z',
            status: 'izin',
            notes: 'Synthetic',
            updatedAt: null,
          },
        ],
      },
    ],
  };
}
const roster = () => ({
  sessionId: id2,
  classId: id,
  date: '2026-10-22',
  subject: 'Bahasa Indonesia',
  slots: sample().sessions[0]!.slots,
  students: [{ id, name: 'Synthetic A', nis: 'SYN1' }],
  records: [],
});
beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
  mockSession.mockResolvedValue({ accessToken: 'synthetic-only' });
  global.fetch = mockFetch;
});
it('accepts consistent JP counts and official subject code', () => {
  expect(LearnerJpSchema.parse(sample()).sessions[0]!.subjectCode).toBe('BINDO');
});
it('legacy pie counts only status days, never a period percentage as days', () => {
  const stats = { hadir: 3, izin: 1, sakit: 0, alpha: 0, total: 4, pct: 75 };
  const html = renderToStaticMarkup(
    React.createElement(DailyAttendanceCalculation, {
      shell: 'ortu',
      stats,
      label: 'Synthetic',
      children: 'Pie',
    }),
  );
  expect(html).toContain('3 dari 4 hari hadir (75%)');
  expect(html).not.toContain('÷');
  expect(html).not.toContain('75 hari');
  expect(html).not.toContain('>total<');
});
it('compacts only adjacent JP with the same status, notes and contiguous time', () => {
  const first = LearnerJpSchema.parse(sample()).sessions[0]!.slots[0]!;
  const second = { ...first, jp: 2, startAt: first.endAt, endAt: '2026-10-22T01:20:00.000Z' };
  const slots = [second, first];
  expect(groupAttendanceSlots(slots)).toEqual([
    {
      fromJp: 1,
      toJp: 2,
      startAt: first.startAt,
      endAt: second.endAt,
      status: 'hadir',
      notes: null,
    },
  ]);
  expect(slots[0]!.jp).toBe(2);
  for (const change of [
    { status: 'alpha' as const },
    { notes: 'Izin pulang' },
    { jp: 3 },
    { startAt: '2026-10-22T00:50:00.000Z' },
  ]) {
    expect(groupAttendanceSlots([first, { ...second, ...change }])).toHaveLength(2);
  }
  expect(groupAttendanceSlots([])).toEqual([]);
});
it('legacy missing data cannot become zero attendance', () => {
  const html = renderToStaticMarkup(
    React.createElement(DailyAttendanceCalculation, {
      shell: 'siswa',
      stats: { hadir: 0, izin: 0, sakit: 0, alpha: 0 },
      available: false,
      label: 'Synthetic',
      children: 'Pie',
    }),
  );
  expect(html).toContain('Data harian belum tersedia');
  expect(html).not.toContain('0%');
});
it.each([
  ['green', 8, 100],
  ['blue', 6, 75],
  ['yellow', 4, 50],
  ['red', 0, 0],
] as const)('verifies %s JP boundaries', (tone, hadir, pct) => {
  expect(
    JpTotalsSchema.safeParse({
      expected: 8,
      recorded: 8,
      unknown: 0,
      hadir,
      izin: 8 - hadir,
      sakit: 0,
      alpha: 0,
      complete: true,
      pct,
      tone,
    }).success,
  ).toBe(true);
});
it('unknown is not zero or Alpha', () => {
  const data = {
    expected: 8,
    recorded: 0,
    unknown: 8,
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpha: 0,
    complete: false,
    pct: null,
    tone: 'unknown',
  };
  expect(JpTotalsSchema.safeParse(data).success).toBe(true);
  expect(JpTotalsSchema.safeParse({ ...data, pct: 0, tone: 'red' }).success).toBe(false);
});
it.each([
  [1, 0.04, 'yellow'],
  [2479, 99.96, 'blue'],
] as const)('keeps boundary precision for %i of 2480 JP', (hadir, pct, tone) => {
  expect(
    JpTotalsSchema.safeParse({
      expected: 2480,
      recorded: 2480,
      unknown: 0,
      hadir,
      izin: 0,
      sakit: 0,
      alpha: 2480 - hadir,
      complete: true,
      pct,
      tone,
    }).success,
  ).toBe(true);
});
it.each(['pct', 'sessions', 'days', 'date', 'duplicate'] as const)(
  'rejects contradictory producer %s',
  (kind) => {
    const value = sample();
    if (kind === 'pct') value.totals.pct = 100;
    if (kind === 'sessions') value.sessions[0]!.slots[0]!.status = 'alpha';
    if (kind === 'days') value.days = [];
    if (kind === 'date') value.sessions[0]!.date = '2026-09-30';
    if (kind === 'duplicate') value.sessions.push(value.sessions[0]!);
    expect(LearnerJpSchema.safeParse(value).success).toBe(false);
  },
);
it('deduplicates matching physical JP and fails unknown conflicts closed', () => {
  const value = sample();
  value.sessions.push({ ...value.sessions[0]!, id });
  expect(LearnerJpSchema.safeParse(value).success).toBe(true);
  value.sessions[1] = {
    ...value.sessions[1]!,
    slots: value.sessions[1]!.slots.map((s) => ({ ...s, status: 'alpha' })),
  };
  expect(LearnerJpSchema.safeParse(value).success).toBe(false);
});
it('rejects orphan roster records and duplicate slots', () => {
  const value = roster();
  expect(SessionRosterSchema.safeParse(value).success).toBe(true);
  expect(
    SessionRosterSchema.safeParse({
      ...value,
      records: [{ studentId: id2, jp: 1, status: 'hadir', notes: null, revision: 1 }],
    }).success,
  ).toBe(false);
  expect(
    SessionRosterSchema.safeParse({ ...value, slots: [value.slots[0], value.slots[0]] }).success,
  ).toBe(false);
});
it('reads own-child summary with explicit date scope', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: sample() });
  expect((await fetchLearnerSessionAttendance(query)).state).toBe('ready');
  expect(mockRead.mock.calls[0][0]).toContain('studentId=' + id);
});
it.each(['forbidden', 'unavailable', 'invalidResponse'] as const)(
  '%s does not become empty attendance',
  async (status) => {
    mockRead.mockResolvedValue({ status });
    expect((await fetchLearnerSessionAttendance(query)).state).toBe(
      status === 'forbidden' ? 'denied' : 'error',
    );
  },
);
it('rejects wrong child and range in successful API payload', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: { ...sample(), studentId: id2 } });
  expect((await fetchLearnerSessionAttendance(query)).state).toBe('error');
  mockRead.mockResolvedValue({ status: 'success', data: { ...sample(), to: '2026-10-23' } });
  expect((await fetchLearnerSessionAttendance(query)).state).toBe('error');
});
it.each([
  { ...query, from: '2026-02-31' },
  { ...query, studentId: 'bad' },
  { ...query, to: '2026-01-01' },
  { ...query, to: '2027-01-01' },
])('invalid query never fetches', async (input) => {
  expect((await fetchLearnerSessionAttendance(input)).state).toBe('error');
  expect(mockRead).not.toHaveBeenCalled();
});
it('binds roster response to the selected session/date', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: roster() });
  expect((await fetchSessionAttendanceRoster({ sessionId: id2 })).state).toBe('ready');
  expect((await fetchSessionAttendanceRoster({ sessionId: id })).state).toBe('error');
  expect((await fetchSessionAttendanceRoster({ scheduleId: id, date: '2026-10-21' })).state).toBe(
    'error',
  );
});
it('preserves save errors rather than claiming success', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: 'stale' }) });
  expect(await saveSessionAttendance(id2, [])).toEqual({
    success: false,
    error: 'Absensi ditolak',
  });
});
it('requires session token and propagates login redirect on save', async () => {
  mockSession.mockResolvedValueOnce(null);
  await expect(fetchLearnerSessionAttendance(query)).rejects.toThrow('NEXT_REDIRECT');
  mockFetch.mockResolvedValue({ ok: false, status: 401 });
  await expect(saveSessionAttendance(id2, [])).rejects.toThrow('NEXT_REDIRECT');
});
