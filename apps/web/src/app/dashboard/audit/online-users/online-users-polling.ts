export type OnlineUsersPollingStatus = 'idle' | 'refreshing' | 'error';

interface PollingOptions<T> {
  fetchData: (signal: AbortSignal) => Promise<T>;
  onData: (data: T, updatedAt: number) => void;
  onStatus: (status: OnlineUsersPollingStatus) => void;
  intervalMs?: number;
  staleAfterMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface OnlineUsersPollingController {
  start(initialUpdatedAt: number): void;
  refresh(): Promise<void>;
  setVisible(visible: boolean): void;
  stop(): void;
}

export function createOnlineUsersPollingController<T>(
  options: PollingOptions<T>,
): OnlineUsersPollingController {
  const intervalMs = options.intervalMs ?? 30_000;
  const staleAfterMs = options.staleAfterMs ?? intervalMs;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestController: AbortController | null = null;
  let visible = true;
  let stopped = true;
  let generation = 0;
  let lastUpdatedAt = 0;

  const cancelTimer = () => {
    if (timer) clearTimer(timer);
    timer = null;
  };
  const schedule = () => {
    cancelTimer();
    if (!stopped && visible) timer = setTimer(() => void refresh(), intervalMs);
  };
  const refresh = async () => {
    if (stopped || !visible) return;
    const requestGeneration = ++generation;
    requestController?.abort();
    const activeController = new AbortController();
    requestController = activeController;
    options.onStatus('refreshing');
    try {
      const data = await options.fetchData(activeController.signal);
      if (stopped || requestGeneration !== generation) return;
      lastUpdatedAt = now();
      options.onData(data, lastUpdatedAt);
      options.onStatus('idle');
    } catch {
      if (stopped || requestGeneration !== generation || activeController.signal.aborted) return;
      options.onStatus('error');
    } finally {
      if (!stopped && requestGeneration === generation) schedule();
    }
  };

  return {
    start(initialUpdatedAt) {
      stopped = false;
      lastUpdatedAt = initialUpdatedAt;
      schedule();
    },
    refresh,
    setVisible(nextVisible) {
      visible = nextVisible;
      if (!visible) {
        cancelTimer();
        requestController?.abort();
        generation++;
        options.onStatus('idle');
        return;
      }
      if (!stopped && now() - lastUpdatedAt >= staleAfterMs) void refresh();
      else schedule();
    },
    stop() {
      stopped = true;
      generation++;
      cancelTimer();
      requestController?.abort();
    },
  };
}
