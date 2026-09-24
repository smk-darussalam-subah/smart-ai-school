import {
  assessmentSubmitPrerequisiteFailure,
  createAssessmentClientId,
  assessmentSubmitRetryDelay,
  prepareAssessmentSignalsForSubmit,
  resolveAssessmentSignalQueue,
  scheduleAssessmentSubmitRetry,
  selectNewestAssessmentDraft,
  shouldAcceptAssessmentDraftWrite,
  type AssessmentDraftPayload,
  type AssessmentSignalPayload,
} from '../lib/assessment-offline';

function localDraft(overrides: Partial<AssessmentDraftPayload> = {}): AssessmentDraftPayload {
  return {
    responseId: 'response-1',
    sessionId: 'session-1',
    revision: 4,
    mutationId: '11111111-1111-4111-8111-111111111111',
    answers: { q1: { type: 'essay', text: 'jawaban lokal' } },
    pendingSubmit: false,
    submitRequestedAt: null,
    updatedAt: '2026-09-23T01:00:00.000Z',
    ...overrides,
  };
}

describe('assessment offline revision contract', () => {
  it('creates an RFC 4122 identifier when randomUUID is unavailable', () => {
    const fakeCrypto = {
      getRandomValues: (target: Uint8Array) => {
        target.fill(7);
        return target;
      },
    } as unknown as Crypto;

    expect(createAssessmentClientId(fakeCrypto)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('uses revision, mutation, and submit phase as a monotonic local CAS', () => {
    const draft = { revision: 5, mutationId: 'mutation-a', pendingSubmit: false };
    const locked = { revision: 5, mutationId: 'mutation-a', pendingSubmit: true };

    expect(shouldAcceptAssessmentDraftWrite(draft, { ...draft, revision: 4 })).toBe(false);
    expect(shouldAcceptAssessmentDraftWrite(draft, draft)).toBe(true);
    expect(shouldAcceptAssessmentDraftWrite(draft, { ...draft, mutationId: 'mutation-b' })).toBe(
      false,
    );
    expect(shouldAcceptAssessmentDraftWrite(draft, locked)).toBe(true);
    expect(shouldAcceptAssessmentDraftWrite(locked, draft)).toBe(false);
    expect(shouldAcceptAssessmentDraftWrite(locked, { ...locked, revision: 6 })).toBe(false);
  });

  it('keeps a completed submit lock when stale async and second-tab writes finish later', () => {
    let current: { revision: number; mutationId: string; pendingSubmit: boolean } | null = null;
    const apply = (incoming: { revision: number; mutationId: string; pendingSubmit: boolean }) => {
      if (shouldAcceptAssessmentDraftWrite(current, incoming)) current = incoming;
    };

    apply({ revision: 7, mutationId: 'tab-a', pendingSubmit: true });
    apply({ revision: 7, mutationId: 'tab-a', pendingSubmit: false });
    apply({ revision: 8, mutationId: 'tab-b', pendingSubmit: false });
    expect(current).toEqual({ revision: 7, mutationId: 'tab-a', pendingSubmit: true });
  });

  it('restores a newer encrypted-device draft instead of an older server snapshot', () => {
    const selected = selectNewestAssessmentDraft(
      { answers: { q1: { type: 'essay', text: 'jawaban server' } }, revision: 3, mutationId: null },
      localDraft(),
    );

    expect(selected).toMatchObject({ source: 'device', revision: 4, pendingSubmit: false });
    expect(selected.answers.q1).toEqual({ type: 'essay', text: 'jawaban lokal' });
  });

  it('retains an equal-revision pending submit after an offline restart', () => {
    const selected = selectNewestAssessmentDraft(
      { answers: { q1: { type: 'essay', text: 'jawaban server' } }, revision: 4, mutationId: null },
      localDraft({
        pendingSubmit: true,
        submitRequestedAt: '2026-09-23T01:01:00.000Z',
      }),
    );

    expect(selected).toMatchObject({
      source: 'device',
      revision: 4,
      pendingSubmit: true,
      submitRequestedAt: '2026-09-23T01:01:00.000Z',
    });
  });

  it('keeps the server snapshot when the device draft is older', () => {
    const selected = selectNewestAssessmentDraft(
      {
        answers: { q1: { type: 'essay', text: 'jawaban server' } },
        revision: 5,
        mutationId: '22222222-2222-4222-8222-222222222222',
      },
      localDraft(),
    );

    expect(selected).toMatchObject({ source: 'server', revision: 5, pendingSubmit: false });
    expect(selected.answers.q1).toEqual({ type: 'essay', text: 'jawaban server' });
  });

  it('automatically schedules a bounded retry after a transient server failure', async () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const schedule = jest.fn((callback: () => void, delayMs: number) => {
      scheduled.push({ callback, delayMs });
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    const recoveredSubmit = jest.fn().mockResolvedValue({ success: true });

    scheduleAssessmentSubmitRetry(
      1,
      () => {
        void recoveredSubmit();
      },
      schedule,
    );
    scheduled[0]!.callback();
    await Promise.resolve();

    expect(scheduled[0]!.delayMs).toBe(1_000);
    expect(recoveredSubmit).toHaveBeenCalledTimes(1);
    expect(assessmentSubmitRetryDelay(2)).toBe(2_000);
    expect(assessmentSubmitRetryDelay(99)).toBe(30_000);
  });

  it('drains oldest integrity signals before submitting the bounded final batch', async () => {
    const signals: AssessmentSignalPayload[] = Array.from({ length: 102 }, (_, index) => ({
      eventId: `event-${String(index).padStart(3, '0')}`,
      responseId: 'response-1',
      sessionId: 'session-1',
      type: 'window_blur',
      occurredAt: new Date(Date.UTC(2026, 8, 23, 1, 0, index)).toISOString(),
    }));
    const deliver = jest.fn().mockResolvedValue(true);
    const remove = jest.fn().mockResolvedValue(true);

    const result = await prepareAssessmentSignalsForSubmit(signals, deliver, remove, 100);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected a prepared signal batch');
    expect(deliver.mock.calls.map(([signal]) => signal.eventId)).toEqual([
      'event-000',
      'event-001',
    ]);
    expect(remove.mock.calls.map(([eventId]) => eventId)).toEqual(['event-000', 'event-001']);
    expect(result.signals).toHaveLength(100);
    expect(result.signals[0]?.eventId).toBe('event-002');
    expect(result.signals[99]?.eventId).toBe('event-101');
  });

  it('keeps the queue intact when overflow delivery is not acknowledged', async () => {
    const signals: AssessmentSignalPayload[] = Array.from({ length: 101 }, (_, index) => ({
      eventId: `event-${index}`,
      responseId: 'response-1',
      sessionId: 'session-1',
      type: 'visibility_hidden',
      occurredAt: new Date(Date.UTC(2026, 8, 23, 1, 0, index)).toISOString(),
    }));
    const remove = jest.fn().mockResolvedValue(true);

    await expect(
      prepareAssessmentSignalsForSubmit(signals, async () => false, remove, 100),
    ).resolves.toEqual({ status: 'unavailable' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports queue-read failure instead of treating integrity evidence as empty', async () => {
    await expect(
      resolveAssessmentSignalQueue(
        async () => {
          throw new Error('indexeddb read failed');
        },
        async (signal: AssessmentSignalPayload) => signal,
      ),
    ).resolves.toEqual({ status: 'unavailable', signals: [] });
  });

  it('reports decrypt failure instead of dropping unreadable integrity evidence', async () => {
    const signal: AssessmentSignalPayload = {
      eventId: 'event-1',
      responseId: 'response-1',
      sessionId: 'session-1',
      type: 'pagehide',
      occurredAt: '2026-09-23T01:00:00.000Z',
    };

    await expect(
      resolveAssessmentSignalQueue(
        async () => [signal],
        async () => {
          throw new Error('decrypt failed');
        },
      ),
    ).resolves.toEqual({ status: 'unavailable', signals: [] });
  });

  it.each(['queue-read', 'signal-sync'] as const)(
    'unlocks manual retry when %s fails and the current answers are not durable',
    (reason) => {
      const postSubmit = jest.fn();
      const failure = assessmentSubmitPrerequisiteFailure('unavailable', reason);
      if (failure.pendingSubmit) postSubmit();

      expect(failure).toMatchObject({
        pendingSubmit: false,
        retryable: false,
        saveState: 'failed',
      });
      expect(failure.warning).toContain('Jawaban hanya ada di layar');
      expect(failure.toast).toContain('belum aman');
      expect(postSubmit).not.toHaveBeenCalled();
    },
  );

  it.each(['queue-read', 'signal-sync'] as const)(
    'keeps automatic retry only when %s fails after a durable local save',
    (reason) => {
      expect(assessmentSubmitPrerequisiteFailure('saved', reason)).toMatchObject({
        pendingSubmit: true,
        retryable: true,
        saveState: 'queued',
      });
    },
  );
});
