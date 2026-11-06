import { performance } from 'node:perf_hooks';
import { JpReadAdmission } from '../attendance/jp-read-admission';
import { AssessmentWriteAdmission } from '../assessment/assessment-write-admission';
import {
  assessmentWritesActive,
  assessmentWritesWaiting,
  assessmentWritesBusy,
} from '../metrics/counters';

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function blockLoop(ms: number) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* Delay timers while promises can resume first. */
  }
}

describe.each([
  ['JP', () => new JpReadAdmission(1, 10, 20, 2)],
  ['assessment', () => new AssessmentWriteAdmission(1, 10, 20, 2)],
] as const)('%s absolute admission deadline', (_name, create) => {
  it('rejects expired work even when its timer callback has not run', async () => {
    const gate = create(),
      held = latch(),
      work = jest.fn(async () => 1);
    const first = gate.run('active', () => held.promise);
    const waiting = gate.run('queued', work);
    const rejection = expect(waiting).rejects.toMatchObject({ status: 503 });
    blockLoop(45);
    held.release();
    await first;
    await rejection;
    expect(work).not.toHaveBeenCalled();
    await expect(gate.run('queued', async () => 2)).resolves.toBe(2);
  });

  it('skips multiple expired items then gives the slot to live work in FIFO order', async () => {
    const gate = create(),
      held = latch(),
      stale = jest.fn(async () => 0),
      order: number[] = [];
    const first = gate.run('active', () => held.promise);
    const a = gate.run('expired', stale),
      b = gate.run('expired', stale);
    const rejectA = expect(a).rejects.toMatchObject({ status: 503 });
    const rejectB = expect(b).rejects.toMatchObject({ status: 503 });
    blockLoop(45);
    const c = gate.run('live', async () => {
      order.push(1);
      return 1;
    });
    const d = gate.run('live', async () => {
      order.push(2);
      return 2;
    });
    held.release();
    await Promise.all([first, rejectA, rejectB]);
    expect(await c).toBe(1);
    expect(await d).toBe(2);
    expect(order).toEqual([1, 2]);
    expect(stale).not.toHaveBeenCalled();
    await expect(gate.run('expired', async () => 3)).resolves.toBe(3);
  });

  it('releases slots and account quotas after an expired queue and a live failure', async () => {
    const gate = create(),
      held = latch();
    const first = gate.run('active', () => held.promise);
    const stale = gate.run('same', async () => 0);
    const rejected = expect(stale).rejects.toMatchObject({ status: 503 });
    blockLoop(45);
    const failed = gate.run('same', async () => {
      throw Error('synthetic work failure');
    });
    const failure = expect(failed).rejects.toThrow('synthetic work failure');
    held.release();
    await Promise.all([first, rejected, failure]);
    await expect(gate.run('same', async () => 9)).resolves.toBe(9);
  });

  it('does not extend a deadline when the wall clock moves backwards', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    const gate = create(),
      held = latch(),
      work = jest.fn(async () => 1);
    try {
      const first = gate.run('active', () => held.promise);
      const waiting = gate.run('queued', work);
      const rejected = expect(waiting).rejects.toMatchObject({ status: 503 });
      blockLoop(45);
      held.release();
      await Promise.all([first, rejected]);
      expect(work).not.toHaveBeenCalled();
    } finally {
      held.release();
      clock.mockRestore();
    }
  });
});

it('settles assessment queue/active gauges once and counts each rejected expired item once', async () => {
  const before = (await assessmentWritesBusy.get()).values[0]?.value ?? 0;
  const gate = new AssessmentWriteAdmission(1, 4, 20),
    held = latch();
  const first = gate.run('active', () => held.promise);
  const a = gate.run('a', async () => 1),
    b = gate.run('b', async () => 2);
  const ra = expect(a).rejects.toMatchObject({ status: 503 }),
    rb = expect(b).rejects.toMatchObject({ status: 503 });
  blockLoop(45);
  held.release();
  await Promise.all([first, ra, rb]);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect((await assessmentWritesActive.get()).values[0]?.value).toBe(0);
  expect((await assessmentWritesWaiting.get()).values[0]?.value).toBe(0);
  expect((await assessmentWritesBusy.get()).values[0]?.value).toBe(before + 2);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY])(
  'rejects unbounded assessment wait budget %s',
  (wait) => {
    expect(() => new AssessmentWriteAdmission(1, 1, wait)).toThrow('Invalid assessment');
  },
);
