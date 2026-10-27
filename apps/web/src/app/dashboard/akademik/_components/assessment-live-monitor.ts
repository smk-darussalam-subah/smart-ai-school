import { z } from 'zod';

const count = z.number().int().nonnegative();
export const liveMonitorSchema = z.object({
  sessionStatus: z.string(),
  classStudentCount: count,
  selesai: count,
  sedang: count,
  belum: count,
  rata: z.number().finite().min(0).max(100).nullable(),
  finalCount: count,
  pendingManualCount: count,
  pendingLateReview: count,
  roster: z.array(
    z.object({
      responseId: z.string(),
      name: z.string(),
      status: z.string(),
      nilai: z.number().finite().min(0).max(100).nullable(),
      waktu: z.string(),
      revision: count,
      lastSavedAt: z.string().nullable(),
      connectionStatus: z.enum(['connecting', 'online', 'stale', 'offline', 'completed']),
      incidentCount: count,
      lastIncidentType: z.string().nullable(),
      lastIncidentAt: z.string().nullable(),
      lastIncidentDelayed: z.boolean(),
      lateSubmissionStatus: z.enum(['pending', 'accepted', 'rejected']).nullable(),
      lateSubmittedAt: z.string().nullable(),
    }),
  ),
});
export type LiveMonitorData = z.infer<typeof liveMonitorSchema>;
export type LiveMonitorState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';
export interface MonitorSource {
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}
interface MonitorOptions {
  sessionId: string;
  getToken: (signal: AbortSignal) => Promise<{ success: boolean; token?: string }>;
  onData: (data: LiveMonitorData | null) => void;
  onState: (state: LiveMonitorState) => void;
  source?: (url: string) => MonitorSource;
}

/** Mint through the authenticated same-origin proxy, without a queued Server Action. */
export async function requestAssessmentMonitorToken(
  signal: AbortSignal,
): Promise<{ success: boolean; token?: string }> {
  const response = await fetch('/api/backend/auth/sse-token', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) return { success: false };
  const parsed = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(await response.json());
  return parsed.success ? { success: true, token: parsed.data.token } : { success: false };
}

/** Same-origin only: no public build env or external-origin token delivery. */
export function monitorStreamPath(sessionId: string, token: string): string {
  return `/api/backend/assessment/sessions/${encodeURIComponent(sessionId)}/stream?token=${encodeURIComponent(token)}`;
}

/** Owns one stream and its bounded reconnect/silence timers. Every retry gets a new token. */
export function connectAssessmentMonitor(options: MonitorOptions): () => void {
  let stopped = false,
    failures = 0;
  let active: MonitorSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let tokenWait: ReturnType<typeof setTimeout> | undefined;
  let tokenRequest: AbortController | null = null;
  const close = () => {
    clearTimeout(watchdog);
    if (active) {
      active.onopen = null;
      active.onmessage = null;
      active.onerror = null;
      active.close();
    }
    active = null;
  };
  const failed = () => {
    if (stopped) return;
    close();
    options.onData(null);
    if (++failures > 5) {
      options.onState('closed');
      return;
    }
    options.onState('reconnecting');
    retry = setTimeout(() => void connect(), Math.min(8000, 1000 * 2 ** Math.min(failures, 3)));
  };
  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(failed, 15000);
  };
  const connect = async () => {
    if (stopped) return;
    options.onState(failures ? 'reconnecting' : 'connecting');
    // Bound token acquisition too, not only the EventSource handshake. Abort a
    // hung request rather than queueing more; a late result must remain ignored.
    let tokenTimedOut = false;
    tokenRequest = new AbortController();
    const request = tokenRequest;
    tokenWait = setTimeout(() => {
      tokenTimedOut = true;
      request.abort();
      options.onData(null);
      options.onState('closed');
    }, 15000);
    try {
      const result = await options.getToken(request.signal);
      clearTimeout(tokenWait);
      tokenRequest = null;
      if (stopped || tokenTimedOut) return;
      if (!result.success || !result.token) {
        failed();
        return;
      }
      const stream = (options.source ?? ((url) => new EventSource(url)))(
        monitorStreamPath(options.sessionId, result.token),
      );
      active = stream;
      arm();
      // Open/HTTP200 alone is not a data event and must never reset the retry budget.
      stream.onopen = () => {
        /* Await the first validated snapshot. */
      };
      stream.onmessage = (event) => {
        if (stopped || active !== stream) return;
        try {
          const data = liveMonitorSchema.parse(JSON.parse(event.data));
          failures = 0;
          arm();
          options.onData(data);
          options.onState('live');
        } catch {
          failed();
        }
      };
      stream.onerror = () => {
        if (active === stream) failed();
      };
    } catch {
      clearTimeout(tokenWait);
      tokenRequest = null;
      if (!stopped && !tokenTimedOut) failed();
    }
  };
  options.onData(null);
  void connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(tokenWait);
    tokenRequest?.abort();
    close();
  };
}
