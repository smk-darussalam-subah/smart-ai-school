const mockSession = jest.fn(),
  mockPages = jest.fn(),
  mockApi = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: () => mockSession() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/academic-pages-server', () => ({
  academicPagesResult: (...args: unknown[]) => mockPages(...args),
}));
jest.mock('@/lib/api', () => ({ apiFetchResult: (...args: unknown[]) => mockApi(...args) }));
import { fetchQuestionSources } from '@/app/dashboard/akademik/actions';
import { fetchLearningContext } from '@/app/dashboard/akademik/learning-recap-actions';
import { LearningSessionSchema } from '@/lib/learning-recap';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = (data: unknown[]) => ({
  status: 'success',
  httpStatus: 200,
  data: { data, total: data.length, page: 1, limit: 100 },
});
const session = LearningSessionSchema.parse({
  id: id(1),
  scheduleId: id(2),
  classId: id(3),
  teachingAssignmentId: id(4),
  assignedTeacherId: id(5),
  assignedTeacherName: 'Guru QA',
  classNameSnapshot: 'X QA',
  subjectSnapshot: 'Matematika',
  roomSnapshot: null,
  serviceDate: '2026-10-21T00:00:00Z',
  scheduledStartAt: '2026-10-21T00:30:00Z',
  scheduledEndAt: '2026-10-21T01:50:00Z',
  status: 'STARTED',
  startedAt: '2026-10-21T00:30:00Z',
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
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ accessToken: 'synthetic' });
  mockPages.mockImplementation((path: string) =>
    ready(path.startsWith('/class-sessions') ? [session] : []),
  );
});
describe('owner-scoped AI sources', () => {
  it('keeps own scope and selected period; a failed RPP read does not hide available LMS', async () => {
    mockPages.mockImplementation((path: string) =>
      path.startsWith('/rpp')
        ? { status: 'error' }
        : ready([
            {
              id: id(10),
              title: 'Bilangan',
              subject: 'Matematika',
              classId: id(3),
              status: 'published',
              tp: 'Mengurutkan bilangan.',
            },
          ]),
    );
    const result = await fetchQuestionSources({
      subject: 'Matematika',
      classId: id(3),
      academicYear: '2026/2027',
      semester: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data?.[0]?.tpOptions?.[0]?.text).toBe('Mengurutkan bilangan.');
    for (const [path] of mockPages.mock.calls) {
      const query = new URL('https://fixture.invalid' + path).searchParams;
      expect(query.get('scope')).toBe('own');
      expect(query.get('academicYear')).toBe('2026/2027');
      expect(query.get('semester')).toBe('1');
    }
  });
  it('does not invent TP metadata for a source without saved TP', async () => {
    mockPages.mockResolvedValue(
      ready([
        { id: id(10), title: 'Bilangan', subject: 'Matematika', classId: id(3), status: 'draft' },
      ]),
    );
    const result = await fetchQuestionSources({ subject: 'Matematika' });
    expect(result.data?.every((row) => row.tpRefs.length === 0)).toBe(true);
  });
  it('does not turn dual failure into an empty success', async () => {
    mockPages.mockResolvedValue({ status: 'error' });
    expect((await fetchQuestionSources({ subject: 'Matematika' })).success).toBe(false);
  });
  it('requires paired period metadata before issuing any read', async () => {
    expect((await fetchQuestionSources({ subject: 'Matematika', semester: 1 })).success).toBe(
      false,
    );
    expect(mockPages).not.toHaveBeenCalled();
  });
  it('requires authenticated source reads', async () => {
    mockSession.mockResolvedValue(null);
    expect((await fetchQuestionSources({ subject: 'Matematika' })).success).toBe(false);
    expect(mockPages).not.toHaveBeenCalled();
  });
});
describe('production recap JP consumer', () => {
  const context = async () => {
    const result = await fetchLearningContext(session.id, 'own');
    if (result.state !== 'ready') throw Error(result.message);
    return result.data.context;
  };
  const roster = () => ({
    sessionId: id(1),
    classId: id(3),
    date: '2026-10-21',
    subject: 'Matematika',
    slots: [
      { jp: 1, startAt: session.scheduledStartAt, endAt: session.scheduledEndAt },
      { jp: 2, startAt: session.scheduledStartAt, endAt: session.scheduledEndAt },
    ],
    students: [{ id: id(8), nis: 'QA8', name: 'Siswa QA' }],
    records: [{ studentId: id(8), jp: 1, status: 'izin', notes: 'Kegiatan keluarga', revision: 1 }],
  });
  it('reads the exact session and keeps an unrecorded JP unknown', async () => {
    mockApi.mockResolvedValue({ status: 'success', data: roster() });
    const result = await context();
    expect(result.attendance.state).toBe('ready');
    if (result.attendance.state === 'ready')
      expect(result.attendance.data.map((row) => row.status)).toEqual(['izin', null]);
    expect(
      mockApi.mock.calls.some(
        ([path]) => path === `/attendance/student-sessions/sessions/${id(1)}?scope=own`,
      ),
    ).toBe(true);
    expect(mockPages.mock.calls.some(([path]) => path.startsWith('/attendance?'))).toBe(false);
  });
  it.each(['sessionId', 'classId', 'date', 'subject'])(
    'rejects response with mismatched %s',
    async (key) => {
      mockApi.mockResolvedValue({
        status: 'success',
        data: {
          ...roster(),
          [key]: key === 'date' ? '2026-10-22' : key === 'subject' ? 'Lain' : id(99),
        },
      });
      const result = await context();
      expect(result.attendance.state).toBe('error');
    },
  );
  it('does not show a denied response as zero attendance', async () => {
    mockApi.mockResolvedValue({ status: 'forbidden', httpStatus: 403 });
    const result = await context();
    expect(result.attendance.state).toBe('denied');
  });
});
