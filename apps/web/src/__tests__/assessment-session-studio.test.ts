import {
  assessmentSessionPanelState,
  assessmentSessionQueryKey,
  buildAssessmentSessionCards,
  buildQuestionSourceOptions,
  canStartAssessmentSessionPageRequest,
  createAssessmentSessionRequestGate,
  isAssessmentSessionResponseCurrent,
  mergeAssessmentSessionRegistry,
} from '../app/dashboard/akademik/_components/assessment-workspace-mappers';
import type { AssessmentSessionData } from '../app/dashboard/akademik/actions';
import type { LmsModuleItem, RppItem } from '../app/dashboard/akademik/_components/guru-types';

describe('assessment session studio source contract', () => {
  it('maps saved assessment sessions independently from today schedule', () => {
    const sessions: AssessmentSessionData[] = [
      {
        id: 'session-1',
        moduleId: 'module-1',
        classId: 'class-1',
        title: 'UTS Jaringan',
        type: 'sumatif',
        status: 'completed',
        questions: [],
        durationMinutes: 90,
        randomizeOrder: true,
        startedAt: null,
        completedAt: null,
        module: { id: 'module-1', title: 'Jaringan Dasar', subject: 'TJKT' },
        class: { id: 'class-1', name: 'X TKJ 1' },
      },
    ];

    expect(buildAssessmentSessionCards({ assessmentSessions: sessions, subject: 'TJKT', classId: 'class-1' })).toEqual([
      expect.objectContaining({
        assessmentSessionId: 'session-1',
        classId: 'class-1',
        className: 'X TKJ 1',
        subject: 'TJKT',
        startLabel: 'UTS Jaringan · completed',
      }),
    ]);
    expect(buildAssessmentSessionCards({ assessmentSessions: sessions, subject: 'Matematika', classId: 'class-1' })).toHaveLength(0);
  });

  it('builds Bank Soal source picker from current subject and class', () => {
    const modules: LmsModuleItem[] = [
      {
        id: 'module-1',
        rppId: null,
        classId: 'class-1',
        subject: 'TJKT',
        title: 'Subnetting',
        tp: 'TP Subnet',
        jpAllocation: 4,
        kktp: 75,
        content: null,
        orderIndex: 1,
        status: 'published',
        academicYear: '2026/2027',
        semester: 1,
        class: { id: 'class-1', name: 'X TKJ 1' },
      },
    ];
    const rpp: RppItem[] = [
      {
        id: 'rpp-1',
        subject: 'TJKT',
        title: 'Modul Ajar IP',
        content: null,
        body: { tp: ['TP IP', 'TP Routing'] },
        fileUrl: null,
        classId: 'class-1',
        class: { id: 'class-1', name: 'X TKJ 1' },
        status: 'approved',
        reviewNote: null,
        academicYear: '2026/2027',
        semester: 1,
        submittedAt: null,
        reviewedAt: null,
      },
    ];

    expect(buildQuestionSourceOptions({ subject: 'TJKT', classId: 'class-1', lmsModules: modules, rpp })).toEqual([
      expect.objectContaining({
        sourceType: 'module',
        id: 'module-1',
        tpRefs: ['TP 1'],
        tpOptions: [{ ref: 'TP 1', text: 'TP Subnet' }],
      }),
      expect.objectContaining({
        sourceType: 'rpp',
        id: 'rpp-1',
        tpRefs: ['TP 1', 'TP 2'],
        tpOptions: [{ ref: 'TP 1', text: 'TP IP' }, { ref: 'TP 2', text: 'TP Routing' }],
      }),
    ]);
    expect(buildQuestionSourceOptions({ subject: 'all', classId: 'class-1', lmsModules: modules, rpp })).toHaveLength(0);
  });

  it('merges paged session registry by id and keeps server-fresh records', () => {
    const baseSession: AssessmentSessionData = {
      id: 'session-1',
      moduleId: 'module-1',
      classId: 'class-1',
      title: 'Draft Lama',
      type: 'formatif',
      status: 'draft',
      questions: [],
      durationMinutes: 60,
      randomizeOrder: false,
      startedAt: null,
      completedAt: null,
      module: { id: 'module-1', title: 'Modul', subject: 'TJKT' },
      class: { id: 'class-1', name: 'X TKJ 1' },
    };
    const merged = mergeAssessmentSessionRegistry([baseSession], [
      { ...baseSession, title: 'Draft Terbaru', status: 'active' },
      { ...baseSession, id: 'session-2', title: 'Sesi Kedua' },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(expect.objectContaining({ id: 'session-1', title: 'Draft Terbaru', status: 'active' }));
    expect(merged[1]).toEqual(expect.objectContaining({ id: 'session-2', title: 'Sesi Kedua' }));
  });

  it('rejects stale pagination responses after subject or class filters change', () => {
    const oldKey = assessmentSessionQueryKey({
      subject: 'TJKT',
      classId: 'class-1',
      academicYear: '2026/2027',
      semester: 1,
      limit: 100,
    });
    const newKey = assessmentSessionQueryKey({
      subject: 'Matematika',
      classId: 'class-2',
      academicYear: '2026/2027',
      semester: 1,
      limit: 100,
    });

    expect(isAssessmentSessionResponseCurrent({
      requestId: 7,
      latestRequestId: 7,
      requestKey: oldKey,
      currentKey: newKey,
    })).toBe(false);
    expect(isAssessmentSessionResponseCurrent({
      requestId: 7,
      latestRequestId: 8,
      requestKey: newKey,
      currentKey: newKey,
    })).toBe(false);
    expect(isAssessmentSessionResponseCurrent({
      requestId: 8,
      latestRequestId: 8,
      requestKey: newKey,
      currentKey: newKey,
    })).toBe(true);
  });

  it('keeps loading and error visible before empty state and blocks double-submit load more', () => {
    expect(assessmentSessionPanelState({
      hasSavedSessions: false,
      hasTodayCandidates: false,
      loading: true,
      error: null,
    })).toBe('loading');
    expect(assessmentSessionPanelState({
      hasSavedSessions: false,
      hasTodayCandidates: false,
      loading: false,
      error: 'Gagal memuat sesi asesmen.',
    })).toBe('error');
    expect(assessmentSessionPanelState({
      hasSavedSessions: false,
      hasTodayCandidates: false,
      loading: false,
      error: null,
    })).toBe('empty');
    expect(canStartAssessmentSessionPageRequest({ loading: true, hasMore: true })).toBe(false);
    expect(canStartAssessmentSessionPageRequest({ loading: false, hasMore: false })).toBe(false);
    expect(canStartAssessmentSessionPageRequest({ loading: false, hasMore: true, inFlight: true })).toBe(false);
    expect(canStartAssessmentSessionPageRequest({ loading: false, hasMore: true })).toBe(true);
  });

  it('serializes actual same-filter fetch calls across page-1 retry and load-more paths', async () => {
    const gate = createAssessmentSessionRequestGate();
    const key = assessmentSessionQueryKey({
      subject: 'TJKT',
      classId: 'class-1',
      academicYear: '2026/2027',
      semester: 1,
      limit: 100,
    });
    let releaseFirst!: () => void;
    const fetcher = jest.fn(() => new Promise<string>((resolve) => {
      releaseFirst = () => resolve('ok');
    }));

    const first = gate.run(key, fetcher);
    const rapidRetry = gate.run(key, fetcher);
    const rapidLoadMore = gate.run(key, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(rapidRetry).resolves.toEqual({ started: false });
    await expect(rapidLoadMore).resolves.toEqual({ started: false });
    releaseFirst();
    await expect(first).resolves.toEqual({ started: true, value: 'ok' });

    fetcher.mockResolvedValueOnce('ok-again');
    await expect(gate.run(key, fetcher)).resolves.toEqual({ started: true, value: 'ok-again' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
