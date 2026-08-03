import {
  createLmsActionGuard,
  LMS_STATUS_AFTER_ACTION,
  runLmsActionLifecycle,
  updateLmsBusyIds,
  withLmsStatusOverrides,
} from '../app/dashboard/akademik/_components/lms-status-optimistic';

describe('LMS optimistic status updates', () => {
  it('maps publish, unpublish, and archive to the row status shown immediately after success', () => {
    expect(LMS_STATUS_AFTER_ACTION).toEqual({
      publish: 'published',
      unpublish: 'draft',
      archive: 'archived',
    });
  });

  it('overrides only the affected rows and preserves the original module object otherwise', () => {
    const modules = [
      { id: 'lms-1', status: 'draft', title: 'Modul 1' },
      { id: 'lms-2', status: 'published', title: 'Modul 2' },
    ];

    expect(withLmsStatusOverrides(modules, { 'lms-1': 'published' })).toEqual([
      { id: 'lms-1', status: 'published', title: 'Modul 1' },
      { id: 'lms-2', status: 'published', title: 'Modul 2' },
    ]);
  });

  it('releases busy state when the server action returns a failure response', async () => {
    const guard = createLmsActionGuard();
    const busyCalls: Array<string | null> = [];
    const statusCalls: Array<[string, string]> = [];
    const errorCalls: string[] = [];

    const result = await runLmsActionLifecycle({
      id: 'lms-1',
      guard,
      action: async () => ({ success: false, error: 'Tidak boleh dipublikasikan.' }),
      nextStatus: 'published',
      setBusyId: (id) => busyCalls.push(id),
      applyStatus: (id, status) => statusCalls.push([id, status]),
      notifyError: (message) => errorCalls.push(message),
    });

    expect(result).toBe('failed');
    expect(busyCalls).toEqual(['lms-1', null]);
    expect(statusCalls).toEqual([]);
    expect(errorCalls).toEqual(['Tidak boleh dipublikasikan.']);
    expect(guard.isActive('lms-1')).toBe(false);
  });

  it('releases busy state when the server action throws', async () => {
    const guard = createLmsActionGuard();
    const busyCalls: Array<string | null> = [];
    const statusCalls: Array<[string, string]> = [];
    const errorCalls: string[] = [];

    const result = await runLmsActionLifecycle({
      id: 'lms-1',
      guard,
      action: async () => { throw new Error('Koneksi server terputus.'); },
      nextStatus: 'published',
      setBusyId: (id) => busyCalls.push(id),
      applyStatus: (id, status) => statusCalls.push([id, status]),
      notifyError: (message) => errorCalls.push(message),
    });

    expect(result).toBe('failed');
    expect(busyCalls).toEqual(['lms-1', null]);
    expect(statusCalls).toEqual([]);
    expect(errorCalls).toEqual(['Koneksi server terputus.']);
    expect(guard.isActive('lms-1')).toBe(false);
  });

  it('deduplicates double-clicks while keeping the original action lifecycle intact', async () => {
    const guard = createLmsActionGuard();
    const busyCalls: Array<string | null> = [];
    const statusCalls: Array<[string, string]> = [];
    const errorCalls: string[] = [];
    let resolveAction!: (value: { success: boolean }) => void;
    const action = jest.fn(() => new Promise<{ success: boolean }>((resolve) => {
      resolveAction = resolve;
    }));

    const first = runLmsActionLifecycle({
      id: 'lms-1',
      guard,
      action,
      nextStatus: 'published',
      setBusyId: (id) => busyCalls.push(id),
      applyStatus: (id, status) => statusCalls.push([id, status]),
      notifyError: (message) => errorCalls.push(message),
    });
    const duplicate = await runLmsActionLifecycle({
      id: 'lms-1',
      guard,
      action,
      nextStatus: 'published',
      setBusyId: (id) => busyCalls.push(id),
      applyStatus: (id, status) => statusCalls.push([id, status]),
      notifyError: (message) => errorCalls.push(message),
    });

    resolveAction({ success: true });

    await expect(first).resolves.toBe('success');
    expect(duplicate).toBe('duplicate');
    expect(action).toHaveBeenCalledTimes(1);
    expect(busyCalls).toEqual(['lms-1', null]);
    expect(statusCalls).toEqual([['lms-1', 'published']]);
    expect(errorCalls).toEqual([]);
    expect(guard.isActive('lms-1')).toBe(false);
  });

  it('tracks parallel busy state for different LMS rows independently', async () => {
    const guard = createLmsActionGuard();
    let busyIds: ReadonlySet<string> = new Set();
    let resolveFirst!: (value: { success: boolean }) => void;
    let resolveSecond!: (value: { success: boolean }) => void;
    const actionOne = jest.fn(() => new Promise<{ success: boolean }>((resolve) => {
      resolveFirst = resolve;
    }));
    const actionTwo = jest.fn(() => new Promise<{ success: boolean }>((resolve) => {
      resolveSecond = resolve;
    }));

    const first = runLmsActionLifecycle({
      id: 'lms-1',
      guard,
      action: actionOne,
      nextStatus: 'published',
      setBusyId: (id) => { busyIds = updateLmsBusyIds(busyIds, 'lms-1', Boolean(id)); },
      applyStatus: jest.fn(),
      notifyError: jest.fn(),
    });
    const second = runLmsActionLifecycle({
      id: 'lms-2',
      guard,
      action: actionTwo,
      nextStatus: 'published',
      setBusyId: (id) => { busyIds = updateLmsBusyIds(busyIds, 'lms-2', Boolean(id)); },
      applyStatus: jest.fn(),
      notifyError: jest.fn(),
    });

    expect(Array.from(busyIds).sort()).toEqual(['lms-1', 'lms-2']);
    expect(actionOne).toHaveBeenCalledTimes(1);
    expect(actionTwo).toHaveBeenCalledTimes(1);

    resolveFirst({ success: true });
    await expect(first).resolves.toBe('success');
    expect(Array.from(busyIds)).toEqual(['lms-2']);

    resolveSecond({ success: true });
    await expect(second).resolves.toBe('success');
    expect(Array.from(busyIds)).toEqual([]);
  });
});
