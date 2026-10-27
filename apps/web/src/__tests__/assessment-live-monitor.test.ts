import {
  connectAssessmentMonitor,
  monitorStreamPath,
  requestAssessmentMonitorToken,
  type LiveMonitorData,
  type MonitorSource,
} from '../app/dashboard/akademik/_components/assessment-live-monitor';

const snapshot: LiveMonitorData = {
  sessionStatus: 'active',
  classStudentCount: 2,
  selesai: 2,
  sedang: 0,
  belum: 0,
  rata: 50,
  finalCount: 2,
  pendingManualCount: 0,
  pendingLateReview: 0,
  roster: [],
};
const sources: MonitorSource[] = [];
const source = jest.fn((_url: string) => {
  const s: MonitorSource = { onopen: null, onmessage: null, onerror: null, close: jest.fn() };
  sources.push(s);
  return s;
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  sources.length = 0;
  source.mockClear();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
it('uses a same-origin path even when public API build env is missing/wrong', () => {
  expect(monitorStreamPath('one/two', 'a&b')).toBe(
    '/api/backend/assessment/sessions/one%2Ftwo/stream?token=a%26b',
  );
});
it('waits for a validated payload, keeps pending null and legitimate zero, and cancels on dispose', async () => {
  const onState = jest.fn(),
    onData = jest.fn(),
    getToken = jest.fn(async () => ({ success: true, token: 'synthetic' }));
  const stop = connectAssessmentMonitor({ sessionId: 's', getToken, onData, onState, source });
  await flush();
  sources[0]!.onopen?.(new Event('open'));
  expect(onState).not.toHaveBeenCalledWith('live');
  sources[0]!.onmessage?.(
    new MessageEvent('message', {
      data: JSON.stringify({ ...snapshot, rata: null, finalCount: 0, pendingManualCount: 2 }),
    }),
  );
  expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ rata: null, finalCount: 0 }));
  expect(onState).toHaveBeenLastCalledWith('live');
  sources[0]!.onmessage?.(
    new MessageEvent('message', { data: JSON.stringify({ ...snapshot, rata: 0 }) }),
  );
  expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ rata: 0 }));
  stop();
  expect(sources[0]!.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('bounds a 200/open-with-no-data loop and always obtains a fresh token', async () => {
  let tokenNumber = 0;
  const onState = jest.fn(),
    getToken = jest.fn(async () => ({ success: true, token: 'one-use-' + ++tokenNumber }));
  const stop = connectAssessmentMonitor({
    sessionId: 's',
    getToken,
    onData: jest.fn(),
    onState,
    source,
  });
  for (let i = 0; i < 6; i++) {
    await flush();
    sources[i]!.onopen?.(new Event('open'));
    jest.advanceTimersByTime(15000);
    if (i < 5) jest.advanceTimersByTime(8000);
  }
  await flush();
  expect(onState).toHaveBeenLastCalledWith('closed');
  expect(onState).not.toHaveBeenCalledWith('live');
  expect(getToken).toHaveBeenCalledTimes(6);
  expect(new Set(source.mock.calls.map((c) => c[0])).size).toBe(6);
  stop();
  expect(jest.getTimerCount()).toBe(0);
});
it('reconnects with fresh identity and ignores frames from the closed stream', async () => {
  let tokenNumber = 0;
  const onData = jest.fn(),
    onState = jest.fn();
  const stop = connectAssessmentMonitor({
    sessionId: 'current',
    source,
    onData,
    onState,
    getToken: async () => ({ success: true, token: 'one-use-' + ++tokenNumber }),
  });
  await flush();
  const lateMessage = sources[0]!.onmessage!;
  sources[0]!.onmessage?.(new MessageEvent('message', { data: JSON.stringify(snapshot) }));
  sources[0]!.onerror?.(new Event('error'));
  expect(onData).toHaveBeenLastCalledWith(null);
  jest.advanceTimersByTime(2000);
  await flush();
  const calls = onData.mock.calls.length;
  lateMessage(new MessageEvent('message', { data: JSON.stringify({ ...snapshot, rata: 99 }) }));
  expect(onData).toHaveBeenCalledTimes(calls);
  sources[1]!.onmessage?.(
    new MessageEvent('message', { data: JSON.stringify({ ...snapshot, rata: 40 }) }),
  );
  expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ rata: 40 }));
  expect(onState).toHaveBeenLastCalledWith('live');
  expect(source.mock.calls.map((call) => call[0])).toEqual([
    expect.stringContaining('one-use-1'),
    expect.stringContaining('one-use-2'),
  ]);
  stop();
});
it('retries a rejected token request or malformed frame without retaining old data', async () => {
  const onState = jest.fn(),
    onData = jest.fn(),
    getToken = jest
      .fn()
      .mockRejectedValueOnce(Error('offline'))
      .mockResolvedValue({ success: true, token: 'synthetic' });
  const stop = connectAssessmentMonitor({ sessionId: 's', getToken, onData, onState, source });
  await flush();
  expect(onState).toHaveBeenLastCalledWith('reconnecting');
  jest.advanceTimersByTime(2000);
  await flush();
  sources[0]!.onmessage?.(new MessageEvent('message', { data: '{"rata":0}' }));
  expect(onState).toHaveBeenLastCalledWith('reconnecting');
  expect(onData).toHaveBeenLastCalledWith(null);
  stop();
});
it('ignores a delayed token after account/session scope cleanup', async () => {
  let resolve!: (v: { success: boolean; token: string }) => void;
  const getToken = () =>
    new Promise<{ success: boolean; token: string }>((r) => {
      resolve = r;
    });
  const stop = connectAssessmentMonitor({
    sessionId: 'old',
    getToken,
    onState: jest.fn(),
    onData: jest.fn(),
    source,
  });
  stop();
  resolve({ success: true, token: 'old' });
  await flush();
  expect(source).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
it('bounds a hanging token request without piling up requests or accepting a late result', async () => {
  let resolve!: (value: { success: boolean; token: string }) => void;
  const getToken = jest.fn(
    (_signal: AbortSignal) =>
      new Promise<{ success: boolean; token: string }>((r) => {
        resolve = r;
      }),
  );
  const onState = jest.fn();
  const stop = connectAssessmentMonitor({
    sessionId: 's',
    getToken,
    onState,
    onData: jest.fn(),
    source,
  });
  jest.advanceTimersByTime(15000);
  expect(onState).toHaveBeenLastCalledWith('closed');
  jest.advanceTimersByTime(60000);
  expect(getToken).toHaveBeenCalledTimes(1);
  expect(getToken.mock.calls[0]![0].aborted).toBe(true);
  resolve({ success: true, token: 'too-late' });
  await flush();
  expect(source).not.toHaveBeenCalled();
  stop();
  expect(jest.getTimerCount()).toBe(0);
});
it('mints only via the same-origin authenticated proxy and validates the token contract', async () => {
  const originalFetch = global.fetch;
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(Response.json({ token: 'a'.repeat(64) }))
    .mockResolvedValueOnce(Response.json({ token: 'invalid' }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  global.fetch = fetcher;
  const signal = new AbortController().signal;
  try {
    expect(await requestAssessmentMonitorToken(signal)).toEqual({
      success: true,
      token: 'a'.repeat(64),
    });
    expect(await requestAssessmentMonitorToken(signal)).toEqual({ success: false });
    expect(await requestAssessmentMonitorToken(signal)).toEqual({ success: false });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/backend/auth/sse-token',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      }),
    );
  } finally {
    global.fetch = originalFetch;
  }
});
