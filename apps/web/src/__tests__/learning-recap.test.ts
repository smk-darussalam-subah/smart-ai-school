import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LearningSessionSchema,
  RecapQuerySchema,
  groupLearningSessions,
  learningCounts,
} from '@/lib/learning-recap';
import { learningDocumentHtml, learningDocumentRows } from '@/lib/learning-recap-document';
const mockSession = jest.fn(),
  mockPages = jest.fn(),
  mockApi = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: () => mockSession() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/academic-pages-server', () => ({
  academicPagesResult: (...args: unknown[]) => mockPages(...args),
}));
jest.mock('@/lib/api', () => ({ apiFetchResult: (...args: unknown[]) => mockApi(...args) }));
jest.mock('@/app/dashboard/jadwal/actions', () => ({
  fetchSchedulingSubjectCatalog: jest.fn(),
  startClassSession: jest.fn(),
  completeClassSession: jest.fn(),
}));
import {
  fetchLearningRecap,
  fetchLearningContext,
} from '@/app/dashboard/akademik/learning-recap-actions';
import LearningRecap from '@/app/dashboard/akademik/_components/LearningRecap';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = () =>
  LearningSessionSchema.parse({
    id: id(1),
    scheduleId: id(2),
    classId: id(3),
    teachingAssignmentId: id(4),
    assignedTeacherId: id(5),
    assignedTeacherName: 'Guru <uji>',
    classNameSnapshot: 'X AKL',
    subjectSnapshot: 'Bahasa Indonesia',
    roomSnapshot: null,
    serviceDate: '2026-10-21T00:00:00.000Z',
    scheduledStartAt: '2026-10-21T00:30:00.000Z',
    scheduledEndAt: '2026-10-21T01:50:00.000Z',
    status: 'STARTED',
    startedAt: '2026-10-21T00:30:00.000Z',
    completedAt: null,
    missedAt: null,
    cancelledAt: null,
    reassignedAt: null,
    cancellationReason: null,
    reassignmentReason: null,
    canOperate: true,
    operationBlockedReason: null,
    academicYear: { code: '2026/2027' },
    semester: { number: 1 },
    schedule: { jpStart: 1, jpEnd: 2 },
  });
const ready = (data: unknown[]) => ({
  status: 'success',
  httpStatus: 200,
  data: { data, total: data.length, page: 1, limit: 100 },
});
const query = {
  scope: 'own' as const,
  academicYear: '2026/2027',
  semester: 1,
  from: '2026-10-21',
  until: '2026-10-21',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ accessToken: 'synthetic-token' });
  mockApi.mockResolvedValue({ status: 'success', data: { permissions: ['activity.manage'] } });
  mockPages.mockImplementation((path: string) =>
    Promise.resolve(ready(path.startsWith('/class-sessions') ? [row()] : [])),
  );
});
describe('learning recap contract', () => {
  it('groups by stable teacher ID, not repeated names', () => {
    const a = row(),
      b = { ...row(), id: id(9) },
      c = { ...row(), id: id(10), assignedTeacherId: id(11) };
    expect(groupLearningSessions([a, b, c]).map((x) => x.sessions.length)).toEqual([2, 1]);
  });
  it('separates lifecycle counts and does not call a missed session planned', () => {
    expect(
      learningCounts([row(), { ...row(), status: 'MISSED' }, { ...row(), status: 'COMPLETED' }]),
    ).toEqual({ total: 3, started: 1, completed: 1, planned: 0 });
  });
  it.each([
    { ...query, from: '2026-02-30' },
    { ...query, until: '2026-10-20' },
    { ...query, until: '2026-12-21' },
    { ...query, semester: 3 },
  ])('rejects invalid query %j', (q) => expect(RecapQuerySchema.safeParse(q).success).toBe(false));
  it('does not show false zero counts while loading', () => {
    const html = renderToStaticMarkup(
      React.createElement(LearningRecap, {
        academicYear: '2026/2027',
        semester: 1,
        scope: 'own',
        canRead: true,
      }),
    );
    expect(html).toContain('Memuat data pembelajaran');
    expect(html).not.toContain('Total sesi');
    expect(html).not.toContain('Tidak ada sesi');
  });
  it('denied render has no action controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(LearningRecap, {
        academicYear: '2026/2027',
        semester: 1,
        scope: 'operations',
      }),
    );
    expect(html).toContain('tidak memiliki akses');
    expect(html).not.toContain('Mulai sesi');
  });
  it('keeps own scope and period in API requests', async () => {
    expect((await fetchLearningRecap(query)).state).toBe('ready');
    const path = mockPages.mock.calls[0][0];
    expect(path).toContain('scope=own');
    expect(path).toContain('academicYear=2026%2F2027');
    expect(path).toContain('semester=1');
  });
  it('rejects wrong-period payload instead of displaying it', async () => {
    mockPages.mockResolvedValue(ready([{ ...row(), semester: { number: 2 } }]));
    expect((await fetchLearningRecap(query)).state).toBe('error');
  });
  it('rejects malformed payload', async () => {
    mockPages.mockResolvedValue(ready([{ id: id(1) }]));
    expect((await fetchLearningRecap(query)).state).toBe('error');
  });
  it('denies missing session without contacting API', async () => {
    mockSession.mockResolvedValue(null);
    expect((await fetchLearningRecap(query)).state).toBe('denied');
    expect(mockPages).not.toHaveBeenCalled();
  });
  it('re-authorizes exact ID before loading any supporting records', async () => {
    mockPages.mockResolvedValue(ready([]));
    expect((await fetchLearningContext(id(1), 'own')).state).toBe('denied');
    expect(mockPages).toHaveBeenCalledTimes(1);
    expect(mockPages.mock.calls[0][0]).toContain(`id=${id(1)}&scope=own`);
  });
  it('keeps errors distinct from empty supporting records', async () => {
    mockPages.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/class-sessions')
          ? ready([row()])
          : { status: 'forbidden', message: 'denied' },
      ),
    );
    const read = await fetchLearningContext(id(1), 'operations');
    expect(read.state).toBe('ready');
    if (read.state === 'ready') {
      expect(read.data.context.journals.state).toBe('denied');
      expect(read.data.context.attendance.state).toBe('denied');
      expect(read.data.context.capabilities.journal).toBe(false);
    }
  });
  it('does not arbitrarily attach journal or assessment of another teacher', async () => {
    mockPages.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/class-sessions')
          ? ready([row()])
          : path.startsWith('/class-activities')
            ? ready([
                {
                  id: id(50),
                  teacherId: id(77),
                  classId: id(3),
                  date: row().serviceDate,
                  title: 'Other',
                  description: null,
                },
              ])
            : ready([]),
      ),
    );
    const read = await fetchLearningContext(id(1), 'own');
    if (read.state !== 'ready') throw Error('read failed');
    expect(read.data.context.journals).toEqual({ state: 'ready', data: [] });
    expect(read.data.context.capabilities).toEqual({
      journal: true,
      module: false,
      attendance: false,
      assessment: false,
    });
  });
  it('exports official codes, escaped names, period and lifecycle semantics', () => {
    const input = {
      ...query,
      scopeLabel: 'Pengajaran saya',
      rows: [row()],
      codes: { 'Bahasa Indonesia': 'BINDO' },
    };
    const html = learningDocumentHtml(input);
    expect(html).toContain('BINDO');
    expect(html).toContain('Guru &lt;uji&gt;');
    expect(html).not.toContain('Guru <uji>');
    expect(html).toContain('2026/2027');
    expect(html).toContain('absensi harian kelas');
    expect(learningDocumentRows(input)[0]).toHaveLength(10);
    expect(learningDocumentHtml(input, true)).toContain('background:#ddd');
  });
});
