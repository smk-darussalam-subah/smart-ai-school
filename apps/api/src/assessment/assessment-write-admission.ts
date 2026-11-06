import { ServiceUnavailableException } from '@nestjs/common';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  assessmentWritesActive,
  assessmentWritesBusy,
  assessmentWritesWaiting,
} from '../metrics/counters';

interface WaitingWrite {
  key: string;
  start: () => void;
  reject: (error: Error) => void;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
}

/** Bound database admission without weakening transaction/ownership locks. */
export class AssessmentWriteAdmission {
  private active = 0;
  private readonly waiting: WaitingWrite[] = [];
  private readonly perKey = new Map<string, number>();

  constructor(
    // Small hosts must leave capacity for identity reads, heartbeats and JP
    // snapshots. Bigger hosts retain the existing ceiling of four writes.
    private readonly concurrency = Math.min(4, availableParallelism()),
    private readonly maxWaiting = 700,
    private readonly waitMs = 15_000,
    private readonly maxPerKey = 2,
  ) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(maxWaiting) ||
      maxWaiting < 0 ||
      !Number.isFinite(waitMs) ||
      waitMs < 1 ||
      !Number.isInteger(maxPerKey) ||
      maxPerKey < 1
    )
      throw new Error('Invalid assessment admission limits');
  }

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const deadline = performance.now() + this.waitMs;
    if ((this.perKey.get(key) ?? 0) >= this.maxPerKey) throw this.busy();
    if (this.active >= this.concurrency && this.waiting.length >= this.maxWaiting)
      throw this.busy();
    this.perKey.set(key, (this.perKey.get(key) ?? 0) + 1);
    try {
      if (this.active >= this.concurrency) await this.acquire(key, deadline);
      else {
        this.active++;
        assessmentWritesActive.inc();
      }
    } catch (error) {
      this.releaseKey(key);
      throw error;
    }
    try {
      if (performance.now() >= deadline) throw this.busy();
      return await work();
    } finally {
      this.releaseKey(key);
      this.releaseSlot();
    }
  }

  private acquire(key: string, deadline: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item: WaitingWrite = {
        key,
        start: resolve,
        reject,
        deadline,
        timer: setTimeout(
          () => {
            const index = this.waiting.indexOf(item);
            if (index !== -1) {
              this.waiting.splice(index, 1);
              assessmentWritesWaiting.dec();
              reject(this.busy());
            }
          },
          Math.max(0, deadline - performance.now()),
        ),
      };
      this.waiting.push(item);
      assessmentWritesWaiting.inc();
    });
  }

  private releaseSlot(): void {
    let next: WaitingWrite | undefined;
    while ((next = this.waiting.shift())) {
      assessmentWritesWaiting.dec();
      clearTimeout(next.timer);
      if (performance.now() >= next.deadline) {
        next.reject(this.busy());
        continue;
      }
      // Transfer the occupied slot directly; new arrivals cannot overtake it.
      next.start();
      return;
    }
    this.active--;
    assessmentWritesActive.dec();
  }

  private releaseKey(key: string): void {
    const remaining = (this.perKey.get(key) ?? 1) - 1;
    if (remaining === 0) this.perKey.delete(key);
    else this.perKey.set(key, remaining);
  }

  private busy(): ServiceUnavailableException {
    assessmentWritesBusy.inc();
    return new ServiceUnavailableException({
      message: 'Server sedang sibuk. Permintaan ini belum diproses; coba lagi sebentar.',
      code: 'ASSESSMENT_WRITE_BUSY',
      retryAfterSeconds: 2,
    });
  }
}
