import { ServiceUnavailableException } from '@nestjs/common';
import {
  assessmentWritesActive,
  assessmentWritesBusy,
  assessmentWritesWaiting,
} from '../metrics/counters';

interface WaitingWrite {
  key: string;
  start: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Bound database admission without weakening transaction/ownership locks. */
export class AssessmentWriteAdmission {
  private active = 0;
  private readonly waiting: WaitingWrite[] = [];
  private readonly perKey = new Map<string, number>();

  constructor(
    private readonly concurrency = 4,
    private readonly maxWaiting = 700,
    private readonly waitMs = 15_000,
    private readonly maxPerKey = 2,
  ) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(maxWaiting) ||
      maxWaiting < 0 ||
      waitMs < 1 ||
      !Number.isInteger(maxPerKey) ||
      maxPerKey < 1
    )
      throw new Error('Invalid assessment admission limits');
  }

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    if ((this.perKey.get(key) ?? 0) >= this.maxPerKey) throw this.busy();
    if (this.active >= this.concurrency && this.waiting.length >= this.maxWaiting)
      throw this.busy();
    this.perKey.set(key, (this.perKey.get(key) ?? 0) + 1);
    try {
      if (this.active >= this.concurrency) await this.acquire(key);
      else {
        this.active++;
        assessmentWritesActive.inc();
      }
    } catch (error) {
      this.releaseKey(key);
      throw error;
    }
    try {
      return await work();
    } finally {
      this.releaseKey(key);
      const next = this.waiting.shift();
      if (next) {
        assessmentWritesWaiting.dec();
        clearTimeout(next.timer);
        // Transfer the occupied slot directly; new arrivals cannot overtake it.
        next.start();
      } else {
        this.active--;
        assessmentWritesActive.dec();
      }
    }
  }

  private acquire(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item: WaitingWrite = {
        key,
        start: resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(item);
          if (index !== -1) {
            this.waiting.splice(index, 1);
            assessmentWritesWaiting.dec();
            reject(this.busy());
          }
        }, this.waitMs),
      };
      this.waiting.push(item);
      assessmentWritesWaiting.inc();
    });
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
