import { AssessmentWriteAdmission } from '../assessment/assessment-write-admission';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('assessment database admission', () => {
  it('bounds simultaneous work and serves FIFO before new arrivals', async () => {
    const gate = new AssessmentWriteAdmission(1, 3, 1000);
    const hold = deferred();
    const order: string[] = [];
    const a = gate.run('a', async () => {
      order.push('a');
      await hold.promise;
    });
    const b = gate.run('b', async () => {
      order.push('b');
    });
    const c = gate.run('c', async () => {
      order.push('c');
    });
    expect(order).toEqual(['a']);
    hold.resolve();
    await Promise.all([a, b, c]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('never executes a queue item after its admission deadline', async () => {
    jest.useFakeTimers();
    try {
      const gate = new AssessmentWriteAdmission(1, 1, 20);
      const hold = deferred(),
        work = jest.fn(async () => 1);
      const a = gate.run('a', () => hold.promise);
      const b = gate.run('b', work);
      const rejected = expect(b).rejects.toMatchObject({ status: 503 });
      await jest.advanceTimersByTimeAsync(21);
      await rejected;
      hold.resolve();
      await a;
      expect(work).not.toHaveBeenCalled();
      await expect(gate.run('b', work)).resolves.toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('bounds queue size, isolates users and releases slots on failure', async () => {
    const gate = new AssessmentWriteAdmission(1, 1, 1000);
    const hold = deferred();
    const a = gate.run('a', () => hold.promise);
    const b = gate.run('b', async () => {
      throw new Error('db failure');
    });
    const rejected = expect(b).rejects.toThrow('db failure');
    await expect(gate.run('c', async () => 1)).rejects.toMatchObject({ status: 503 });
    hold.resolve();
    await a;
    await rejected;
    await expect(gate.run('c', async () => 2)).resolves.toBe(2);
  });

  it('one user cannot occupy the whole queue', async () => {
    const gate = new AssessmentWriteAdmission(1, 5, 1000);
    const hold = deferred();
    const a = gate.run('a', () => hold.promise);
    const b = gate.run('a', async () => 1);
    await expect(gate.run('a', async () => 2)).rejects.toMatchObject({ status: 503 });
    const other = gate.run('other', async () => 3);
    hold.resolve();
    await a;
    expect(await b).toBe(1);
    expect(await other).toBe(3);
  });

  it('completes350distinct users without exceeding the connection admission budget', async () => {
    const gate = new AssessmentWriteAdmission();
    let active = 0,
      peak = 0;
    const result = await Promise.all(
      Array.from({ length: 350 }, (_, i) =>
        gate.run('student-' + i, async () => {
          active++;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active--;
          return i;
        }),
      ),
    );
    expect(peak).toBe(4);
    expect(new Set(result).size).toBe(350);
  });
});
