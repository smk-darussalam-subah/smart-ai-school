import { createOnlineUsersPollingController } from '../app/dashboard/audit/online-users/online-users-polling';

describe('online users polling', () => {
  it('pauses while hidden and refreshes immediately when stale and visible', async () => {
    let now = 0;
    const fetchData = jest.fn().mockResolvedValue({ users: [] });
    const controller = createOnlineUsersPollingController({
      fetchData,
      onData: jest.fn(),
      onStatus: jest.fn(),
      now: () => now,
      setTimer: jest.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimer: jest.fn(),
    });
    controller.start(0);
    controller.setVisible(false);
    now = 91_000;
    controller.setVisible(true);
    await Promise.resolve();
    expect(fetchData).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('keeps independent state across tabs and ignores stale responses after stop', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    const onDataA = jest.fn();
    const first = createOnlineUsersPollingController({
      fetchData: () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
      onData: onDataA,
      onStatus: jest.fn(),
    });
    const onDataB = jest.fn();
    const second = createOnlineUsersPollingController({
      fetchData: async () => 'tab-b',
      onData: onDataB,
      onStatus: jest.fn(),
    });
    first.start(Date.now());
    second.start(Date.now());
    const pending = first.refresh();
    await second.refresh();
    first.stop();
    resolveFirst?.('stale-tab-a');
    await pending;
    expect(onDataA).not.toHaveBeenCalled();
    expect(onDataB).toHaveBeenCalledWith('tab-b', expect.any(Number));
    second.stop();
  });

  it('allows only the newest in-flight response to update the list', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const onData = jest.fn();
    const controller = createOnlineUsersPollingController({
      fetchData: () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      onData,
      onStatus: jest.fn(),
    });
    controller.start(Date.now());
    const first = controller.refresh();
    const second = controller.refresh();
    resolvers[1]?.('newest');
    await second;
    resolvers[0]?.('stale');
    await first;
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith('newest', expect.any(Number));
    controller.stop();
  });

  it('preserves last-good data and exposes recovery after a transient error', async () => {
    const onData = jest.fn();
    const onStatus = jest.fn();
    const fetchData = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered');
    const controller = createOnlineUsersPollingController({ fetchData, onData, onStatus });
    controller.start(Date.now());
    await controller.refresh();
    expect(onData).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith('error');
    await controller.refresh();
    expect(onData).toHaveBeenCalledWith('recovered', expect.any(Number));
    expect(onStatus).toHaveBeenLastCalledWith('idle');
    controller.stop();
  });

  it('returns to idle when hiding cancels an in-flight refresh', async () => {
    let now = 100;
    const statuses: string[] = [];
    const controller = createOnlineUsersPollingController({
      fetchData: (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      onData: jest.fn(),
      onStatus: (status) => statuses.push(status),
      now: () => now,
      staleAfterMs: 30_000,
      setTimer: jest.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimer: jest.fn(),
    });
    controller.start(now);
    const pending = controller.refresh();
    expect(statuses.at(-1)).toBe('refreshing');
    controller.setVisible(false);
    expect(statuses.at(-1)).toBe('idle');
    now = 101;
    controller.setVisible(true);
    await pending;
    expect(statuses.at(-1)).toBe('idle');
    controller.stop();
  });
});
