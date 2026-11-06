import { JpReadAdmission, withJpRead } from '../attendance/jp-read-admission';

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('JP read admission before database snapshot', () => {
  afterEach(() => jest.useRealTimers());

  it('shares the snapshot budget across both readers of one client, but not other DBs', async () => {
    const client = {},
      other = {},
      held = latch(),
      work = jest.fn(async () => 3);
    const a = withJpRead(client, 'a', () => held.promise);
    const b = withJpRead(client, 'b', () => held.promise);
    const c = withJpRead(client, 'c', work);
    expect(work).not.toHaveBeenCalled();
    expect(await withJpRead(other, 'd', async () => 4)).toBe(4);
    held.release();
    await Promise.all([a, b]);
    expect(await c).toBe(3);
  });

  it('keeps FIFO order and releases a slot even when work fails', async () => {
    const queue = new JpReadAdmission(1),
      held = latch(),
      order: number[] = [];
    const first = queue.run('a', () => held.promise);
    const second = queue.run('b', async () => {
      order.push(2);
      throw Error('read failed');
    });
    const failure = expect(second).rejects.toThrow('read failed');
    const third = queue.run('c', async () => {
      order.push(3);
      return 3;
    });
    held.release();
    await first;
    await failure;
    expect(await third).toBe(3);
    expect(order).toEqual([2, 3]);
    expect(await queue.run('a', async () => 4)).toBe(4);
  });

  it('does not execute stale queued work after its wait budget expires', async () => {
    jest.useFakeTimers();
    const queue = new JpReadAdmission(1, 2, 20),
      held = latch(),
      work = jest.fn(async () => 1);
    const first = queue.run('a', () => held.promise);
    const second = queue.run('b', work);
    const rejected = expect(second).rejects.toMatchObject({ response: { code: 'JP_READ_BUSY' } });
    await jest.advanceTimersByTimeAsync(21);
    await rejected;
    held.release();
    await first;
    expect(work).not.toHaveBeenCalled();
    expect(await queue.run('b', async () => 2)).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds total and per-account waiting without consuming another account slot', async () => {
    const queue = new JpReadAdmission(1, 2, 15_000, 2),
      held = latch();
    const first = queue.run('a', () => held.promise);
    const second = queue.run('a', async () => 2);
    await expect(queue.run('a', async () => 3)).rejects.toMatchObject({
      response: { code: 'JP_READ_BUSY' },
    });
    const other = queue.run('b', async () => 4);
    await expect(queue.run('c', async () => 5)).rejects.toMatchObject({
      response: { code: 'JP_READ_BUSY' },
    });
    held.release();
    await first;
    expect(await second).toBe(2);
    expect(await other).toBe(4);
    expect(await queue.run('c', async () => 5)).toBe(5);
  });

  it.each([
    [0, 1, 1, 1],
    [1, -1, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
  ])(
    'rejects invalid admission configuration %s/%s/%s/%s',
    (concurrency, waiting, wait, principal) =>
      expect(() => new JpReadAdmission(concurrency, waiting, wait, principal)).toThrow(
        'Invalid JP',
      ),
  );
});
